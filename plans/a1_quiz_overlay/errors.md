# Errors: a1_quiz_overlay

每個錯誤碼含使用者可見訊息、復原策略、負責層。新增功能不引入 silent fallback（DD-8，使用者天條 11）。

## Error Catalogue

### 後端 (geminiChatProvider)

| 錯誤碼 | 觸發 | 使用者可見訊息 | 復原 | 負責層 |
|---|---|---|---|---|
| `CHAT_NOT_CONFIGURED` | 無 API key | 「小雞老師還在準備中喔！」 | 既有，不變 | backend |
| `CHAT_BAD_REQUEST` | messages 空 | 「我沒聽清楚耶，再說一次好嗎？」 | 既有，不變 | backend |
| `CHAT_PARSE_FAIL` | Gemini 回傳缺 intent/reply | （既有處理）回退 unclear 引導 | 既有，不變 | backend |
| `INTENT_UNKNOWN_NEW` | 回傳 start_dictation/start_idiom 但前端無對應 | （不應發生）走 unclear 引導，不靜默忽略 | 前端記錄並提示重說 | frontend |

## 前端 overlay 生命週期

| 錯誤碼 | 觸發 | 使用者可見訊息 | 復原 | 負責層 |
|---|---|---|---|---|
| `OVERLAY_MOUNT_FAIL` | A5Page/A2Page 掛載例外 | 「測驗開不起來，回到對話再試一次」 | 關 overlay、恢復麥克風、保留對話 | frontend (A1Page) |
| `MIC_RESUME_FAIL` | overlay 關閉後辨識無法恢復 | 「麥克風好像睡著了，點一下麥克風叫醒它」 | 顯示手動麥克風按鈕（既有 toggleListening） | frontend (A1Page) |
| `QUIZ_SUMMARY_MALFORMED` | onComplete 帶不合 schema 的 summary | 不插入損壞總結卡 | 記 console、跳過總結卡、仍關 overlay 恢復麥克風 | frontend (useConversation) |

## 既有測驗內部錯誤（複用，不變）

- A5：出題失敗「出題失敗，範圍內沒有足夠的生字。」（保留）
- A2：出題失敗「出題失敗，請重試。」（保留）
- A5 TTS：不支援時靜默跳過（既有行為，非新增 fallback）

## 原則

- 任何 overlay 錯誤都必須回到「乾淨對話狀態 + 麥克風狀態明確」，不得卡在半掛載。
- 不新增 provider/identity 層的 silent fallback。
