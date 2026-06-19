import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MECHANICAL_SUBJECTS,
  genForKp,
  reposeFact,
  validate,
  type GenItem,
  type KpInfo,
  type StrandInfo,
} from './quizFramework.js'
import { QuizBankProvider, type QuizServeItem } from './quizBankProvider.js'

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
  if (q.choices?.length) out.choices = q.choices
  if (q.explain.viz) out.viz = q.explain.viz as QuizServeItem['viz']
  return out
}

let reqSeq = 0

export class QuizGenProvider {
  private apiKeys: string[]
  private quizBank: QuizBankProvider // 事實種子池
  private strands = new Map<string, StrandInfo & { kps: KpInfo[] }>() // 機制科 key: subject|grade
  private subjectName = new Map<string, string>()
  private kpIds = new Set<string>()

  constructor(apiKeys: string[], quizBank: QuizBankProvider) {
    this.apiKeys = apiKeys
    this.quizBank = quizBank
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
      const assign = distribute(strand.kps, count)
      const batches = await Promise.all(
        [...assign.entries()].map(async ([kp, n]) => {
          try {
            const { items } = await genForKp(this.apiKeys, kp, strand, n, nonce)
            return items.filter((q) => validate(q, this.kpIds).length === 0)
          } catch (e) {
            console.warn(`[QuizGen] ${kp.kpId} 生題失敗:`, e instanceof Error ? e.message : e)
            return []
          }
        }),
      )
      return batches.flat().map((q) => toServe(q, subject))
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
}
