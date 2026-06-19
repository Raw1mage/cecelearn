import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MECHANICAL_SUBJECTS,
  genForKp,
  genTallyItems,
  genNameItems,
  reposeFact,
  validate,
  type GenItem,
  type KpInfo,
  type StrandInfo,
} from './quizFramework.js'
import { QuizBankProvider, type QuizServeItem } from './quizBankProvider.js'
import { QuizIconProvider } from './quizIconProvider.js'
import { GenBank, type QuizRow } from './genbank.js'

/**
 * QuizGenProvider —— 全科 runtime 動態生題。沒有死題庫。
 *
 *  - 機制科（國/數/英）：從 curriculum 知識點骨架抽 kp，當場生、viz 安全網把關。
 *  - 事實科（自然/社會）：從事實種子池（quizBank）取「已確認的事實」，重新包裝成新選擇題，
 *    答案釘死、只變選項與語句；重包裝失敗就退回種子原題（最差也是審過的題）。
 *
 * 共用同一份題型框架 quizFramework，所以契約與安全網只此一份。
 */

function loadCurriculum(): { strands: Array<StrandInfo & { units: Array<{ knowledgePoints: KpInfo[] }> }> } | null {
  try {
    const dir = dirname(fileURLToPath(import.meta.url))
    return JSON.parse(readFileSync(resolve(dir, '../../data/curriculum.json'), 'utf-8'))
  } catch (e) {
    console.warn('[QuizGen] curriculum.json 載入失敗:', e instanceof Error ? e.message : e)
    return null
  }
}

/** count 分配到 KP 上：洗牌後 round-robin，總和＝count（KP 不足則重複抽）。 */
function distribute(kps: KpInfo[], count: number): Map<KpInfo, number> {
  const shuffled = [...kps]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]
  }
  const assign = new Map<KpInfo, number>()
  for (let i = 0; i < count; i++) {
    const kp = shuffled[i % shuffled.length]!
    assign.set(kp, (assign.get(kp) ?? 0) + 1)
  }
  return assign
}

function toServe(q: GenItem, subject: string): QuizServeItem {
  const out: QuizServeItem = {
    id: q.qId,
    subject,
    type: q.type,
    stem: q.stem,
    answer: q.answer,
    steps: q.explain.steps,
  }
  if (q.acceptableAnswers?.length) out.acceptableAnswers = q.acceptableAnswers
  if (q.choices?.length) out.choices = q.choices
  if (q.explain.viz) out.viz = q.explain.viz as QuizServeItem['viz']
  return out
}

/** 累積層 QuizRow → 前端 QuizServeItem（攤平 JSON 欄位）。 */
function rowToServe(r: QuizRow): QuizServeItem {
  const out: QuizServeItem = {
    id: r.q_id,
    subject: r.subject,
    type: r.type as QuizServeItem['type'],
    stem: r.stem,
    answer: r.answer,
    steps: r.steps ? (JSON.parse(r.steps) as string[]) : [],
  }
  if (r.acceptable_answers) out.acceptableAnswers = JSON.parse(r.acceptable_answers) as string[]
  if (r.choices) out.choices = JSON.parse(r.choices) as string[]
  if (r.viz) out.viz = JSON.parse(r.viz) as QuizServeItem['viz']
  return out
}

let reqSeq = 0

export class QuizGenProvider {
  private apiKeys: string[]
  private quizBank: QuizBankProvider // 事實種子池
  private iconProvider?: QuizIconProvider // 單元物件插畫圖庫（複合生圖）
  private genBank?: GenBank // 統一 token 產物累積層（題庫 bank-first/rotation）
  private strands = new Map<string, StrandInfo & { kps: KpInfo[] }>() // 機制科 key: subject|grade
  private subjectName = new Map<string, string>()
  private kpIds = new Set<string>()
  /** 機制科 bank-first 門檻：庫存 >= 此數才純從庫抽、不呼 Gemini。 */
  private static readonly BANK_FIRST_MIN = 30

  constructor(apiKeys: string[], quizBank: QuizBankProvider, iconProvider?: QuizIconProvider, genBank?: GenBank) {
    this.apiKeys = apiKeys
    this.quizBank = quizBank
    this.iconProvider = iconProvider
    this.genBank = genBank
    const cur = loadCurriculum()
    for (const s of cur?.strands ?? []) {
      this.subjectName.set(s.subject, s.subjectName)
      if (!MECHANICAL_SUBJECTS.has(s.subject)) continue
      const kps: KpInfo[] = []
      for (const u of s.units) for (const kp of u.knowledgePoints) { kps.push(kp); this.kpIds.add(kp.kpId) }
      this.strands.set(`${s.subject}|${s.grade}`, { subject: s.subject, subjectName: s.subjectName, grade: s.grade, kps })
    }
    console.log(`[QuizGen] runtime 生題就緒：機制科 ${this.strands.size} 組科級、事實科走種子池`)
  }

  /** 可出題範圍：機制科（curriculum）＋ 事實科（種子池）。 */
  meta(): Array<{ subject: string; subjectName: string; grade: string; count: number }> {
    const mech = [...this.strands.values()].map((s) => ({
      subject: s.subject, subjectName: s.subjectName, grade: s.grade, count: s.kps.length,
    }))
    return [...mech, ...this.quizBank.meta()].sort(
      (a, b) => a.subject.localeCompare(b.subject) || a.grade.localeCompare(b.grade),
    )
  }

