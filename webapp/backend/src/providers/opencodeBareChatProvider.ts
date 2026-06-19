import http from 'node:http'
import type {
  A1ChatMessage,
  A1ChatResponse,
  A1ErrorResponse,
  DialogueChatProvider,
} from '../contracts/providers.js'
import {
  SYSTEM_PROMPT,
  LOOKUP_HINT,
  STORY_HINT,
  INTENT_JSON_SCHEMA,
  buildA1Response,
  extractStructuredJson,
} from './a1ChatShared.js'

/**
 * Opencode bare/passthrough chat provider.
 *
 * 借用同機 opencode daemon 的對話層（帳號池 + Claude OAuth 訂閱）跑小雞老師的
 * intent 分類。經同機 unix socket 打一發 **無狀態 one-shot completion**
 * （`POST /api/v2/completion`，opencode daemon_stateless_completion）：
 * agent=bare（daemon 端 layer-zeroing 清掉 opencode 人格），system 帶小雞老師、
 * format=json_schema 帶 intent schema、model 釘 Claude 訂閱帳號。daemon 端不建
 * session、不寫任何 storage、不進 session list、不發 session 級 Bus 事件——所以
 * 不再污染 userhome 的 project session list，也無須呼叫端事後 DELETE 收尾。
 *
 * 重要現實（opencode POC 實證）：claude-cli（OAuth 訂閱）後端 **不強制**
 * toolChoice:required，結構化輸出是軟性的——模型常把 JSON 包在 ```json fence
 * 或散文裡。故這裡解析回覆 parts 抽 JSON（優先 StructuredOutput tool part，否則
 * text fence）；抽不到就回 fallthrough 錯誤碼，由 CascadeChatProvider 掉接
 * Gemini（Gemini 硬強制 responseSchema）。不 silent 降級輸出形狀（天條 #11）。
 *
 * 歷史：原本走 create session → message → DELETE 三步（session 用完即刪治標）；
 * opencode 落地 stateless completion 端點後（BR issue_20260619），改為單步呼叫，
 * 移除 create/dispose。daemon 端不落地（DD-10）；reset-on-reload 由前端每頁處理。
 * 後端 provider 無狀態（每次 chat() 拿完整 messages[]，渲染成單一 prompt）。
 */

export type OpencodeBareConfig = {
  socketPath: string
  providerId: string
  modelID: string
  accountId?: string
  timeoutMs?: number
}

type SocketResult = { status: number; json: unknown; raw: string }

function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...fields, ts: Date.now() }))
}

function socketRequest(
  socketPath: string,
  method: string,
  path: string,
  bodyObj: unknown,
  timeoutMs: number,
): Promise<SocketResult> {
  return new Promise((resolve, reject) => {
    const payload = bodyObj === undefined ? undefined : JSON.stringify(bodyObj)
    const req = http.request(
      {
        socketPath,
        method,
        path,
        headers: {
          host: 'localhost',
          'content-type': 'application/json',
          ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
        },
        timeout: timeoutMs,
      },
      (res) => {
        let data = ''
        res.setEncoding('utf8')
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          let json: unknown
          try {
            json = data ? JSON.parse(data) : undefined
          } catch {
            json = undefined
          }
          resolve({ status: res.statusCode ?? 0, json, raw: data })
        })
      },
    )
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('socket timeout')))
    if (payload) req.write(payload)
    req.end()
  })
}

/* opencode POST /api/v2/completion 回應形狀（200；與 message 回應的 parts 同形，故解析端零改） */
type CompletionPart = { type?: string; text?: string; tool?: string; state?: { output?: unknown } }
type CompletionResponse = { parts?: CompletionPart[] }
/* completion 失敗 body（HTTP 4xx/5xx）：{ code, message }。code ∈
 * RATE_LIMITED(429) | PROVIDER_ERROR(502) | DAEMON_ERROR(500) | MODEL_NOT_FOUND(400) | BAD_REQUEST(400) */
type CompletionErrorBody = { code?: string; message?: string }

export class OpencodeBareChatProvider implements DialogueChatProvider {
  private readonly cfg: Required<OpencodeBareConfig>

  constructor(config: OpencodeBareConfig) {
    this.cfg = {
      timeoutMs: 20000,
      accountId: '',
      ...config,
    }
    console.log(
      `[OpencodeBareChatProvider] enabled — socket=${this.cfg.socketPath} model=${this.cfg.providerId}/${this.cfg.modelID}` +
        (this.cfg.accountId ? ` account=${this.cfg.accountId}` : ' (帳號池)'),
    )
  }

