# Errors: a1_dialogue_tutor

> no-silent-fallback（DD-8）。所有後端 Gemini 失敗一律回 `ErrorResponse { ok:false, error, message }`，前端顯式報錯，不給佔位圖、不假裝成功。`message` 為適齡、可顯示給小朋友的繁中文字。

## Error Catalogue

### Chat endpoint (`POST /api/a1/chat`)

| error code | 觸發條件 | user message（繁中適齡） | 復原策略 | 負責層 |
|---|---|---|---|---|
| `CHAT_BAD_REQUEST` | `messages` 缺漏或格式不符契約 | 「我沒聽清楚耶，再說一次好嗎？」 | 前端校驗 messages 後重送；不重試 | backend route 驗證 |
| `CHAT_UPSTREAM_ERROR` | Gemini `generateContent` 回非 2xx / 逾時 / 網路錯 | 「小家教剛剛打瞌睡了，請再說一次好嗎？」 | 前端顯示錯誤泡泡 + 可重送該輪；後端不自動 retry（避免額度爆量） | GeminiChatProvider |
| `CHAT_PARSE_ERROR` | Gemini 回應非合法 JSON / 不符 responseSchema | 「我有點搞混了，再問我一次好嗎？」 | 後端記 log；前端可重送 | GeminiChatProvider |
| `CHAT_EMPTY_REPLY` | Gemini 回空內容 / 安全阻擋無 candidate | 「這個我先不回答喔，我們聊點別的好嗎？」 | 前端引導換話題 | GeminiChatProvider |

## Illustrate endpoint (`POST /api/a1/illustrate`)

| error code | 觸發條件 | user message（繁中適齡） | 復原策略 | 負責層 |
|---|---|---|---|---|
| `ILLUSTRATE_BAD_REQUEST` | `context` 缺漏 | 「我不知道要畫什麼耶！」 | 前端確認有 context 才送 | backend route 驗證 |
| `ILLUSTRATE_UPSTREAM_ERROR` | 影像模型回非 2xx / 逾時 | 「畫圖失敗了，要不要再試一次？」 | 前端顯示錯誤 + 「再畫一張」按鈕；按鈕防重複觸發；無佔位圖 | GeminiImageProvider |
| `ILLUSTRATE_NO_IMAGE` | 回應無影像資料 | 「這次沒畫成功，再試一次好嗎？」 | 前端可重試 | GeminiImageProvider |
| `ILLUSTRATE_NOT_CONFIGURED` | 影像 model id / 權限未設定（Stop Gate 0.2 未解） | 「畫圖功能還在準備中喔！」 | 設定 env / model id 後解除；M3 阻塞信號 | config/env |

## Cross-cutting

- 所有 5xx 類錯誤後端必記結構化 log（見 observability.md），含 error code + 上游狀態碼，但**不回傳**內部細節給前端。
- 任何「需要佔位圖才能跑通」的情況視為設計違規信號（Stop Gate 4），停止並回報。
