import { GoogleAuth } from 'google-auth-library'
import type {
  A1ErrorResponse,
  A1IllustrateResponse,
  SceneIllustrationProvider,
} from '../contracts/providers.js'

/**
 * Vertex AI 情境插畫 provider。
 * 模型同 Nano Banana（gemini-2.5-flash-image），但走 Vertex predict endpoint，
 * 以 service account 認證，計費落到 GCP project 的 GenAI/Cloud credit。
 * fail-fast：未配置 / 失敗一律回 ErrorResponse，不給佔位圖（DD-8 no-silent-fallback）。
 */

const VERTEX_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'

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

export type VertexImageConfig = {
  project: string
  location: string
  model: string
  /** service account key 檔的絕對路徑（GOOGLE_APPLICATION_CREDENTIALS 風格） */
  keyFile: string
}

export class VertexImageProvider implements SceneIllustrationProvider {
  private readonly config: VertexImageConfig
  private readonly auth: GoogleAuth
  private readonly endpoint: string

  constructor(config: VertexImageConfig) {
    this.config = config
    // GoogleAuth 自動處理 JWT 簽章、access token 取得與快取/refresh（解 1 小時過期）
    this.auth = new GoogleAuth({
      keyFile: config.keyFile,
      scopes: [VERTEX_SCOPE],
    })
    this.endpoint =
      `https://${config.location}-aiplatform.googleapis.com/v1/projects/${config.project}` +
      `/locations/${config.location}/publishers/google/models/${config.model}:generateContent`
    console.log(
      `[VertexImageProvider] enabled — project=${config.project} location=${config.location} model=${config.model}`,
    )
  }

  async illustrate(
    context: string,
    targetWord?: string,
    mode: 'scene' | 'diagram' = 'scene',
  ): Promise<A1IllustrateResponse | A1ErrorResponse> {
    const start = Date.now()
    log('a1.illustrate.request', {
      provider: 'vertex',
      hasTarget: Boolean(targetWord),
      contextLen: context.length,
      mode,
    })

    if (!context.trim()) {
      return {
        ok: false,
        error: 'ILLUSTRATE_BAD_REQUEST',
        message: '我還不知道要畫什麼耶，先說一句話好嗎？',
      }
    }

    let token: string | null | undefined
    try {
      const client = await this.auth.getClient()
      const accessToken = await client.getAccessToken()
      token = accessToken.token
    } catch (error) {
      log('a1.illustrate.error', {
        provider: 'vertex',
        code: 'ILLUSTRATE_AUTH_ERROR',
        detail: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - start,
      })
      return {
        ok: false,
        error: 'ILLUSTRATE_AUTH_ERROR',
        message: '畫圖的時候卡住了，要不要再試一次？',
      }
    }

    if (!token) {
      log('a1.illustrate.error', { provider: 'vertex', code: 'ILLUSTRATE_AUTH_EMPTY' })
      return {
        ok: false,
        error: 'ILLUSTRATE_AUTH_ERROR',
        message: '畫圖的時候卡住了，要不要再試一次？',
      }
    }

    const body = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildPrompt(context, targetWord, mode) }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    })

    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(30000),
        body,
      })

      if (!res.ok) {
        log('a1.illustrate.error', {
          provider: 'vertex',
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
        log('a1.illustrate.error', {
          provider: 'vertex',
          code: 'ILLUSTRATE_EMPTY',
          latencyMs: Date.now() - start,
        })
        return {
          ok: false,
          error: 'ILLUSTRATE_EMPTY',
          message: '這張圖我先畫不出來，我們先看句子好嗎？',
        }
      }

      const mimeType = inline.mimeType || 'image/png'
      log('a1.illustrate.ok', {
        provider: 'vertex',
        latencyMs: Date.now() - start,
        bytes: inline.data.length,
      })
      return {
        ok: true,
        imageDataUri: `data:${mimeType};base64,${inline.data}`,
        altText: targetWord ? `「${targetWord}」的情境插畫` : '情境插畫',
      }
    } catch (error) {
      log('a1.illustrate.error', {
        provider: 'vertex',
        code: 'ILLUSTRATE_UPSTREAM_ERROR',
        detail: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - start,
      })
      return {
        ok: false,
        error: 'ILLUSTRATE_UPSTREAM_ERROR',
        message: '畫圖的時候卡住了，要不要再試一次？',
      }
    }
  }
}
