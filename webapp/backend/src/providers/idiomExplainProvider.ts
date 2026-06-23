import type {
  A7ExplainResponse,
  IdiomExplainProvider,
} from '../contracts/providers.js'

/* ────────────────────────────────────────────────────────────────────────
 * 成語適齡解釋生成器（idiomExplainProvider）
 * 對齊 plans/a7_idiom_crossword/design.md DD-10：揭曉時按需查，Gemini 白話生成。
 *
 * 名詞（taxonomy）：
 *  - explain(idiom)：回傳 6–9 歲聽得懂的白話解釋（一兩句）。
 *  - cache：Map<idiom, meaning> 同一條成語只查一次（省 token，A7 零後端成本精神）。
 *  - inflight：Map<idiom, Promise> 併發去重，避免同一成語同時打多次 API。
 *
 * 規則：
 *  - 失敗顯式回 {ok:false}（不 silent fallback，天條 #11）；前端例句兜底由 UI 決定。
 *  - 無 API key → 直接回 EXPLAIN_UNAVAILABLE。
 * ──────────────────────────────────────────────────────────────────────── */

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent'

const PROMPT = `你是台灣國小低年級（6–9 歲）的國語老師。請用「小朋友聽得懂的白話」解釋這個成語的意思。

要求：
- 一到兩句話，口語、親切、具體。
- 不要用文言文、不要用更難的成語來解釋。
- 只解釋「意思」，不要附例句、不要附注音、不要重複成語本身當開頭。

成語：{IDIOM}`

let keyIndex = 0

export class IdiomExplainEngine implements IdiomExplainProvider {
  private apiKeys: string[]
  private cache = new Map<string, string>()
  private inflight = new Map<string, Promise<A7ExplainResponse>>()

  constructor(apiKeys: string[] = []) {
    this.apiKeys = apiKeys
    if (apiKeys.length > 0) {
      console.log(`[A7Explain] Gemini enabled with ${apiKeys.length} API key(s)`)
    } else {
      console.log('[A7Explain] Gemini disabled (no API keys) — explain unavailable')
    }
  }

  async explain(idiom: string): Promise<A7ExplainResponse> {
    const clean = (idiom ?? '').trim()
    if (!clean) {
      return { ok: false, error: 'EXPLAIN_BAD_INPUT', message: '沒有要解釋的成語喔！' }
    }

    // 快取命中
    const cached = this.cache.get(clean)
    if (cached !== undefined) {
      return { ok: true, idiom: clean, meaning: cached }
    }

    // 併發去重
    const existing = this.inflight.get(clean)
    if (existing) return existing

    const task = this.fetchExplain(clean)
    this.inflight.set(clean, task)
    try {
      return await task
    } finally {
      this.inflight.delete(clean)
    }
  }

  private async fetchExplain(idiom: string): Promise<A7ExplainResponse> {
    if (this.apiKeys.length === 0) {
      return { ok: false, error: 'EXPLAIN_UNAVAILABLE', message: '解釋功能還沒準備好喔！' }
    }

    const body = JSON.stringify({
      contents: [{ parts: [{ text: PROMPT.replace('{IDIOM}', idiom) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: { meaning: { type: 'STRING' } },
          required: ['meaning'],
        },
        thinkingConfig: { thinkingBudget: 0 },
      },
    })

    for (let attempt = 0; attempt < this.apiKeys.length; attempt++) {
      const idx = (keyIndex + attempt) % this.apiKeys.length
      const key = this.apiKeys[idx]
      try {
        const res = await fetch(`${GEMINI_URL}?key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5000),
          body,
        })

        if (res.status === 429) {
          console.warn(`[A7Explain] key #${idx} rate-limited, trying next`)
          continue
        }

        keyIndex = (idx + 1) % this.apiKeys.length

        if (!res.ok) {
          console.warn(`[A7Explain] HTTP ${res.status}`)
          return { ok: false, error: 'EXPLAIN_UPSTREAM', message: '解釋查不到，先看看例句吧！' }
        }

        const data = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[]
        }
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text
        if (!text) {
          return { ok: false, error: 'EXPLAIN_EMPTY', message: '解釋查不到，先看看例句吧！' }
        }

        const parsed = JSON.parse(text) as { meaning?: string }
        const meaning = parsed.meaning?.trim()
        if (!meaning) {
          return { ok: false, error: 'EXPLAIN_EMPTY', message: '解釋查不到，先看看例句吧！' }
        }

        this.cache.set(idiom, meaning)
        console.log(`[A7Explain] a7.explain idiom=${idiom} key=#${idx} len=${meaning.length}`)
        return { ok: true, idiom, meaning }
      } catch (error) {
        console.warn(
          `[A7Explain] key #${idx} failed:`,
          error instanceof Error ? error.message : error,
        )
        continue
      }
    }

    console.warn('[A7Explain] all keys exhausted')
    return { ok: false, error: 'EXPLAIN_UPSTREAM', message: '解釋查不到，先看看例句吧！' }
  }
}
