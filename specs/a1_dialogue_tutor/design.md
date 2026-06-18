# Design: a1_dialogue_tutor

## Context

A1 從「單次查字」演化為「漸進式對話型小家教」。現況：
- 前端 `webapp/frontend/src/features/a1/A1Page.tsx`（680 行）：Web Speech Recognition（VAD + 喚醒詞「小雞小雞」+ Samsung manual mode）+ `lookup()` 單次查詢迴圈 + HanziWriter 筆畫框 + 造詞/成語/歷史三個 Panel。
- 前端 API client：`webapp/frontend/src/shared/api/client.ts`（`apiClient.lookupWord`）。
- 後端 `webapp/backend/src/server.ts`：node:http 純手刻 router，`/api/a1/lookup` POST → `createA1Module(new MoeWordLookupProvider(env.geminiApiKeys))`。
- 契約：`webapp/backend/src/contracts/providers.ts`（`A1LookupResponse` 等）。
- env：`webapp/backend/src/config/env.ts` 提供 `geminiApiKeys: string[]`（來自 `GEMINI_API_KEYS`）。

## Goals / Non-Goals

### Goals

- 多輪對話 + 上下文記憶（前端記憶體 history，每輪帶完整 `contents[]` 給後端）。
- intent 分流（lookup / make_words / make_sentence / tell_story / chat / unclear）。
- Result Stage（造詞區泛化）+ Illustration Stage（筆畫框泛化）。
- 後端 Gemini text proxy（對話）+ image proxy（按鈕觸發插畫）。
- 前端語音輸入（沿用）+ 語音輸出（SpeechSynthesis）。

### Non-Goals

- 帳號/登入/後端持久化；多帳號 rotation；圖庫；離線。
- 動 legacy A1 或 opencode session 引擎。

## Decisions

- **DD-1**：session context 採「後端薄對話層 + 前端記憶體 history」，不採 opencode/opencms session 引擎。理由：Gemini `generateContent` 無狀態，多輪只需每次帶 `contents[]`；opencms session 引擎（rotation/tool-calling/compaction）對兒童問答是過度工程且暴露開發者能力。
- **DD-2**：history 存前端 React state（`messages: Message[]`），每輪 POST 給 `/api/a1/chat` 時整包送出。後端**無狀態**、不存 session。理由：符合「前端記憶體為主、無需登入」；後端維持單純 proxy，易測、無 session GC 負擔。
- **DD-3**：intent 由後端「單次 Gemini 呼叫」同時完成「分類 + 內容生成」（structured JSON output，`responseSchema` 帶 `intent` 欄位），而非前端規則判斷或兩段呼叫。理由：語音輸入口語多變，規則式易誤判；兩段呼叫加倍延遲與額度。前端僅做極輕量 hint（保留既有「○○的×」查字偵測以維持 lookup 行為不退化）。
- **DD-4**：Result Stage 用單一元件 `ResultStage`，依 `turn.intent` switch 渲染形態（卡片/句子/段落/泡泡）。原造詞 Panel 內容成為 `intent ∈ {lookup, make_words}` 的一種形態。理由：符合「泛化為單一視窗」需求，避免多 Panel 疊加。
- **DD-5**：Illustration Stage 用單一元件 `IllustrationStage`，有 `mode ∈ {stroke, illustration, loading, error}`。stroke 模式內嵌既有 HanziWriter 邏輯（含重播/練習）；illustration 模式顯示生成圖。理由：泛化筆畫框為通用圖框，且保留既有寫字練習價值。
- **DD-6**：插畫生成 endpoint `/api/a1/illustrate` 獨立於 chat，按鈕觸發。傳入「當前句子/故事 + 目標詞」當情境。理由：影像耗時耗額度，需顯式觸發；與 chat 分離讓對話低延遲。
- **DD-7**：影像回傳格式 = base64 data URI（`data:image/png;base64,...`）內嵌 JSON 回應。理由：本期不建圖庫、即用即丟，免去靜態檔案服務與清理；前端直接塞 `<img src>`。若日後要快取再改 URL。
- **DD-8**：no-silent-fallback。chat / illustrate 失敗一律回結構化錯誤（`ok:false` + message），前端顯式報錯，不給佔位圖、不假裝成功。符合 architecture 規則。
- **DD-9**：語音輸出用瀏覽器原生 `SpeechSynthesis`（`zh-TW`），可開關，預設開。理由：零後端成本、零額度；Gemini TTS 留待日後。
- **DD-10**：A1Page 重構策略 = 抽出 hooks/元件但**不重寫語音辨識核心**。把現有 `lookup()` 改為 `sendTurn()`；語音辨識 useEffect 區塊整段保留，只改「辨識結果的下游」從 `lookupRef.current` 指向 `sendTurnRef.current`。理由：語音辨識邏輯（VAD/喚醒詞/Samsung）已穩定且高風險，最小變更。
- **DD-11**：契約型別新增放在 `contracts/providers.ts`（與既有 A1/A2/A5 並列），前端 `shared/api/client.ts` 同步鏡像型別。理由：沿用既有單一契約檔慣例。
- **DD-12**：後端 router 沿用 server.ts 手刻 `if (url === ...)` 風格新增兩條路由，不引入框架。理由：與既有風格一致，最小相依。

