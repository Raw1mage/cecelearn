import { GoogleAuth } from 'google-auth-library'
import type {
  A1ErrorResponse,
  A1IllustrateResponse,
  SceneIllustrationProvider,
} from '../contracts/providers.js'
import { RETRYABLE_ILLUSTRATE } from './geminiImageProvider.js'

/**
 * Vertex AI Imagen 4 插畫 provider（cascade 的可靠後備層）。
 *
 * 與 GeminiImageProvider / VertexImageProvider 不同：Imagen 是**專門的文字→圖**模型，
 * 走 :predict endpoint，每次都回圖（除非被 RAI 過濾），不會像 Gemini 多模態那樣「自己
 * 決定回文字而不出圖」。因此特別適合當 cascade 第二層補空回。以 service account 認證，
 * 計費落 GCP credit。fail-fast：過濾/失敗回 ErrorResponse，不給佔位圖（DD-8）。
 */

const VERTEX_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'
const GEMINI_TEXT_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/* Imagen 對中文 prompt 理解差（中文「披薩」會畫成橘子盆），只有英文才準。
 * 先用 Gemini flash 把中文 context 翻成簡短英文圖像描述，再套英文風格指令。 */
let translateKeyIndex = 0
async function translateToEnglish(zh: string, apiKeys: string[]): Promise<string | null> {
  if (apiKeys.length === 0 || !zh.trim()) return null
  const body = JSON.stringify({
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              'Translate the following Chinese into a short, concrete English description for an image generator. ' +
              'Output ONLY the English description, no quotes, no extra words.\n\n' +
              zh,
          },
        ],
      },
    ],
    generationConfig: { responseMimeType: 'text/plain', temperature: 0 },
  })
  for (let attempt = 0; attempt < apiKeys.length; attempt++) {
    const key = apiKeys[(translateKeyIndex + attempt) % apiKeys.length]
    try {
      const res = await fetch(`${GEMINI_TEXT_URL}?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000),
        body,
      })
      if (res.status === 429) continue
      translateKeyIndex = (translateKeyIndex + attempt + 1) % apiKeys.length
      if (!res.ok) return null
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[]
      }
      const text = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
      return text || null
    } catch {
      continue
    }
  }
  return null
}

async function buildEnglishPrompt(
  context: string,
  targetWord: string | undefined,
  mode: 'scene' | 'diagram',
  apiKeys: string[],
): Promise<string> {
  // 翻成英文；翻不出來就退用原文（degraded，但 Imagen 仍會出圖）
  const enContext = (await translateToEnglish(context, apiKeys)) ?? context
  const enFocus = targetWord ? (await translateToEnglish(targetWord, apiKeys)) ?? targetWord : ''
  if (mode === 'diagram') {
    return [
      'flat educational illustration for young children aged 6-9:',
      `${enContext}.`,
      enFocus ? `focus on: ${enFocus}.` : '',
      'simple cartoon style, bright cheerful colors, clear and uncluttered, plain white background,',
      'use concrete objects (apples, blocks, number line, grouping, arrows) to visualize the idea,',
      'positive, safe, age-appropriate.',
    ].filter(Boolean).join(' ')
  }
  return [
    "cute children's picture book illustration:",
    `${enContext}.`,
    enFocus ? `featuring ${enFocus}.` : '',
    'flat sticker style, warm bright colors, friendly and adorable, simple background,',
    'positive, safe, age-appropriate, no text.',
  ].filter(Boolean).join(' ')
}

function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...fields, ts: Date.now() }))
}

export type ImagenVertexConfig = {
  project: string
  location: string
  model: string   // imagen-4.0-fast-generate-001 等
  keyFile: string
  /** Gemini 金鑰（給中文→英文 prompt 翻譯用；空陣列則跳過翻譯，degraded 退原文） */
  apiKeys?: string[]
}

type ImagenResponse = {
  predictions?: { bytesBase64Encoded?: string; mimeType?: string; raiFilteredReason?: string }[]
}

export class ImagenVertexProvider implements SceneIllustrationProvider {
  private readonly config: ImagenVertexConfig
  private readonly auth: GoogleAuth
  private readonly endpoint: string

  constructor(config: ImagenVertexConfig) {
    this.config = config
    this.auth = new GoogleAuth({ keyFile: config.keyFile, scopes: [VERTEX_SCOPE] })
    this.endpoint =
      `https://${config.location}-aiplatform.googleapis.com/v1/projects/${config.project}` +
      `/locations/${config.location}/publishers/google/models/${config.model}:predict`
    console.log(
      `[ImagenVertexProvider] enabled — project=${config.project} location=${config.location} model=${config.model}`,
    )
  }

  async illustrate(
    context: string,
    targetWord?: string,
    mode: 'scene' | 'diagram' = 'scene',
  ): Promise<A1IllustrateResponse | A1ErrorResponse> {
    let result = await this.illustrateOnce(context, targetWord, mode)
    if (!result.ok && RETRYABLE_ILLUSTRATE.has(result.error)) {
      log('a1.illustrate.retry', { provider: 'imagen', code: result.error })
      await sleep(300)
      result = await this.illustrateOnce(context, targetWord, mode)
    }
    return result
  }

  private async illustrateOnce(
    context: string,
    targetWord?: string,
    mode: 'scene' | 'diagram' = 'scene',
  ): Promise<A1IllustrateResponse | A1ErrorResponse> {
    const start = Date.now()
    log('a1.illustrate.request', {
      provider: 'imagen',
      hasTarget: Boolean(targetWord),
      contextLen: context.length,
      mode,
    })

    if (!context.trim()) {
      return { ok: false, error: 'ILLUSTRATE_BAD_REQUEST', message: '我還不知道要畫什麼耶，先說一句話好嗎？' }
    }

    let token: string | null | undefined
    try {
      const client = await this.auth.getClient()
      token = (await client.getAccessToken()).token
    } catch (error) {
      log('a1.illustrate.error', {
        provider: 'imagen',
        code: 'ILLUSTRATE_AUTH_ERROR',
        detail: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - start,
      })
      return { ok: false, error: 'ILLUSTRATE_AUTH_ERROR', message: '畫圖的時候卡住了，要不要再試一次？' }
    }
    if (!token) {
      return { ok: false, error: 'ILLUSTRATE_AUTH_ERROR', message: '畫圖的時候卡住了，要不要再試一次？' }
    }

    const prompt = await buildEnglishPrompt(context, targetWord, mode, this.config.apiKeys ?? [])
    const body = JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: '1:1',
        personGeneration: 'allow_all',
        safetySetting: 'block_only_high',
      },
    })

    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30000),
        body,
      })

      if (!res.ok) {
        const upstreamBody = await res.text().catch(() => '')
        log('a1.illustrate.error', {
          provider: 'imagen',
          code: 'ILLUSTRATE_UPSTREAM_ERROR',
          upstreamStatus: res.status,
          upstreamBody: upstreamBody.slice(0, 300),
          latencyMs: Date.now() - start,
        })
        return { ok: false, error: 'ILLUSTRATE_UPSTREAM_ERROR', message: '畫圖的時候卡住了，要不要再試一次？' }
      }

      const data = (await res.json()) as ImagenResponse
      const pred = data.predictions?.[0]
      if (!pred?.bytesBase64Encoded) {
        // 被 RAI 過濾或空回 → EMPTY（外層會重試一次）
        log('a1.illustrate.error', {
          provider: 'imagen',
          code: 'ILLUSTRATE_EMPTY',
          filtered: pred?.raiFilteredReason ?? '',
          latencyMs: Date.now() - start,
        })
        return { ok: false, error: 'ILLUSTRATE_EMPTY', message: '這張圖我先畫不出來，我們先看內容好嗎？' }
      }

      const mimeType = pred.mimeType || 'image/png'
      log('a1.illustrate.ok', {
        provider: 'imagen',
        latencyMs: Date.now() - start,
        bytes: pred.bytesBase64Encoded.length,
      })
      return {
        ok: true,
        imageDataUri: `data:${mimeType};base64,${pred.bytesBase64Encoded}`,
        altText: targetWord ? `「${targetWord}」的插畫` : '插畫',
      }
    } catch (error) {
      log('a1.illustrate.error', {
        provider: 'imagen',
        code: 'ILLUSTRATE_UPSTREAM_ERROR',
        detail: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - start,
      })
      return { ok: false, error: 'ILLUSTRATE_UPSTREAM_ERROR', message: '畫圖的時候卡住了，要不要再試一次？' }
    }
  }
}
