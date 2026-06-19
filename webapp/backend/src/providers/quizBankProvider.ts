import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * QuizBankProvider —— 出題（學科練習）資料源。
 *
 * 讀 data/quizbank.json（生題器 scripts/gen-quizbank.mjs 的產物）＋ data/curriculum.json
 * （知識點骨架），依 subject/grade 抽題，回前端友善形狀。題目本身是生成物（source=
 * generated:*），這裡只負責挑選與整形，不生新題、不夾帶第三方原文。
 */

/** quizbank.json 單題（對齊 curriculum.schema.json 的 QuizItem） */
type BankItem = {
  qId: string
  kpId: string
  type: 'fill' | 'choice' | 'make_word' | 'read_aloud'
  stem: string
  answer: string
  /** 所有應判定為正確的等價寫法（含單位變體、換算）；判題比對命中任一即算對。 */
  acceptableAnswers?: string[]
  choices?: string[]
  explain: { steps: string[]; viz?: Record<string, unknown> }
  source: string
  reviewed?: boolean
}

/** 回前端的單題（攤平 explain，附 subject 供標籤/朗讀判斷） */
export type QuizServeItem = {
  id: string
  subject: string
  type: BankItem['type']
  stem: string
  answer: string
  /** 所有應判定為正確的等價寫法（含單位變體、換算）；判題比對命中任一即算對。 */
  acceptableAnswers?: string[]
  choices?: string[]
  steps: string[]
  viz?: Record<string, unknown>
}

type KpMeta = { subject: string; subjectName: string; grade: string }

function loadJson<T>(relativePath: string): T | null {
  try {
    const dir = dirname(fileURLToPath(import.meta.url))
    return JSON.parse(readFileSync(resolve(dir, relativePath), 'utf-8')) as T
  } catch (error) {
    console.warn(`[QuizBank] 載入失敗 ${relativePath}:`, error instanceof Error ? error.message : error)
    return null
  }
}

export class QuizBankProvider {
  private bank: BankItem[] = []
  private kpMeta = new Map<string, KpMeta>()

  constructor() {
    this.reload()
  }

  /** （重）載入資料；部署時資料檔換新可重啟即生效。 */
  reload(): void {
    this.bank = loadJson<BankItem[]>('../../data/quizbank.json') ?? []
    const curriculum = loadJson<{ strands: Array<{ subject: string; subjectName: string; grade: string; units: Array<{ knowledgePoints: Array<{ kpId: string }> }> }> }>('../../data/curriculum.json')
    this.kpMeta.clear()
    for (const s of curriculum?.strands ?? []) {
      for (const u of s.units) {
        for (const kp of u.knowledgePoints) {
          this.kpMeta.set(kp.kpId, { subject: s.subject, subjectName: s.subjectName, grade: s.grade })
        }
      }
    }
    console.log(`[QuizBank] 載入 ${this.bank.length} 題、${this.kpMeta.size} 個知識點`)
  }

  /** 哪些（科目×年級）真的有題目——給前端 setup 只列有料的範圍。 */
  meta(): Array<{ subject: string; subjectName: string; grade: string; count: number }> {
    const tally = new Map<string, { subject: string; subjectName: string; grade: string; count: number }>()
    for (const item of this.bank) {
      const m = this.kpMeta.get(item.kpId)
      if (!m) continue
      const key = `${m.subject}|${m.grade}`
      const cur = tally.get(key) ?? { subject: m.subject, subjectName: m.subjectName, grade: m.grade, count: 0 }
      cur.count += 1
      tally.set(key, cur)
    }
    return [...tally.values()].sort((a, b) => a.subject.localeCompare(b.subject) || a.grade.localeCompare(b.grade))
  }

  /** 依 subject/grade 抽 count 題（隨機、含答案；前端負責出題、批改、不先洩答案）。 */
  serve(opts: { subject?: string; grade?: string; count: number }): QuizServeItem[] {
    const pool = this.bank.filter((item) => {
      const m = this.kpMeta.get(item.kpId)
      if (!m) return false
      if (opts.subject && m.subject !== opts.subject) return false
      if (opts.grade && m.grade !== opts.grade) return false
      return true
    })
    // Fisher–Yates 洗牌（後端可用 Math.random）
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j]!, pool[i]!]
    }
    return pool.slice(0, Math.max(1, opts.count)).map((item) => {
      const m = this.kpMeta.get(item.kpId)!
      const out: QuizServeItem = {
        id: item.qId,
        subject: m.subject,
        type: item.type,
        stem: item.stem,
        answer: item.answer,
        steps: item.explain?.steps ?? [],
      }
      if (item.acceptableAnswers?.length) out.acceptableAnswers = item.acceptableAnswers
      if (item.choices?.length) out.choices = item.choices
      if (item.explain?.viz) out.viz = item.explain.viz
      return out
    })
  }
}
