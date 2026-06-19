# BR: opencodeBareChatProvider 改用 daemon 的無狀態 completion endpoint，移除 create+dispose 治標

Date: 2026-06-19
Scope: cecelearn — webapp/backend/src/providers/opencodeBareChatProvider.ts（A1 小雞老師 intent 分類對話層）
Status: OBSERVING — cecelearn 端已遷移並 live 驗證（2026-06-19）。opencodeBareChatProvider 改為單步 POST /api/v2/completion，移除 disposeSession() + create step + finally 收尾。tsc exit 0；後端 restart（PID 58865）；真實 chat「蘋果的蘋怎麼寫」→ ok:true intent:lookup replyLen:22；daemon GET /api/v2/session before=100 → after=100 零落地。event: cecelearn/event_2026-06-19_cecelearn-opencodebarechatprovider-post-api-v2-com_kuas39。
Observing since: 2026-06-19
Exit → closed/: soak 數日小朋友實際對話無 daemon-hang / NotFoundError / session 堆積復發，且未 commit 的改動已 commit。
Regress → open: 出現 session 落地 / completion 失敗率異常 / 解析漏接，且查得新 root cause。
Severity: low（現行 create+dispose 治標版功能正確且在線，本 BR 是去技術債、非修壞掉的功能）
Upstream: opencode `issues/observing/issue_20260619_stateless_oneshot_completion_no_session_persist.md`（daemon 端，已 OBSERVING）

## Summary

`opencodeBareChatProvider.chat()` 目前為了拿一次無狀態 intent 分類，必須：

1. `POST /api/v2/session {title:'cecelearn-小雞老師'}` 開一個落地 session
2. `POST /api/v2/session/:id/message`（agent=bare + system + json_schema + 釘 model）
3. `finally` 裡 `DELETE /api/v2/session/:id`（`disposeSession()`）用完即刪

這是「先污染再打掃」的反模式：每輪多 2 個 daemon round-trip、DELETE 比 create 慢、
create 成功但 delete 失敗（daemon 重啟 / timeout）就漏一個慢慢堆積成 `pkcs12` userhome
的可見 project session。

**daemon 端已落地 Option A**：新增 `POST /api/v2/completion` 無狀態一次性 completion 路徑
（stateless 直呼 LLM.stream，零落地 — 過程中 `GET /api/v2/session` 數量不變）。本 BR 要把
cecelearn 端從三步（create→message→delete）收斂成一步（completion），移除 dispose 邏輯。

## daemon 端介面（已部署，可直接接）

```
POST /api/v2/completion
{
  "agent": "bare",                       // 沿用既有 bare passthrough（layer-zeroing 清人格）
  "system": "<SYSTEM_PROMPT>",
  "parts": [{ "type": "text", "text": "<promptText>" }],
  "model": { "providerId": "...", "modelID": "...", "accountId": "<可選>" },
  "format": { "type": "json_schema", "schema": INTENT_JSON_SCHEMA }
}
```

—— 與現行送的 `POST /:sessionID/message` body **幾乎一字不差**，只是把 sessionID 從 URL 拿掉。

回應形狀與 message 一致：

```
200 { "parts": [ { "type":"tool", "tool":"StructuredOutput", "state":{ "output":{...} } },
                 { "type":"text", "text":"...json..." } ] }
```

→ 現行的 `extractStructuredJson`（優先抓 StructuredOutput tool part，抓不到從 text parts 撈

```json fence）**一行都不用改**。

### 失敗碼（可區分，cascade 接得上）

| daemon 回 | HTTP | 語義 | cascade 動作 |
|---|---|---|---|
| `{code:"RATE_LIMITED"}` | 429 | 上游帳號 rate-limit（已自動換帳號重試 N 次仍失敗）| 掉接 Gemini |
| `{code:"PROVIDER_ERROR"}` | 502 | provider 暫時錯 / **stream 120s wall-clock timeout** | 掉接 Gemini |
| `{code:"DAEMON_ERROR"}` | 500 | daemon 內部錯 | 掉接 Gemini |
| `{code:"MODEL_NOT_FOUND"}` | 400 | model 不存在（設定錯）| 不掉接（設定問題，修設定）|
| `{code:"BAD_REQUEST"}` | 400 | 壞 body / agent 不存在 | 不掉接 |

對應現行 cascade：可用性失敗（429/502/500）→ 掉接；請求/設定問題（400）→ 不掉接。

## 改動範圍（cecelearn 端）

`webapp/backend/src/providers/opencodeBareChatProvider.ts`：

- **刪 `disposeSession()`**（L121-140）與 `chat()` `finally` 的 `disposeSession` 呼叫（L291-295）。
- **刪 create step**（L168-190 的 `POST /api/v2/session`）與 `sessionId` 變數。
- **改 message step**（L192-210）：URL `/api/v2/session/:id/message` → `/api/v2/completion`，body 去掉
  sessionID 依賴（其餘 agent/system/format/model/parts 全不動）。
- **回應解析（L226-271）不動**：`msg.parts` / StructuredOutput tool part / text fence fallback 全沿用。
- **錯誤映射微調**：原本看 `sent.status !== 200` + `msg.info.error`；改看 completion 的
  `{code}` 欄位映射到既有 `CHAT_BARE_UNAVAILABLE` / `CHAT_BARE_ERROR` / `CHAT_BARE_NO_JSON`。
  - 429/502/500 → `CHAT_BARE_UNAVAILABLE`（可掉接）
  - 400 MODEL_NOT_FOUND/BAD_REQUEST → 視為設定錯，log warn（理論上不該發生，model 是釘死的）

## 注意：claude-cli 軟性結構化現實（已知，沿用現行對策）

daemon 端 completion 的 json_schema 模式雖然 `toolChoice:"required"` 強制 StructuredOutput tool，
但 claude-cli 實測仍常回 text 而非真的呼叫 tool（live 驗證：json_schema 模式 HTTP 200 但 output 走
text part）。**現行 provider 已有對策**：

- prompt 尾端「【輸出格式｜務必遵守】直接輸出嚴格 JSON」覆蓋（L160-164）
- `extractStructuredJson` 的 text fence fallback + 寬鬆修復（L242-256）

→ 遷移後這套對策**原封保留**，不因換 endpoint 改變。

## Acceptance Criteria

- `chat()` 一輪只發 **1 個** daemon HTTP request（completion），無 create / 無 delete。
- 呼叫前後 daemon `GET /api/v2/session` 數量不變（不再產生 `cecelearn-小雞老師` session）。
- intent 分類結果與遷移前一致（同對話 → 同 intent / reply）。
- cascade 行為不變：daemon 可用性失敗仍掉接 Gemini；設定/請求錯不掉接。
- 移除 `disposeSession` 後無孤兒 session 堆積（連續呼叫 N 次，session list 0 增長）。

## Evidence（daemon 端 live 驗證，2026-06-19）

- restart_self 部署後三測：純文字 200 / json_schema 200 / 壞 model 400。
- BR 核心：`GET /api/v2/session` before=100 → after=100，零落地。
- daemon 端 commit `799b96ca0`（fix(completion): graceful-degrade ephemeral session + wall-clock timeout）。
- daemon 端 endpoint 本體：commit `58dcb6573` + merge `0c95e9dbd`。

## Related anchors

- cecelearn: `webapp/backend/src/providers/opencodeBareChatProvider.ts`（chat / disposeSession / extractStructuredJson）
- opencode daemon: `packages/opencode/src/session/completion.ts`（Completion.run）、
  `packages/opencode/src/server/routes/completion.ts`、`app.ts:433`（route 接線）
```
