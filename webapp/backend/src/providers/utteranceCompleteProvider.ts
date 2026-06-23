import type {
  UtteranceCompleteOptions,
  UtteranceCompleteProvider,
  UtteranceCompleteResponse,
} from '../contracts/providers.js'

/* ────────────────────────────────────────────────────────────────────────
 * 語音「這句話講完了嗎」判定器（utteranceCompleteProvider）
 *
 * 背景：小朋友唸題目時逐字解碼、句中常停頓思考，瀏覽器 VAD 的靜默會被前端
 * 誤判成「講完了」而提早送半句。前端先用語言特徵規則快判（零成本零延遲）；
 * 只有「中性、拿不準」的句子在停頓超過一次短窗後，才升級打這個端點，由
 * Gemini 判斷孩子是「真的講完」還是「只是句中換氣、還沒講完」。
 *
 * 名詞（taxonomy）：
 *  - judge(text, options)：輸入＝目前累積到的辨識文字（半句或整句）與同段安靜重試次數；
 *      輸出＝{ complete: boolean }。complete=true 代表「語意完整、可以送出」；
 *      complete=false 代表「明顯還沒講完（懸著的連接詞、題目唸到一半…），請續聽」。
 *  - 不允許把它解讀成「內容對不對 / 要不要回答」——它只判「講完了沒」。
 *  - cache：Map<text+quietRepeatCount, complete> 同一段同一重試狀態只判一次（省 token）。
 *  - inflight：Map<text, Promise> 併發去重。
 *
 * 規則（天條 #11 fail-fast）：
 *  - 無 API key → 回 {ok:false, error:'UTTERANCE_UNAVAILABLE'}；前端不自行長窗兜底送出。
 *  - 上游失敗／空回 → 同樣顯式 {ok:false}，不臆測 complete 值。
 * ──────────────────────────────────────────────────────────────────────── */

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent'

const PROMPT = `你在幫一個正在用語音輸入的台灣國小小朋友（6-9 歲）判斷：他「這段話講完了沒」。

情境：小朋友把話講給「小雞老師」聽。可能是很短的指令（「用蘋果造句」「三乘七怎麼算」），也可能是把一整道習題或一整段文章逐句逐字唸出來（一道應用題、一段英文、一段課文，好幾句話、中間有逗號句號、邊唸邊想字停頓）。語音辨識邊聽邊出文字，你看到的可能是完整一段，也可能只是唸到一半。

你的工作就是老實、準確地判斷——不要偏向任何一邊：
- 已經是一個語意完整、可以處理的指令或問題（不論長短）→ complete=true。短指令「用蘋果造句」「五加三等於多少」一聽就知道講完了，就回 true，讓老師快點回應。
- 明顯還沒講完——結尾懸在連接詞或虛詞上（「然後」「因為」「所以」「還有」「的」「把」「和」「跟」「就是」），或語意斷在半句、像一道題目才唸到一半、後面顯然還有 → complete=false，讓他把話講完，不要截斷。
- 唸長題時要特別注意：中間出現一個句號或問號，可能只是整段裡的一句，後面還在鋪陳 → 這種還沒整段唸完的，complete=false。
- 真的拿不準時，稍微傾向 complete=false（多等一下不打斷），但不要把明顯講完的短指令也判成沒講完。

只回 JSON：{"complete": true} 或 {"complete": false}。

小朋友目前說的：{TEXT}`

const QUIET_PROMPT = `

補充訊號：這是同一段文字在「沒有新增語音」後第 {COUNT} 次重問。請把這視為孩子可能已經停下來的證據，但仍由你判斷：如果目前文字已足以處理，就回 complete=true；如果明顯仍是不完整半句，才繼續回 complete=false。`

const FORCE_COMPLETE_AFTER_QUIET_REPEATS = 1

let keyIndex = 0

export class UtteranceCompleteEngine implements UtteranceCompleteProvider {
  private apiKeys: string[]
  private cache = new Map<string, boolean>()
  private inflight = new Map<string, Promise<UtteranceCompleteResponse>>()

