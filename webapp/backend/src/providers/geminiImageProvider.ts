import type {
  A1ErrorResponse,
  A1IllustrateResponse,
  SceneIllustrationProvider,
} from '../contracts/providers.js'

/**
 * Nano Banana（Gemini 2.5 Flash Image）情境插畫 provider。
 * 走 generateContent，回傳 inlineData（base64 image part）。
 * fail-fast：失敗回 ErrorResponse，不給佔位圖（DD-8 no-silent-fallback）。
 */
const GEMINI_IMAGE_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent'

function buildPrompt(context: string, targetWord?: string, mode: 'scene' | 'diagram' = 'scene'): string {
  if (mode === 'diagram') {
    const focus = targetWord ? `這張圖要幫助理解：「${targetWord}」。` : ''
    return [
      '請畫一張適合 6-9 歲兒童的「教學示意圖／圖解」，幫助小朋友理解下面的講解。',
      '風格簡單清楚、色彩明亮可愛，用具體的東西（例如蘋果、積木、數線、分組、箭頭）把概念視覺化。',
      '畫面要正向、安全、適齡，不要嚇人或不適合兒童的內容；可有極少量必要的數字標示，但不要大段文字。',
      focus,
      `要圖解的內容：${context}`,
    ]
      .filter(Boolean)
      .join('\n')
  }
  const focus = targetWord ? `重點呈現「${targetWord}」的情境。` : ''
  return [
    '請畫一張適合 6-9 歲兒童的插畫，風格溫暖、可愛、色彩明亮，像兒童繪本或貼紙插圖。',
    '畫面要正向、安全、適齡，不要文字、不要嚇人或不適合兒童的內容。',
    focus,
    `情境內容：${context}`,
  ]
    .filter(Boolean)
    .join('\n')
}

function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...fields, ts: Date.now() }))
}

/* round-robin key index（與 chat provider 各自獨立計數） */
let keyIndex = 0

export class GeminiImageProvider implements SceneIllustrationProvider {
  private apiKeys: string[]

  constructor(apiKeys: string[] = []) {
    this.apiKeys = apiKeys
    if (apiKeys.length > 0) {
      console.log(`[GeminiImageProvider] enabled with ${apiKeys.length} API key(s)`)
    } else {
      console.log('[GeminiImageProvider] disabled (no API keys)')
    }
  }

  async illustrate(
    context: string,
    targetWord?: string,
    mode: 'scene' | 'diagram' = 'scene',
  ): Promise<A1IllustrateResponse | A1ErrorResponse> {
    const start = Date.now()
    log('a1.illustrate.request', { hasTarget: Boolean(targetWord), contextLen: context.length, mode })

    if (this.apiKeys.length === 0) {
      return {
        ok: false,
        error: 'ILLUSTRATE_NOT_CONFIGURED',
        message: '畫圖功能還在準備中喔！',
      }
    }
    if (!context.trim()) {
      return {
        ok: false,
        error: 'ILLUSTRATE_BAD_REQUEST',
        message: '我還不知道要畫什麼耶，先說一句話好嗎？',
      }
    }

    const body = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildPrompt(context, targetWord, mode) }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    })

    let lastUpstreamStatus = 0
    for (let attempt = 0; attempt < this.apiKeys.length; attempt++) {
      const idx = (keyIndex + attempt) % this.apiKeys.length
      const key = this.apiKeys[idx]
      try {
        const res = await fetch(`${GEMINI_IMAGE_URL}?key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(30000),
          body,
        })

        if (res.status === 429) {
          lastUpstreamStatus = 429
          console.warn(`[GeminiImageProvider] key #${idx} rate-limited, trying next`)
          continue
        }
        keyIndex = (idx + 1) % this.apiKeys.length

        if (!res.ok) {
          lastUpstreamStatus = res.status
          log('a1.illustrate.error', {
            code: 'ILLUSTRATE_UPSTREAM_ERROR',
            upstreamStatus: res.status,
            latencyMs: Date.now() - start,
          })
          return {
            ok: false,
            error: 'ILLUSTRATE_UPSTREAM_ERROR',
            message: '畫圖的時候卡住了，要不要再試一次？',
          }
        }

        const data = (await res.json()) as {
          candidates?: {
            content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] }
          }[]
        }
        const parts = data.candidates?.[0]?.content?.parts ?? []
        const imagePart = parts.find((p) => p.inlineData?.data)
        const inline = imagePart?.inlineData
        if (!inline?.data) {
          log('a1.illustrate.error', { code: 'ILLUSTRATE_EMPTY', latencyMs: Date.now() - start })
          return {
            ok: false,
            error: 'ILLUSTRATE_EMPTY',
            message: '這張圖我先畫不出來，我們先看句子好嗎？',
          }
        }

        const mimeType = inline.mimeType || 'image/png'
        log('a1.illustrate.ok', { latencyMs: Date.now() - start, bytes: inline.data.length })
        return {
          ok: true,
          imageDataUri: `data:${mimeType};base64,${inline.data}`,
          altText: targetWord ? `「${targetWord}」的情境插畫` : '情境插畫',
        }
      } catch (error) {
        console.warn(
          `[GeminiImageProvider] key #${idx} failed:`,
          error instanceof Error ? error.message : error,
        )
        lastUpstreamStatus = 0
        continue
      }
    }

    log('a1.illustrate.error', {
      code: 'ILLUSTRATE_UPSTREAM_ERROR',
      upstreamStatus: lastUpstreamStatus,
      latencyMs: Date.now() - start,
    })
    return {
      ok: false,
      error: 'ILLUSTRATE_UPSTREAM_ERROR',
      message: '畫圖的時候卡住了，要不要再試一次？',
    }
  }
}
