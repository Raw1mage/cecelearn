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
- **DD-13**: 小家教講解能力 intent=explain：對小朋友唸/打/拍出的題目做「題目→一步步講解→答案」，subject ∈ {english, math, general}。純二元算式仍走 solve_arithmetic 的直式動畫；有情境/文字/多步驟的數學才走 explain。理由：把小雞老師從窄命令機器人擴成能真正講解的家教，且與既有算術教學分工不重疊。
- **DD-14**: 圖像雙軌策略：情境圖（畫貓/故事場景/造句插圖）走 Imagen 4（imagen-4.0-fast-generate-001，專門 T2I，每次都出圖），中文 context 先用 Gemini flash 翻成英文再畫；數學圖解走確定性 SVG（explain.viz 規格，前端 MathDiagram 照畫，count 加減/groups 乘除）。理由：多模態 Gemini 生圖會「回文字不出圖」(ILLUSTRATE_EMPTY)，Imagen 中文又會自由聯想畫錯（披薩減法畫成解剖圖），教學圖的正確性不能交給生成模型隨機性——會錯的東西不靠生圖。
- **DD-15**: 生圖成本 cascade：先免費 apikey（Gemini 多模態 AI Studio 額度）→ 撞 429/502/空回/額度耗盡才掉接 Imagen 4（Vertex 福利點數）；後備層由原本的 Gemini-on-Vertex 換成 Imagen 4，因為前者是同一顆多模態、有同樣空回毛病。每個 tier 對 ILLUSTRATE_EMPTY/UPSTREAM_ERROR 同層重試一次（間隔 300ms）再判失敗。對話 cascade 同理：Claude 訂閱（opencode bare）為主→失敗掉接 Gemini。一律「先免費再消費」，不 silent fallback，每跳落結構化 log。
- **DD-16**: 拍照讀題（OCR）只辨識不解題：小朋友對考卷拍照 → GeminiVisionProvider（gemini-2.5-flash 多模態, temperature 0）抽出題目原文 → 前端把文字當輸入餵回 chat→explain 流程。理由：複用既有 intent 分類與講解邏輯，避免兩套講解分岔；前端先縮圖（最長邊 1280/JPEG 0.72）再上傳，base64 不寫進 request.log。
- **DD-17**: 英文發音/跟讀練習：explain 英文題附帶關鍵單字（word+中文意思），卡片下方 inline 練習——🔊 聽用 speakEnglish（獨立 en-US 語音、放慢、不受朗讀總開關影響因為是明確點擊），🎤 跟讀用獨立 en-US 單發辨識（recognizeOnce；在 A1 內則借主辨識 captureOnce 切 en-US 聽一句再切回），不動常駐中文辨識（cmn-Hant-TW）。比對去非字母/小寫/包含或 8 成字元重疊即過。理由：中文辨識引擎聽不準英文，獨立實例最乾淨、不互搶麥克風。
- **DD-18**: 多題答題（intent=start_quiz）走獨立 overlay 模組 + 確定性題庫，不塞進對話 history。觸發→模組→收尾三段：對話判 start_quiz 開全螢幕 QuizPage（a6），題目由 QuizBankProvider（事實種子池 data/quizbank.json）+ QuizGenProvider（runtime 動態生）經 /api/quiz 供給，作答/批改/計分/連擊全在模組自己 state，完成插一張成績卡回流對話。理由：對話 context 是滑動窗口（HISTORY_LIMIT=16）+ 後端每輪無狀態一次性 bare session，記不住多題進度與分數；批改須確定性，不能靠模型回想。選擇題/數值嚴格比對，跟讀/造詞為開放練習作答即過。
- **DD-19**: 找影片（intent=find_video）+ 故事接龍（intent=continue_story）+ 純中文鐵則。find_video：小朋友問知識 → 正規化成 kid-safe 中文搜尋詞 → YoutubeVideoProvider（YouTube Data API v3, safeSearch=strict + videoEmbeddable, curated 兒童頻道庫加權）→ inline 嵌入播放窗，播放時自動暫停麥克風避免影片聲被當輸入。continue_story：故事改一輪一段（story 段落 + prompt 邀小朋友接 + done 收尾），不再一次吐整篇。純中文鐵則：給小朋友的中文內容禁夾雜英文字母/單字（每天≠every天），唯一例外是 arithmetic 算式與 explain 英文題的英文原文。
- **DD-20**: A1 對話版面比照 opencms（opencode session）聊天樣式：對話串流置頂佔滿並內部滾動、輸入列釘在底部（DOM 順序：conversation panel 先、input panel 後）。整頁鎖在視窗高度避免文件層級捲軸——用 `#root:has(.a1-chat-layout)` 與 `.app-frame:has(.a1-chat-layout)` 設 `height:100dvh; overflow:hidden`、清掉 app-frame 的 padding-bottom，再以 flex 鏈（page-shell→feature-page→a1-chat-layout 皆 flex:1 / min-height:0）把剩餘高度交給 `.a1-conversation-panel`（flex:1; overflow-y:auto），輸入面板 flex:0 0 auto。`:has()` 把這套鎖高只作用在含聊天版面的 A1 頁，不影響 A2/A3。放棄先前的 `calc(100dvh - 6rem)` 魔術數字寫法（疊加 app-frame padding-bottom 後超出一個視窗高而冒出捲軸）。
- **DD-21**: 故事接龍互動風格採「真·一句接一句」（使用者覆核，AskUserQuestion 三選項中選定，勝過「老師鋪路選岔路」與「混合鉤子」）：tell_story 只開場一兩句（15-40字）停在鉤子並 prompt 邀小朋友接；小朋友自己想下一句劇情，老師欣然接受、順著加一句（15-40字）再交回；來回數輪或小朋友說結束時 done=true 溫暖收尾。理由：對象 6-9 歲，目標是最大化兒童語言產出與主導感，由小朋友自己發展劇情而非只做選擇。tell_story 從一次性 80-200 字整篇改為接龍開場。
- **DD-22**: 故事接龍連續性靠「送模型的歷史回填故事本體」（前端 enrichForModel）。根因：後端把對話歷史轉成 contents[] 時只取每則 m.text，而 tutor 訊息的 text 只存引導語 reply，真正的故事段落存在 m.story 裡沒被送出 → 模型每輪看不到自己上一句編的劇情，只能重開新故事（DD-19 宣告接龍時未預見此序列化缺口）。修法：送出歷史的副本裡，把 tell_story/continue_story 回合的 text 補成「reply\n［故事進行中］<story.story>（<prompt>）」，只動送出副本不動畫面顯示；並在 SYSTEM_PROMPT 加上「接龍前先讀完所有［故事進行中］段落，沿用同一主角/名字/場景往下接，不可重開或換角」。實測五回合維持同一主角波波、尋寶劇情累積、收尾回頭點名中途才出現的貓頭鷹。前端正在接龍時對小朋友下一句帶 hint=story 讓後端傾向 continue_story，但後端仍可在小朋友明顯改要別的事時切換 intent。
- **DD-23**: 故事接龍每回合都配圖（成長繪本），不受 session 自動生圖上限約束。tell_story/continue_story 回合在 fetchIllustration 走 skipSessionCap=true（等同手動畫），略過 SESSION_AUTO_LIMIT(8) 的 offer 閘、也不計入該 session 自動配額（避免長故事害其他一般回合提早被切成手動），但仍受每日硬上限 DAILY_LIMIT(40) 約束當成本防線。理由：接龍一句一段、回合多，固定 session 上限會在接到一半把自動配圖切成手動按鈕、斷掉繪本體驗；每日硬上限已足夠擋住亂花費。

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

