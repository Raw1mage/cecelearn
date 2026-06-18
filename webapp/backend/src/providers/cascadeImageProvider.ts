import type {
  A1ErrorResponse,
  A1IllustrateResponse,
  SceneIllustrationProvider,
} from '../contracts/providers.js'

/**
 * 級聯插畫 provider（成本分層，使用者明確授權）。
 *
 * 順序：先用「免費」provider（primary，通常是 GEMINI_API_KEYS 走 AI Studio
 * 免費額度）；當 primary 回傳錯誤（429 冷卻 / 502 / empty / auth / upstream），
 * 再 fall through 到「福利點數」provider（secondary，Vertex 吃 GCP credit）。
 *
 * 這是顯式、可觀測、使用者批准的成本級聯，不是 silent identity fallback：
 * - 每一跳都打 structured log（哪個 tier、為何掉接）
 * - 兩個 tier 都必須在 env 配置完整才會啟用 cascade（loadEnv fail-fast）
 * - 只有「可重試類」錯誤才掉接；BAD_REQUEST（使用者輸入問題）直接回，不浪費 credit
 */

/** 哪些 primary 錯誤碼值得掉接到 secondary（付費）。BAD_REQUEST 不掉接。 */
const FALLTHROUGH_CODES = new Set([
  'ILLUSTRATE_UPSTREAM_ERROR', // 429 / 502 / 5xx / 網路
  'ILLUSTRATE_EMPTY', // 回了但沒圖
  'ILLUSTRATE_AUTH_ERROR', // primary 認證/額度耗盡
  'ILLUSTRATE_NOT_CONFIGURED', // primary 沒 key
])

function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...fields, ts: Date.now() }))
}

export class CascadeImageProvider implements SceneIllustrationProvider {
  private readonly primary: SceneIllustrationProvider
  private readonly secondary: SceneIllustrationProvider
  private readonly primaryLabel: string
  private readonly secondaryLabel: string

  constructor(
    primary: SceneIllustrationProvider,
    secondary: SceneIllustrationProvider,
    labels: { primary: string; secondary: string } = { primary: 'apikey', secondary: 'vertex' },
  ) {
    this.primary = primary
    this.secondary = secondary
    this.primaryLabel = labels.primary
    this.secondaryLabel = labels.secondary
    console.log(
      `[CascadeImageProvider] enabled — primary=${this.primaryLabel} → secondary=${this.secondaryLabel}`,
    )
  }

  async illustrate(
    context: string,
    targetWord?: string,
  ): Promise<A1IllustrateResponse | A1ErrorResponse> {
    const start = Date.now()

    // tier 1：免費
    const primaryResult = await this.primary.illustrate(context, targetWord)
    if (primaryResult.ok) {
      log('a1.illustrate.cascade', { tier: this.primaryLabel, outcome: 'ok' })
      return primaryResult
    }

    // primary 失敗：判斷是否值得掉接到付費 tier
    if (!FALLTHROUGH_CODES.has(primaryResult.error)) {
      // 例如 BAD_REQUEST：使用者輸入問題，掉接也沒用，直接回
      log('a1.illustrate.cascade', {
        tier: this.primaryLabel,
        outcome: 'error_no_fallthrough',
        code: primaryResult.error,
      })
      return primaryResult
    }

    log('a1.illustrate.cascade', {
      tier: this.primaryLabel,
      outcome: 'fallthrough',
      code: primaryResult.error,
      to: this.secondaryLabel,
    })

    // tier 2：福利點數
    const secondaryResult = await this.secondary.illustrate(context, targetWord)
    log('a1.illustrate.cascade', {
      tier: this.secondaryLabel,
      outcome: secondaryResult.ok ? 'ok' : 'error',
      code: secondaryResult.ok ? undefined : secondaryResult.error,
      totalLatencyMs: Date.now() - start,
    })
    return secondaryResult
  }
}
