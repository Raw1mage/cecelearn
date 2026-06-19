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
 * Opencode bare/passthrough session chat provider.
 *
 * 借用同機 opencode daemon 的對話層（帳號池 + Claude OAuth 訂閱）跑小雞老師的
 * intent 分類。經同機 unix socket 開一個 reserved `bare` agent 的 session：
 * system prompt 只有小雞老師（daemon 端 layer-zeroing 清掉 opencode 人格），
 * format=json_schema 帶 intent schema，model 釘死 Claude 訂閱帳號。
 *
 * 重要現實（opencode POC 實證）：claude-cli（OAuth 訂閱）後端 **不強制**
 * toolChoice:required，結構化輸出是軟性的——模型常把 JSON 包在 ```json fence
 * 或散文裡。故這裡解析回覆文字抽 JSON；抽不到就回 fallthrough 錯誤碼，由
 * CascadeChatProvider 掉接 Gemini（Gemini 硬強制 responseSchema）。不 silent
 * 降級輸出形狀（天條 #11）。
 *
 * 歷史：daemon 端不落地（DD-10）；reset-on-reload 由前端每頁開新 session 處理。
 * 後端 provider 目前無狀態（每次 chat() 拿完整 messages[]），把對話渲染成單一
 * prompt、開一個一次性 bare session。session 重用屬日後優化。
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

/* opencode v2 message 回應形狀（取我們需要的子集） */
type BareMessagePart = { type?: string; text?: string; tool?: string; state?: { output?: unknown } }
type BareMessageResponse = {
  info?: { error?: { name?: string; data?: { message?: string } } }
  parts?: BareMessagePart[]
}

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

  /**
   * 一次性 bare session 收尾：用完即刪，避免堆積在 daemon 的 session store
   * （userhome 下，會外洩成 pkcs12 這個 project 的可見 session list）。
   * best-effort——刪不掉只 log，不影響已回給小朋友的內容（這是服務端中介資料，
   * 非天條 #11 的功能性 fallback）。
   */
  private async disposeSession(sessionId: string): Promise<void> {
    try {
      const res = await socketRequest(
        this.cfg.socketPath,
        'DELETE',
        `/api/v2/session/${sessionId}`,
        undefined,
        this.cfg.timeoutMs,
      )
      if (res.status !== 200) {
        log('a1.chat.bare.session_dispose', { sessionId, ok: false, status: res.status })
      }
    } catch (error) {
      log('a1.chat.bare.session_dispose', {
        sessionId,
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      })
    }
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

    // 一次性 bare session 的 id；finally 統一收尾刪除（避免堆積成 userhome project session）
    let sessionId: string | undefined
    try {
      // 1) 開 bare session
      const created = await socketRequest(
        this.cfg.socketPath,
        'POST',
        '/api/v2/session',
        { title: 'cecelearn-小雞老師' },
        this.cfg.timeoutMs,
      )
      sessionId = (created.json as { id?: string } | undefined)?.id
      if (created.status !== 200 || !sessionId) {
        log('a1.chat.bare.error', {
          code: 'CHAT_BARE_UNAVAILABLE',
          stage: 'create',
          status: created.status,
          latencyMs: Date.now() - start,
        })
        return {
          ok: false,
          error: 'CHAT_BARE_UNAVAILABLE',
          message: '小雞老師連線怪怪的，再說一次好嗎？',
        }
      }

      // 2) 送一輪 bare message（agent=bare + 小雞老師 system + json_schema + 釘帳號）
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
        `/api/v2/session/${sessionId}/message`,
        body,
        this.cfg.timeoutMs,
      )

      if (sent.status !== 200) {
        log('a1.chat.bare.error', {
          code: 'CHAT_BARE_UNAVAILABLE',
          stage: 'message',
          status: sent.status,
          latencyMs: Date.now() - start,
        })
        return {
          ok: false,
          error: 'CHAT_BARE_UNAVAILABLE',
          message: '小雞老師連線怪怪的，再說一次好嗎？',
        }
      }

      const msg = sent.json as BareMessageResponse | undefined
      if (msg?.info?.error) {
        // daemon 端明確錯誤（fail-fast / rate-limit / provider 錯）→ 掉接
        log('a1.chat.bare.error', {
          code: 'CHAT_BARE_ERROR',
          daemonError: msg.info.error.name,
          detail: msg.info.error.data?.message?.slice(0, 200),
          latencyMs: Date.now() - start,
        })
        return {
          ok: false,
          error: 'CHAT_BARE_ERROR',
          message: '小雞老師剛剛打瞌睡了，請再說一次好嗎？',
        }
      }

      // 3) 抽結構化 JSON。優先 StructuredOutput tool part（若被強制呼叫了），
      //    否則 claude-cli 軟性輸出 → 從 text parts 抽 ```json fence。
      const parts = msg?.parts ?? []
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
    } finally {
      // 用完即刪這個一次性 bare session，避免堆積成 userhome 的可見 project session。
      // 即使 create 成功但後續步驟失敗也要刪（sessionId 已落地）。
      if (sessionId) await this.disposeSession(sessionId)
    }
  }
}