  constructor(apiKeys: string[] = []) {
    this.apiKeys = apiKeys
    if (apiKeys.length > 0) {
      console.log(`[UtteranceComplete] Gemini enabled with ${apiKeys.length} API key(s)`)
    } else {
      console.log('[UtteranceComplete] Gemini disabled (no API keys) — judge unavailable')
    }
  }

  async judge(text: string, options: UtteranceCompleteOptions = {}): Promise<UtteranceCompleteResponse> {
    const clean = (text ?? '').trim()
    const quietRepeatCount = Math.max(0, Math.min(10, Math.floor(options.quietRepeatCount ?? 0)))
    if (!clean) {
      return { ok: false, error: 'UTTERANCE_BAD_INPUT', message: '沒有要判斷的內容。' }
    }

    const cacheKey = `${quietRepeatCount}\n${clean}`
    const cached = this.cache.get(cacheKey)
    if (cached !== undefined) {
      return { ok: true, complete: cached }
    }

    const existing = this.inflight.get(cacheKey)
    if (existing) return existing

    const task = this.fetchJudge(clean, quietRepeatCount)
    this.inflight.set(cacheKey, task)
    try {
      return await task
    } finally {
      this.inflight.delete(cacheKey)
    }
  }

  private async fetchJudge(text: string, quietRepeatCount: number): Promise<UtteranceCompleteResponse> {
    if (quietRepeatCount >= FORCE_COMPLETE_AFTER_QUIET_REPEATS) {
      this.cache.set(`${quietRepeatCount}\n${text}`, true)
      console.log(
        `[UtteranceComplete] force-complete after quietRepeat=${quietRepeatCount} len=${text.length}`,
      )
      return { ok: true, complete: true }
    }

    if (this.apiKeys.length === 0) {
      return { ok: false, error: 'UTTERANCE_UNAVAILABLE', message: '判斷功能還沒準備好。' }
    }

    const prompt = PROMPT.replace('{TEXT}', text) + (quietRepeatCount > 0 ? QUIET_PROMPT.replace('{COUNT}', String(quietRepeatCount)) : '')
    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: { complete: { type: 'BOOLEAN' } },
          required: ['complete'],
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
          // 付費 key（gen-lang-client-0857568615）的 flash-lite p50≈0.9s、尾端常 3s+，
          // 900ms 過緊會把多數正常回應自己 abort 成 UTTERANCE_UPSTREAM 502。放寬到 3.5s
          // 容得下付費 key 絕大多數回應；真的更慢才視為上游失敗，由前端安全網接手。
          signal: AbortSignal.timeout(3500),
          body,
        })

        if (res.status === 429) {
          console.warn(`[UtteranceComplete] key #${idx} rate-limited, trying next`)
          continue
        }

        keyIndex = (idx + 1) % this.apiKeys.length

        if (!res.ok) {
          console.warn(`[UtteranceComplete] HTTP ${res.status}`)
          return { ok: false, error: 'UTTERANCE_UPSTREAM', message: '判斷暫時不可用。' }
        }

        const data = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[]
        }
        const out = data.candidates?.[0]?.content?.parts?.[0]?.text
        if (!out) {
          return { ok: false, error: 'UTTERANCE_EMPTY', message: '判斷暫時不可用。' }
        }

        const parsed = JSON.parse(out) as { complete?: boolean }
        if (typeof parsed.complete !== 'boolean') {
          return { ok: false, error: 'UTTERANCE_EMPTY', message: '判斷暫時不可用。' }
        }

        this.cache.set(`${quietRepeatCount}\n${text}`, parsed.complete)
        console.log(
          `[UtteranceComplete] judge len=${text.length} quietRepeat=${quietRepeatCount} complete=${parsed.complete} key=#${idx}`,
        )
        return { ok: true, complete: parsed.complete }
      } catch (error) {
        console.warn(
          `[UtteranceComplete] key #${idx} failed:`,
          error instanceof Error ? error.message : error,
        )
        continue
      }
    }

    console.warn('[UtteranceComplete] all keys exhausted')
    return { ok: false, error: 'UTTERANCE_UPSTREAM', message: '判斷暫時不可用。' }
  }
}