  /** 動態生 count 題。機制科→知識點生；事實科→種子重包裝（失敗退回原種子）。 */
  async generate(subject: string, grade: string, count: number): Promise<QuizServeItem[]> {
    const nonce = `r${++reqSeq}-`

    if (MECHANICAL_SUBJECTS.has(subject)) {
      const strand = this.strands.get(`${subject}|${grade}`)
      if (!strand || strand.kps.length === 0) return []

      // bank-first：庫存足夠就純從累積層抽（rotation by reuse_count），零 token。
      if (this.genBank && this.genBank.quizCount(subject, grade) >= QuizGenProvider.BANK_FIRST_MIN) {
        const rows = this.genBank.drawQuiz(subject, grade, count)
        if (rows.length >= count) {
          this.genBank.bumpQuizReuse(rows.map((r) => r.id))
          const served = rows.map((r) => rowToServe(r))
          return await this.enrichIcons(served)
        }
        // 庫存數字夠但實抽不足（極端）→ 落到生成路徑補
      }

      // 生成路徑：確定性模板（tally/name，零 token）或 Gemini（其他）；生完回存累積層。
      const assign = distribute(strand.kps, count)
      const batches = await Promise.all(
        [...assign.entries()].map(async ([kp, n]) => {
          try {
            // 數數量題（vizKind=tally）走確定性模板，不呼叫 Gemini——數量由程式保證 = 答案。
            if (kp.vizKind === 'tally') {
              return genTallyItems(kp, strand, n, nonce).filter((q) => validate(q, this.kpIds).length === 0)
            }
            // 看圖說物件題（vizKind=name）走確定性模板——圖(emoji)與答案同源，永遠一致。
            if (kp.vizKind === 'name') {
              return genNameItems(kp, strand, n, nonce).filter((q) => validate(q, this.kpIds).length === 0)
            }
            const { items } = await genForKp(this.apiKeys, kp, strand, n, nonce)
            return items.filter((q) => validate(q, this.kpIds).length === 0)
          } catch (e) {
            console.warn(`[QuizGen] ${kp.kpId} 生題失敗:`, e instanceof Error ? e.message : e)
            return []
          }
        }),
      )
      const items = batches.flat()
      this.writeBackQuiz(items, subject, grade) // 累積：生成物回存供再利用（dedupe by stem）
      const served = items.map((q) => toServe(q, subject))
      return await this.enrichIcons(served)
    }

    // 事實科：取種子 → 重新包裝（釘答案）→ 失敗退回原種子題
    const seeds = this.quizBank.serve({ subject, grade, count })
    if (seeds.length === 0) return []
    const strand: StrandInfo = { subject, subjectName: this.subjectName.get(subject) ?? subject, grade }
    return Promise.all(
      seeds.map(async (seed, i) => {
        const re = await reposeFact(this.apiKeys, { stem: seed.stem, answer: seed.answer }, strand, `${nonce}${i}`, `${subject}-fact`)
        return re ? toServe(re, subject) : seed
      }),
    )
  }

  /**
   * 補單元物件插畫：對 viz 帶 iconKey 的題（tally/name），向 iconProvider 取 iconUrl 掛上去。
   * 取得失敗（無圖庫、生圖失敗）→ 不掛 iconUrl，前端退 emoji floor（既有確定性渲染，非 silent fallback）。
   * 數量正確性與圖無關——always 由 viz.count 程式 tile 保證。
   */
  private async enrichIcons(items: QuizServeItem[]): Promise<QuizServeItem[]> {
    if (!this.iconProvider) return items
    await Promise.all(
      items.map(async (item) => {
        const viz = item.viz as { iconKey?: string; iconUrl?: string } | undefined
        if (!viz?.iconKey || viz.iconUrl) return
        try {
          const url = await this.iconProvider!.iconUrlFor(viz.iconKey)
          if (url) viz.iconUrl = url
        } catch (e) {
          console.warn(`[QuizGen] icon 取得失敗 (${viz.iconKey}):`, e instanceof Error ? e.message : e)
        }
      }),
    )
    return items
  }

  /**
   * 把剛生成的機制科題回存累積層（dedupe by stem，已存在則跳過）。
   * 不阻塞回應——回存失敗只 log。viz 不存 iconUrl（runtime 解析，避免 URL 過期），只存題本身。
   */
  private writeBackQuiz(items: GenItem[], subject: string, grade: string): void {
    if (!this.genBank || items.length === 0) return
    try {
      for (const q of items) {
        // 回存 viz 時剝掉 iconUrl（runtime 動態解析），保留 iconKey/結構
        let viz = q.explain.viz as Record<string, unknown> | undefined
        if (viz && 'iconUrl' in viz) { const { iconUrl: _drop, ...rest } = viz; viz = rest }
        this.genBank.insertQuiz({
          qId: q.qId,
          subject,
          grade,
          kpId: q.kpId,
          type: q.type,
          stem: q.stem,
          answer: q.answer,
          acceptableAnswers: q.acceptableAnswers,
          choices: q.choices,
          steps: q.explain.steps,
          viz,
          sourceModel: q.source,
          reviewed: q.reviewed,
        })
      }
    } catch (e) {
      console.warn('[QuizGen] 題庫回存失敗:', e instanceof Error ? e.message : e)
    }
  }
}
