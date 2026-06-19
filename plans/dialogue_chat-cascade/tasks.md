# Tasks: dialogue_chat-cascade

對應 spec.md Requirements 與 design.md DD-1..DD-9。功能已實作 + 驗證 + 上線（commit `d186390`）。

## 1. 共用模組（DD-2）

- [x] 1.1 `a1ChatShared.ts`：抽 SYSTEM_PROMPT / ILLUSTRATABLE / ParsedReply / buildA1Response / extractStructuredJson / INTENT_JSON_SCHEMA（標準 JSON Schema dialect）
- [x] 1.2 `GeminiChatProvider` 重構為 import 共用（保留 Gemini-dialect responseSchema），行為等價

## 2. Bare session 客戶端（DD-3/DD-4）

- [x] 2.1 `opencodeBareChatProvider.ts`：node:http socketRequest（unix socket，typed）
- [x] 2.2 chat：建 session → 送 `{agent:bare, system, format:json_schema, model 釘帳號, parts:transcript}` → 抽 JSON → buildA1Response
- [x] 2.3 錯誤碼：CHAT_BARE_UNAVAILABLE / CHAT_BARE_ERROR / CHAT_BARE_NO_JSON（掉接）、CHAT_BAD_REQUEST（不掉接）

## 3. 軟性結構化吸收（DD-5/DD-6）

- [x] 3.1 bare prompt 末附強制「嚴格 JSON、勿 StructuredOutput(...)、勿散文」directive
- [x] 3.2 extractStructuredJson：fence → 平衡括號 → 整段 + 寬鬆修復（剝 StructuredOutput(...) 殼 + 補 key 雙引號）
- [x] 3.3 buildA1Response 形狀正規化：story/sentence 字串 → 物件
- [x] 3.4 hasRequiredPayload：per-intent payload 完整性驗證（不完整→null→掉接）

## 4. 級聯（DD-7）

- [x] 4.1 `cascadeChatProvider.ts`：Claude 主 → Gemini 備，FALLTHROUGH_CODES 僅可用性失敗
- [x] 4.2 BAD_REQUEST 不掉接；主備回同 A1ChatResponse 形狀；每跳 structured log

## 5. 設定與接線（DD-8/DD-1）

- [x] 5.1 `env.ts`：CHAT_PROVIDER enum + bareChat（socket 推導 + provider/model/account）+ fail-fast（缺 socket / cascade 缺 GEMINI_API_KEYS）
- [x] 5.2 `server.ts` buildChatProvider() 依 env 選擇；預設 gemini 不退化

## 6. 驗證與上線

- [x] 6.1 tsc（backend）通過（AC1）
- [x] 6.2 直打 bare 各 intent ok（AC2）；cascade broken-socket 掉接（AC3）
- [x] 6.3 形狀正規化 tell_story 5/5 物件（AC4）
- [x] 6.4 端到端 gateway → cascade → Claude，log tier=claude-bare（AC5）
- [x] 6.5 UI 實測「講一隻貓的故事」完整故事 / 「蘋果的蘋」查字（AC6）
- [x] 6.6 上線：BUILD/env CHAT_PROVIDER=cascade（gitignored，本機）+ restart backend；commit `d186390`
- [x] 6.7 event_record 收尾（start / decide / built 三筆）