## Code anchors

- `webapp/backend/src/providers/a1ChatShared.ts` — `SYSTEM_PROMPT / INTENT_JSON_SCHEMA` — 小雞老師共用 prompt 與 intent 封閉集合（含 explain/find_video/continue_story/start_quiz、explain.viz/words、純中文鐵則）；Claude bare 與 Gemini 兩路徑共用
- `webapp/backend/src/providers/imagenVertexProvider.ts` — `ImagenVertexProvider` — Imagen 4 情境圖後備層（cascade secondary）；中文 context 先 Gemini flash 翻英、空回/5xx 同層重試一次
- `webapp/backend/src/providers/geminiVisionProvider.ts` — `GeminiVisionProvider` — 拍照讀題 OCR：gemini-2.5-flash 多模態抽題目原文（/api/a1/read-question）
- `webapp/backend/src/providers/quizGenProvider.ts` — `QuizGenProvider / QuizBankProvider` — 學科測驗題庫：QuizBankProvider 事實種子池(data/quizbank.json) + QuizGenProvider runtime 動態生；/api/quiz、/api/quiz/meta
- `webapp/frontend/src/features/a6/QuizPage.tsx` — `QuizPage` — 多題答題 overlay 模組（setup→逐題作答→批改→成績回流）；start_quiz 觸發，沿用 onClose/onComplete 契約
- `webapp/frontend/src/features/a1/components/MathDiagram.tsx` — `MathDiagram` — 數學確定性 SVG 圖解（count 加減打紅叉/標綠底、groups 乘除分組），照 explain.viz 畫，永不畫錯；另 EnglishPractice.tsx 為英文跟讀
- `webapp/frontend/src/features/a1/components/Lightbox.tsx` — `Lightbox` — 情境插畫與數學 SVG 共用的全螢幕放大浮層；portal 掛 body，點背景/✕/Esc 關閉並回原畫面，開啟時鎖背景捲動
- `webapp/frontend/src/features/a1/A1Page.tsx:701` — `A1Page render` — 聊天版面 DOM 順序（DD-20）：a1-conversation-panel 置頂、a1-input-panel 釘底，比照 opencms message-timeline + prompt dock
- `webapp/frontend/src/styles.css:173` — `.a1-chat-layout viewport lock` — DD-20 鎖高消捲軸：:has(.a1-chat-layout) 把 #root/.app-frame 鎖 100dvh+overflow:hidden，flex 鏈讓對話區 overflow-y:auto、輸入面板釘底
