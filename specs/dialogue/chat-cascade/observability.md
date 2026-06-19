# Observability: dialogue_chat-cascade

所有事件走 stdout 單行 JSON（`{event, ...fields, ts}`），收進 cecelearn 後端 log（`~/.local/state/cecelearn/logs/backend.log`）。

## Events

| event | 來源 | 關鍵欄位 | 用途 |
|---|---|---|---|
| `a1.chat.bare.intent` | OpencodeBareChatProvider | intent, latencyMs, replyLen | bare 成功一輪 |
| `a1.chat.bare.error` | OpencodeBareChatProvider | code, stage(create/message/exception), status, daemonError, partTypes, latencyMs | bare 失敗（哪一段、為何） |
| `a1.chat.cascade` | CascadeChatProvider | tier(claude-bare/gemini), outcome(ok/fallthrough/error/error_no_fallthrough), code, to, totalLatencyMs | 級聯每一跳 |
| `a1.chat.intent` / `a1.chat.error` | GeminiChatProvider | intent / code, upstreamStatus | 備援 tier（或預設 gemini） |

## 啟動 log（健康確認）

- `[OpencodeBareChatProvider] enabled — socket=… model=claude-cli/claude-opus-4-8 account=…`
- `[CascadeChatProvider] enabled — primary=claude-bare → secondary=gemini`

## Metrics

- **掉接率**：`a1.chat.cascade outcome=fallthrough` ÷ 全部 → 衡量 Claude 軟性結構化可靠度 / daemon 健康；偏高代表 normalize 規則需擴充或 daemon 不穩。
- **tier 分布**：`tier=claude-bare` vs `tier=gemini` 成功數 → 訂閱額度 vs Gemini 成本佔比。
- **bare 失敗分解**：`a1.chat.bare.error` 依 code/stage → 區分連線問題 vs 結構化救不回。
- **latency**：bare `latencyMs` / cascade `totalLatencyMs`（掉接會疊兩段）。

## 排查指引

- 對話「空泡泡 / 回一句就停」→ 查 `a1.chat.bare.error code=CHAT_BARE_NO_JSON` + `partTypes`；多半是新的軟性結構化形狀，擴充 `extractStructuredJson` / `buildA1Response` normalize。
- 全掉 Gemini → 查 bare.error stage：`create/exception`=daemon/ socket 問題；`message`=帳號/provider。
- `<!doctype` JSON parse 錯（前端）→ 通常是 cecelearn backend 掛（非本案）；`./webctl.sh restart backend`。
