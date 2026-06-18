# Observability: a1_dialogue_tutor

> 本期無持久化、無 APM。觀測以後端結構化 log（stdout）+ 前端 console 為主，聚焦「intent 分類品質」「Gemini 呼叫健康」「語音辨識回歸」三條主軸。

## Events

後端 stdout 結構化 log：

| event | 時機 | 欄位 | 用途 |
|---|---|---|---|
| `a1.chat.request` | 收到 `/api/a1/chat` | `turnCount`(messages 長度), `hasHint` | 流量 + history 膨脹監控（R5） |
| `a1.chat.intent` | Gemini 回覆解析後 | `intent`, `latencyMs`, `replyLen` | intent 分布；誤分類人工抽查依據（R1） |
| `a1.chat.error` | chat 失敗 | `code`, `upstreamStatus`, `latencyMs` | Gemini 健康；錯誤率 |
| `a1.illustrate.request` | 收到 `/api/a1/illustrate` | `contextLen`, `hasTargetWord` | 插畫觸發頻率 |
| `a1.illustrate.result` | 插畫成功 | `latencyMs`, `imageBytes` | 影像延遲/大小（R3） |
| `a1.illustrate.error` | 插畫失敗 | `code`, `upstreamStatus`, `latencyMs` | 影像健康 |

## Metrics

人工從 log 聚合，本期不接 Prometheus：

- **intent 分布**：各 intent 佔比；`unclear` 比例過高 → prompt 需調整（R1）。
- **chat 延遲 p50/p95**：`latencyMs`；過高考慮換模型或截斷 history。
- **chat / illustrate 錯誤率**：`*.error` / `*.request`；fail-fast 下錯誤率直接反映上游健康。
- **history 平均輪數**：`turnCount`；逼近上限代表需驗證截斷策略（R5）。
- **影像延遲 p95 + 平均 bytes**：評估 base64 data URI（DD-7）是否需改 URL 快取。

## Logs

- 後端：`console.log(JSON.stringify({ event, ...fields, ts }))` 單行 JSON，便於 grep/jq。
- 失敗 log 含上游狀態碼但**不含**金鑰、不回傳前端（errors.md cross-cutting）。
- 前端：語音辨識關鍵節點（喚醒詞觸發、VAD 結束、辨識結果、sendTurn）保留既有 `console.debug`，供 Samsung/Chrome 回歸排查（R2）。

## Alerts（本期人工觀察，無自動告警）

- `unclear` 佔比 > 30% → prompt few-shot 需強化。
- chat 錯誤率 > 10% → 檢查 `GEMINI_API_KEYS` 額度/權限。
- 任何 `ILLUSTRATE_NOT_CONFIGURED` → Stop Gate 0.2 未解，M3 不應啟用。

## Manual verification hooks（對齊 tasks.md 驗證）

- M1：curl 連續兩輪，肉眼比對 `a1.chat.intent` log 的 intent 是否正確、上下文是否延續。
- M2：Chrome + Samsung 實機，觀察前端語音 log 序列未退化。
- M3：按鈕觸發後比對 `a1.illustrate.result` / `.error`，確認 fail-fast 無佔位圖。