## Architecture

### Backend

```
server.ts
  POST /api/a1/chat       → a1ChatModule.chat(messages, hint?) → GeminiChatProvider
  POST /api/a1/illustrate → a1IllustrateModule.illustrate(context) → GeminiImageProvider
  (既有) POST /api/a1/lookup 保留
```

- `providers/geminiChatProvider.ts`：組 `contents[]`（system 指令 + history + 最新 user），呼叫 Gemini `generateContent`（text 模型，`responseSchema` 帶 intent + 各 intent payload）。
- `providers/geminiImageProvider.ts`：呼叫 Gemini 影像生成模型，回 base64。
- `modules/a1.ts`：擴充為含 chat / illustrate 的 module（或新增 a1Chat module）。
- prompt 含兒童安全約束（正向、適齡、繁中台灣）。

### Frontend

```
features/a1/
  A1Page.tsx              ← 對話迴圈容器（語音辨識核心保留）
  components/
    ResultStage.tsx       ← 結果視窗（依 intent 渲染）
    IllustrationStage.tsx ← 插圖框（stroke / illustration / loading / error）
    ConversationView.tsx  ← 對話 history 顯示（取代/泛化「最近查詢」）
  hooks/
    useConversation.ts    ← messages state + sendTurn + illustrate 呼叫
  hanziWriterAdapter.ts   ← (既有) 保留
  bopomofo.ts             ← (既有) 保留
```

- `useConversation`：維護 `messages`、`currentTurn`、`illustration` state；`sendTurn(text)` → `apiClient.chat`；`requestIllustration()` → `apiClient.illustrate`。
- TTS：`shared/speech/tts.ts`（封裝 `SpeechSynthesis`）。

## Data Flow

1. 語音/文字輸入 → `sendTurn(text)`。
2. `useConversation` 把 `text` push 進 messages，POST `/api/a1/chat` 帶完整 messages。
3. 後端組 `contents[]` → Gemini → 回 `{ intent, ... }`。
4. 前端把 tutor 回覆 push 進 messages；`ResultStage` 依 intent 渲染；`IllustrationStage` 依 intent 切 stroke 或顯示「畫一張」鈕。
5. TTS 朗讀 tutor 文字（若開）。
6. （可選）使用者按「畫一張」→ `requestIllustration()` → POST `/api/a1/illustrate` → 回 base64 → `IllustrationStage` 顯示。

## Risks / Trade-offs

- **R1 intent 誤分類**：口語輸入多變，Gemini 可能誤判 intent。緩解：prompt 明確列舉 intent 定義 + few-shot；unclear 時引導重說，不亂渲染。
- **R2 語音辨識重構回歸**：A1Page 改造可能破壞 VAD/喚醒詞。緩解：DD-10 最小變更，辨識核心不動；改造後在 Chrome + Samsung 實測。
- **R3 影像生成額度/延遲**：banana/影像模型慢且貴。緩解：按鈕觸發 + 生成中禁用 + fail-fast。
- **R4 影像模型可用性未確認**：需確認 `GEMINI_API_KEYS` 對應 key 有影像生成權限與正確 model id。緩解：設計階段標記為待驗證（見 Open Questions / tasks 前置）。
- **R5 多輪 token 膨脹**：history 無限長會撐大 `contents[]`。緩解：前端 history 上限（如最近 N 輪）+ 後端可截斷。

## Critical Files

- `webapp/backend/src/server.ts` — 新增兩路由
- `webapp/backend/src/contracts/providers.ts` — 契約型別
- `webapp/backend/src/providers/geminiChatProvider.ts` — 新增
- `webapp/backend/src/providers/geminiImageProvider.ts` — 新增
- `webapp/backend/src/modules/a1.ts` — 擴充
- `webapp/frontend/src/features/a1/A1Page.tsx` — 對話迴圈改造
- `webapp/frontend/src/features/a1/components/*` — 新增 Stage 元件
- `webapp/frontend/src/features/a1/hooks/useConversation.ts` — 新增
- `webapp/frontend/src/shared/api/client.ts` — 新增 chat/illustrate 方法
- `webapp/frontend/src/shared/speech/tts.ts` — 新增

## Open Questions（待設計收斂時與使用者確認）

- OQ-1：影像生成具體 model id？（Gemini 影像生成 / Imagen）需確認 `GEMINI_API_KEYS` 權限。R4 相關。
- OQ-2：對話文字模型沿用既有 `gemini-2.5-flash` 類型？延遲/成本取捨。
- OQ-3：history 保留輪數上限（R5）？
