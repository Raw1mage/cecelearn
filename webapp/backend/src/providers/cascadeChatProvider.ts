import type {
  A1ChatMessage,
  A1ChatResponse,
  A1ErrorResponse,
  DialogueChatProvider,
} from '../contracts/providers.js'

/**
 * 級聯對話 provider（使用者明確授權，2026-06-18）。
 *
 * 順序：先打 primary（Claude，經 opencode bare session 借訂閱額度）；當 primary
 * 回「可重試類」錯誤（連線/daemon 錯/結構化漏接）才掉接 secondary（Gemini，硬
 * 強制 responseSchema）。這是顯式、可觀測的「主→備」掉接，**只在可用性失敗時掉
 * 接，不在「有回應但形狀降級」時掉接**——bare 端抽不到合法 JSON 也算可用性失敗，
 * 因為兩條路徑都回同一份 A1ChatResponse 形狀，小朋友不會靜默拿到降級輸出（天條
 * #11 之精神）。BAD_REQUEST（使用者輸入問題）直接回，不掉接。
 */

/** 哪些 primary 錯誤碼值得掉接 secondary。BAD_REQUEST 不掉接。 */
const FALLTHROUGH_CODES = new Set([
  'CHAT_BARE_UNAVAILABLE', // socket 連不上 / 非 2xx / timeout
  'CHAT_BARE_ERROR', // daemon 端明確錯誤（fail-fast / rate-limit / provider）
  'CHAT_BARE_NO_JSON', // 軟性結構化漏接——抽不到合法 JSON
  'CHAT_NOT_CONFIGURED', // primary 未配置
  'CHAT_UPSTREAM_ERROR', // 泛用上游錯（保險）
  'CHAT_EMPTY_REPLY',
  'CHAT_PARSE_ERROR',
])

function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...fields, ts: Date.now() }))
}

export class CascadeChatProvider implements DialogueChatProvider {
  private readonly primary: DialogueChatProvider
  private readonly secondary: DialogueChatProvider
  private readonly primaryLabel: string
  private readonly secondaryLabel: string

  constructor(
    primary: DialogueChatProvider,
    secondary: DialogueChatProvider,
    labels: { primary: string; secondary: string } = { primary: 'claude-bare', secondary: 'gemini' },
  ) {
    this.primary = primary
    this.secondary = secondary
    this.primaryLabel = labels.primary
    this.secondaryLabel = labels.secondary
    console.log(
      `[CascadeChatProvider] enabled — primary=${this.primaryLabel} → secondary=${this.secondaryLabel}`,
    )
  }

  async chat(
    messages: A1ChatMessage[],
    hint?: 'lookup',
  ): Promise<A1ChatResponse | A1ErrorResponse> {
    const start = Date.now()

    // tier 1：Claude（bare session）
    const primaryResult = await this.primary.chat(messages, hint)
    if (primaryResult.ok) {
      log('a1.chat.cascade', { tier: this.primaryLabel, outcome: 'ok' })
      return primaryResult
    }

    if (!FALLTHROUGH_CODES.has(primaryResult.error)) {
      // 例如 BAD_REQUEST：掉接也沒用，直接回
      log('a1.chat.cascade', {
        tier: this.primaryLabel,
        outcome: 'error_no_fallthrough',
        code: primaryResult.error,
      })
      return primaryResult
    }

    log('a1.chat.cascade', {
      tier: this.primaryLabel,
      outcome: 'fallthrough',
      code: primaryResult.error,
      to: this.secondaryLabel,
    })

    // tier 2：Gemini（硬強制 responseSchema）
    const secondaryResult = await this.secondary.chat(messages, hint)
    log('a1.chat.cascade', {
      tier: this.secondaryLabel,
      outcome: secondaryResult.ok ? 'ok' : 'error',
      code: secondaryResult.ok ? undefined : secondaryResult.error,
      totalLatencyMs: Date.now() - start,
    })
    return secondaryResult
  }
}