  async chat(
    messages: A1ChatMessage[],
    hint?: 'lookup' | 'story',
  ): Promise<A1ChatResponse | A1ErrorResponse> {
    const start = Date.now()

    if (messages.length === 0) {
      // 使用者輸入問題：不值得掉接（cascade 不 fallthrough）
      return { ok: false, error: 'CHAT_BAD_REQUEST', message: '我沒聽清楚耶，再說一次好嗎？' }
    }

    // 把對話渲染成單一 prompt，最後一句小朋友的話即本輪要分類的目標
    const transcript = messages
      .map((m) => `${m.role === 'tutor' ? '小雞老師' : '小朋友'}：${m.text}`)
      .join('\n')
    const promptText =
      `以下是與小朋友的對話紀錄，請判斷「最後一句小朋友說的話」的意圖並依規則回應：\n\n${transcript}` +
      (hint === 'lookup' ? LOOKUP_HINT : hint === 'story' ? STORY_HINT : '') +
      // claude-cli 軟性結構化：daemon 注入「請用 StructuredOutput 工具」會讓模型演成
      // StructuredOutput({...}) 偽函式語法（key 未加引號），無法 parse。明確覆蓋：直接
      // 輸出嚴格 JSON。（解析端另有寬鬆修復作後備）
      '\n\n【輸出格式｜務必遵守】直接輸出「一個嚴格的 JSON 物件」：所有鍵與字串值都用雙引號；' +
      '不要用 StructuredOutput(...) 之類的函式語法、不要 markdown 標題、不要任何解釋文字，只回 JSON 本體。'

    try {
      // 單步無狀態 completion：agent=bare + 小雞老師 system + json_schema + 釘帳號。
      // daemon 不建 session、不落地，呼叫前後 GET /api/v2/session 數量不變。
      const body: Record<string, unknown> = {
        agent: 'bare',
        system: SYSTEM_PROMPT,
        format: { type: 'json_schema', schema: INTENT_JSON_SCHEMA },
        model: {
          providerId: this.cfg.providerId,
          modelID: this.cfg.modelID,
          ...(this.cfg.accountId ? { accountId: this.cfg.accountId } : {}),
        },
        parts: [{ type: 'text', text: promptText }],
      }
      const sent = await socketRequest(
        this.cfg.socketPath,
        'POST',
        '/api/v2/completion',
        body,
        this.cfg.timeoutMs,
      )

      if (sent.status !== 200) {
        // 失敗 body：{ code, message }。可用性失敗（429 RATE_LIMITED / 502 PROVIDER_ERROR /
        // 500 DAEMON_ERROR）→ 掉接 Gemini；設定/請求錯（400 MODEL_NOT_FOUND / BAD_REQUEST）
        // 理論上不該發生（model 釘死）→ 同樣回可掉接碼但 log warn 以利排查。
        const err = sent.json as CompletionErrorBody | undefined
        const code = err?.code ?? 'UNKNOWN'
        const isConfigError = sent.status === 400
        log('a1.chat.bare.error', {
          code: 'CHAT_BARE_UNAVAILABLE',
          stage: 'completion',
          status: sent.status,
          daemonCode: code,
          ...(isConfigError ? { warn: 'config/request error — 檢查 model/agent 設定' } : {}),
          detail: err?.message?.slice(0, 200),
          latencyMs: Date.now() - start,
        })
        return {
          ok: false,
          error: 'CHAT_BARE_UNAVAILABLE',
          message: '小雞老師連線怪怪的，再說一次好嗎？',
        }
      }

      // 抽結構化 JSON。優先 StructuredOutput tool part（toolChoice:required 強制，
      // 但 claude-cli 軟性結構化常仍走 text）→ 後備從 text parts 抽 ```json fence。
      const parts = (sent.json as CompletionResponse | undefined)?.parts ?? []
      let parsed = null as ReturnType<typeof extractStructuredJson>
      const toolPart = parts.find((p) => p.type === 'tool' && p.tool === 'StructuredOutput')
      if (toolPart?.state?.output && typeof toolPart.state.output === 'object') {
        parsed = toolPart.state.output as ReturnType<typeof extractStructuredJson>
      }
      if (!parsed) {
        const text = parts
          .filter((p) => p.type === 'text' && p.text)
          .map((p) => p.text)
          .join('\n')
        parsed = extractStructuredJson(text)
      }

      const response = parsed ? buildA1Response(parsed) : null
      if (!response) {
        // 軟性結構化漏接：抽不到合法 JSON → 掉接 Gemini（硬強制 schema）
        log('a1.chat.bare.error', {
          code: 'CHAT_BARE_NO_JSON',
          partTypes: parts.map((p) => p.type),
          latencyMs: Date.now() - start,
        })
        return {
          ok: false,
          error: 'CHAT_BARE_NO_JSON',
          message: '我有點搞混了，再問我一次好嗎？',
        }
      }

      log('a1.chat.bare.intent', {
        intent: response.intent,
        latencyMs: Date.now() - start,
        replyLen: response.reply.length,
      })
      return response
    } catch (error) {
      log('a1.chat.bare.error', {
        code: 'CHAT_BARE_UNAVAILABLE',
        stage: 'exception',
        detail: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - start,
      })
      return {
        ok: false,
        error: 'CHAT_BARE_UNAVAILABLE',
        message: '小雞老師連線怪怪的，再說一次好嗎？',
      }
    }
  }
}
