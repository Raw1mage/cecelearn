# Design: dialogue_chat-cascade

## Context

cecelearn 後端的 A1 對話走 `DialogueChatProvider.chat(messages, hint)` 介面（`contracts/providers.ts`），原由 `GeminiChatProvider` 實作。本案新增一條級聯路徑：Claude（經 opencode bare session）為主、Gemini 為備，並抽出共用 prompt/parse 讓主備分類行為一致。搭配 opencode `specs/daemon/bare-chat-session`（daemon 端 bare session 已交付）。

## Goals / Non-Goals

### Goals
- 小雞老師對話借 Claude OAuth 訂閱跑，Gemini 自動備援，預設行為不變（env 切換）。
- 吸收 claude-cli 軟性結構化（解析 + 形狀正規化 + 完整性驗證 + 掉接）。
- 主/備回同一 `A1ChatResponse` 形狀，不靜默降級。

### Non-Goals
- 不改 opencode daemon / provider 內部；不改畫圖 cascade；不持久化對話歷史。

## Decisions

- **DD-1 介面複用，不新契約**。新 provider 實作既有 `DialogueChatProvider`，server `buildChatProvider()` 依 `env.chatProvider` 選擇，a1 module 無感。`GeminiChatProvider` 行為等價（只抽共用）。

- **DD-2 抽 `a1ChatShared` 共用 prompt + parse（正確性，非僅 DRY）**。SYSTEM_PROMPT（小雞老師）、`buildA1Response`、`ILLUSTRATABLE`、`ParsedReply`、`extractStructuredJson`、`INTENT_JSON_SCHEMA` 共用。cascade 主備若 prompt/parse 不同 → 分類行為分歧就是 bug。Gemini 保留自己的大寫 `responseSchema`（Gemini dialect），bare 用標準 JSON Schema（`INTENT_JSON_SCHEMA`）。

- **DD-3 bare 連線 = node:http over unix socket**。`POST /api/v2/session` → `POST /api/v2/session/{id}/message`，body `{agent:"bare", system, format:{json_schema}, model:{providerId,modelID,accountId}, parts:[{text}]}`。用 `node:http` socketRequest（typed、portable），不依賴 Bun-fetch unix。

- **DD-4 帳號釘死（POC/上線）**。`model.accountId` 帶固定 Claude 訂閱帳號 → 不走 rotation、不跨 family，結構化能力不被偷換到 codex。

- **DD-5 軟性結構化吸收（核心）**。claude-cli 不強制 toolChoice → 模型常把 JSON 包在 ```json fence、散文、甚至 `StructuredOutput({未加引號 key})` 偽函式語法裡。對策三層：(a) bare prompt 末附「直接輸出嚴格 JSON、勿用 StructuredOutput(...)、勿散文」；(b) `extractStructuredJson` 依序 fence→平衡括號→整段，並含寬鬆修復（剝 `StructuredOutput(...)` 殼 + 補 key 雙引號）；(c) `buildA1Response` 形狀正規化（`story`/`sentence` 被回成字串 → 包成物件）+ payload 完整性驗證。

- **DD-6 payload 完整性驗證 → 掉接**。`hasRequiredPayload`：lookup/make_words 需 lookup.words；make_sentence 需 sentence.sentences；tell_story 需 story.story 非空；draw 需 draw.subject；solve_arithmetic 需 arithmetic.operation+a。不完整 → `buildA1Response` 回 null → bare 回 `CHAT_BARE_NO_JSON` → cascade 掉接 Gemini（硬強制 schema 必補齊）。避免前端渲染空泡泡。

- **DD-7 cascade 掉接界線（天條 #11）**。`FALLTHROUGH_CODES` = 可用性失敗（`CHAT_BARE_UNAVAILABLE`/`CHAT_BARE_ERROR`/`CHAT_BARE_NO_JSON` + 泛用 upstream/empty/parse）。`CHAT_BAD_REQUEST`（使用者輸入問題）**不**掉接。兩路徑回同形狀，掉接只在「打不通/救不回」，非「形狀降級」。

- **DD-8 env 顯式開啟、fail-fast**。`CHAT_PROVIDER='gemini'(預設)|'bare'|'cascade'`。bare/cascade 需 socket（`OPENCODE_DAEMON_SOCKET` 或 `$XDG_RUNTIME_DIR/opencode/daemon.sock`）；cascade 另需 `GEMINI_API_KEYS`。缺則 loadEnv 直接報錯（不默默變單 tier）。

- **DD-9 後端無狀態、每輪渲染完整歷史**。`chat(messages)` 拿完整歷史 → 渲染成單一 transcript prompt、開一次性 bare session。「不落地 / 網頁重置歸零」由前端每頁開新 session 達成（opencode DD-10：daemon 端不另做持久化）。session reuse 為日後優化。

## Risks / Trade-offs

- **R1 軟性結構化不穩**：rich payload（story/sentence/lookup）偶爾形狀錯或漏。緩解：DD-5/DD-6 三層吸收；救不回掉接 Gemini。實測 normalize 後 tell_story 5/5 物件形狀、UI 正常渲染。
- **R2 營運依賴 opencode daemon**：daemon 掛 → 掉接 Gemini（不中斷）。但 daemon 重啟若連帶殺 cecelearn backend（同 cgroup），需 `webctl restart backend`。
- **R3 帳號額度**：燒真實 Claude 訂閱（5H/週）。緩解：釘單帳號、可隨時 env 切回 gemini。
- **R4 寬鬆 key-quoting 修復誤傷**：字串值含 `, key:` 樣式可能誤補引號。範圍受控（先 fence/平衡括號，修復為最後手段；兒童內容罕見該樣式），且失敗即掉接。

## Critical Files

- `webapp/backend/src/providers/a1ChatShared.ts` — SYSTEM_PROMPT / INTENT_JSON_SCHEMA / buildA1Response / hasRequiredPayload / extractStructuredJson / ParsedReply / ILLUSTRATABLE
- `webapp/backend/src/providers/opencodeBareChatProvider.ts` — bare session client（socketRequest + chat）
- `webapp/backend/src/providers/cascadeChatProvider.ts` — Claude 主 → Gemini 備
- `webapp/backend/src/providers/geminiChatProvider.ts` — 重構為 import 共用（保留 Gemini responseSchema）
- `webapp/backend/src/config/env.ts` — CHAT_PROVIDER / bareChat 設定 + fail-fast
- `webapp/backend/src/server.ts` — buildChatProvider() 接線
- `webapp/backend/src/contracts/providers.ts` — DialogueChatProvider 介面（不變）

## Code Anchors

- `a1ChatShared.ts` buildA1Response（形狀正規化 + hasRequiredPayload 驗證）
- `a1ChatShared.ts` extractStructuredJson（fence→括號→整段 + StructuredOutput(...) / 未加引號 key 寬鬆修復）
- `opencodeBareChatProvider.ts` socketRequest（node:http unix socket）+ chat（建 session→送訊→抽 JSON→build）
- `cascadeChatProvider.ts` FALLTHROUGH_CODES + chat（主 ok 回；可用性失敗才掉接 Gemini）
- `env.ts` loadEnv（chatProvider enum + bareChat 推導 socket + fail-fast）
- `server.ts` buildChatProvider()

## Cross-refs

- opencode `specs/daemon/bare-chat-session`（daemon 端 bare session，living）— wire 契約來源（DD-5 軟性結構化現實在該案 POC 實證）。
- cecelearn `plans/dialogue_tool_runtime`（DD-8 ModelRuntime seam 願景）— 本案是其落點。
