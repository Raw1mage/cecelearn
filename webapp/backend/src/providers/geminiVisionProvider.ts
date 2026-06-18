import type {
  A1ErrorResponse,
  A1ReadQuestionResponse,
  QuestionVisionProvider,
} from '../contracts/providers.js'

/**
 * Gemini 多模態「拍照讀題」provider（OCR）。
 *
 * 小朋友對著試卷拍照 → 這裡用 gemini-2.5-flash 視覺辨識把題目「原文」抽成文字，
 * 再由前端餵回 chat()→explain 流程做講解。只做辨識、不做解題（解題交給既有 intent
 * 分類，避免兩套講解邏輯分岔）。
 *
 * 與 GeminiChatProvider 各自獨立 round-robin key index；429 自動換 key。
 * fail-fast：辨識不到題目回 ErrorResponse，不亂編題目（DD-8 no-silent-fallback）。
 */

const GEMINI_VISION_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

const OCR_PROMPT = [
  '這是一張小學考卷／作業的照片。請把照片裡「一道題目」的文字原原本本辨識出來。',
  '規則：',
  '- 只輸出題目本身的文字（保留英文、數字、符號、單位），不要加任何解說、答案或標點以外的內容。',
  '- 如果照片裡有多道題目，只輸出最主要／最完整的那一題。',
  '- 如果完全看不到題目文字，只輸出兩個字：無法辨識。',
].join('\n')

type GeminiCandidate = {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
}

function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...fields, ts: Date.now() }))
}

/* round-robin key index（與其他 Gemini provider 各自獨立計數） */
let keyIndex = 0

export class GeminiVisionProvider implements QuestionVisionProvider {
  private apiKeys: string[]

  constructor(apiKeys: string[] = []) {
    this.apiKeys = apiKeys
    if (apiKeys.length > 0) {
      console.log(`[GeminiVisionProvider] enabled with ${apiKeys.length} API key(s)`)
    } else {
      console.log('[GeminiVisionProvider] disabled (no API keys)')
    }
  }

  async readQuestion(
    imageBase64: string,
    mimeType: string,
  ): Promise<A1ReadQuestionResponse | A1ErrorResponse> {
    const start = Date.now()
    log('a1.readQuestion.request', { mimeType, bytes: imageBase64.length })

    if (this.apiKeys.length === 0) {
      return { ok: false, error: 'READ_NOT_CONFIGURED', message: '拍照讀題還在準備中喔！' }
    }
    if (!imageBase64.trim()) {
      return { ok: false, error: 'READ_BAD_REQUEST', message: '我沒看到照片耶，再拍一次好嗎？' }
    }

    const body = JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: OCR_PROMPT }, { inlineData: { mimeType, data: imageBase64 } }],
        },
      ],
      generationConfig: { responseMimeType: 'text/plain', temperature: 0 },
    })

    let lastUpstreamStatus = 0
    for (let attempt = 0; attempt < this.apiKeys.length; attempt++) {
      const idx = (keyIndex + attempt) % this.apiKeys.length
      const key = this.apiKeys[idx]
      try {
        const res = await fetch(`${GEMINI_VISION_URL}?key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(20000),
          body,
        })

        if (res.status === 429) {
          lastUpstreamStatus = 429
          console.warn(`[GeminiVisionProvider] key #${idx} rate-limited, trying next`)
          continue
        }
        keyIndex = (idx + 1) % this.apiKeys.length

        if (!res.ok) {
          lastUpstreamStatus = res.status
          const upstreamBody = await res.text().catch(() => '')
          log('a1.readQuestion.error', {
            code: 'READ_UPSTREAM_ERROR',
            upstreamStatus: res.status,
            upstreamBody: upstreamBody.slice(0, 400),
            latencyMs: Date.now() - start,
          })
          return { ok: false, error: 'READ_UPSTREAM_ERROR', message: '看題目的時候卡住了，再拍一次好嗎？' }
        }

        const data = (await res.json()) as GeminiCandidate
        const text = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
        if (!text || text === '無法辨識' || text.replace(/\s/g, '') === '無法辨識') {
          log('a1.readQuestion.error', { code: 'READ_NO_TEXT', latencyMs: Date.now() - start })
          return {
            ok: false,
            error: 'READ_NO_TEXT',
            message: '我看不太清楚題目耶，靠近一點、拍清楚一點再試一次好嗎？',
          }
        }

        log('a1.readQuestion.ok', { latencyMs: Date.now() - start, questionLen: text.length })
        return { ok: true, question: text }
      } catch (error) {
        console.warn(
          `[GeminiVisionProvider] key #${idx} failed:`,
          error instanceof Error ? error.message : error,
        )
        lastUpstreamStatus = 0
        continue
      }
    }

    log('a1.readQuestion.error', {
      code: 'READ_UPSTREAM_ERROR',
      upstreamStatus: lastUpstreamStatus,
      latencyMs: Date.now() - start,
    })
    return { ok: false, error: 'READ_UPSTREAM_ERROR', message: '看題目的時候卡住了，再拍一次好嗎？' }
  }
}
