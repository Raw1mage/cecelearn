# 變更紀錄 CHANGELOG

本檔記錄 cecelearn・小雞老師 的重要變更。格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)。

## [2026-06-24]

### 修正 Fixed
- **找影片文不對題**：小朋友說「看一段搞笑貓咪的影片」卻一律只出現佳佳老師這類已訂閱頻道的幼教片。同一症狀有三層成因，逐一修正：
  1. **搜尋詞被硬塞兒童詞**（`a1ChatShared.ts` system prompt）：原本要求小雞老師把**所有** query 都加「兒童／給小朋友／科普／介紹」，把「搞笑貓咪」改寫成「搞笑貓咪 兒童 適合小朋友」→ YouTube 被帶偏成幼教結果。改為**條件式**：知識／科普型查詢（恐龍、太陽系…）才補適齡詞；娛樂／具體型查詢（搞笑貓咪、好笑的狗狗、特定卡通…）**忠實照搜原字詞、不加修飾**。
  2. **「庫滿就吐庫內」短路**（`youtubeVideoProvider.ts`）：原本某主題庫內累積 ≥ 門檻就直接吐庫內舊資料、跳過搜尋——但 yt-dlp 是**零配額**被動函式，沒有省額度的理由短路，反而讓污染桶永久固化。移除短路，**serve 路徑一律先搜新鮮 yt-dlp**；影片庫降為**純離線安全網**（僅在 yt-dlp 與 Data API 都搜失敗時才退而服務庫內，避免對話開天窗）。並清空已污染的 `gen_video` 表（697→0）。
  3. **精選頻道無條件置頂**（`youtubeVideoProvider.ts` `flagAndSort`）：原本把命中精選頻道庫的結果 `sort` 到最前，導致任何搜尋的播放窗**首支永遠是訂閱頻道**。移除重排序，**保留搜尋來源的相關度原序**；精選改為純徽章提示（⭐），不再凌駕相關度。兒童安全改靠**家長黑名單硬擋**這一道閘。

### 變更 Changed
- **影片庫儲存改 SQLite**：`data/videobank.json` → `data/genbank.sqlite` 的 `gen_video` 表（統一累積層；舊 JSON 啟動時一次性 import 後改名 `.imported` 備份）。公開 API（size/get/accumulate/summary）不變。

## [2026-06-21]

### 新增 Added
- **通用語音啟動遊戲機制（game_launch_framework）**：建立單一 game registry（`webapp/backend/src/shared/gameRegistry.ts`，前後端共用），把原本散在 6 處（後端 intent enum×2、prompt 範例、前端 `overlayForIntent`、A1Page render switch、首頁 quick-chips）的遊戲接入點收斂到單一真實來源。
  · **a7 改 overlay 化**：成語填字從獨立 route 改成全螢幕 overlay，並新增 `start_crossword` intent，小朋友可直接說「玩成語填字／來填字／成語闖關」用語音啟動，與聽寫（`start_dictation`）、成語選擇題（`start_idiom`）、數學練習（`start_quiz`）走同一條啟動路徑。
  · **新遊戲＝加一筆 registry entry**：日後新增遊戲只要在 registry 補一筆，即自動具備語音 intent、首頁入口鈕、全螢幕 overlay 三者一致，不必再散改多處。
  · 既有三遊戲遷移至 registry 驅動（行為等價），後端 intent 分類器（`opencodeBareChatProvider` / `geminiChatProvider` / `a1ChatShared`）與前端（`overlayRegistry` / `useConversation` / `A1Page` / `ConversationStream`）皆由 registry 衍生。
- **成語填字闖關（a7 遊戲模組）**：全新獨立遊戲模組，國風十字交叉成語填字盤。點首頁「🧩 成語填字」進 `/a7`，演算法即時生成關卡——以 `charIndex`（單字→成語反向索引）從 `idioms.json` 的 1641 條四字成語排出十字交叉盤，交叉點一律 given（消除歧義）、tray 無誘答，**保證可解**。小朋友點底部備選字塊填入空格，填對一條成語即揭曉例句並 TTS 朗讀，過關沿用 `celebrate()` 灑花＋計分，再進下一關。
  · **零後端成本**：除首次抓題庫外，關卡生成、校驗、過關全在前端完成，與 a2 成語選擇題並存、不互相影響。
  · 後端 `IdiomCrosswordProvider`（`providers/idiomCrosswordProvider.ts`）+ `modules/a7.ts` 薄封裝 + `GET /api/a7/puzzle`；排盤失敗顯式回 `{ok:false}`，不 silent fallback。
  · 前端 `features/a7/`（`CrosswordBoard` 佈局、`useCrossword` 狀態機、字塊填入/校驗/揭曉/過關），契約集中於 `contracts/providers.ts` 與 `shared/api/client.ts`。

## [2026-06-20]

### 新增 Added
- **兒童知識型頻道庫擴充**（`data/channels.json`）：新增 6 個精選頻道並把原本待補的 1 個轉正，頻道庫由 4 active + 1 pending 擴成 11 active、無 pending。新增/轉正清單——佳佳老師說故事（`UCgoiUg4LrO28_S0tBafdpcg`）、均一教育平台 Junyi Academy（`UCbDEamSXQhxqhovhd2NdEyg`）、168好日子（`UCO8pQa9gmYl9QiK-Dw0sDxA`）、呆話西遊 DaihuaXiyou（`UCoLond6sdng1D065BkSNDEA`）、智慧種子兒童永續發展教育頻道（`UCvIZF2yCsD1jktxHc65DQdA`）、SunnySeedlings（`UCRL7jFEEsS8m--3-CFFtzRQ`），以及把 pending 的「烏龍院成語」補上官方 channelId（`UCH_jKFm1vrDVjx9xIGRtvkQ`）轉為 active。channelId 一律抓 YouTube 頻道頁的 `externalId` 取得真實官方 ID，非 handle 推測。小雞老師找影片時命中這些頻道的結果會標 ⭐ 精選並排到最前面。

## [2026-06-19]

小家教升級：把小雞老師從「窄命令機器人」擴成能真正講解英文、數學題目的家教，並把生圖策略改成可靠的雙軌。

### 新增 Added
- **找影片**（`find_video` intent）：小朋友問知識或好奇某件事（如「我想看恐龍的影片」「放一段太陽系的影片」），小雞老師把好奇正規化成適齡搜尋詞，到 YouTube 找影片，直接在對話串流開成 inline 小播放窗。後端 `YoutubeVideoProvider` 走 YouTube Data API v3，安全鐵則 `safeSearch=strict` + `videoEmbeddable=true`；剛建的 key 傳播期暫態錯誤（`API key expired`/5xx）同層重試；每日搜尋上限防 quota，無 key／API 未啟用時 fail-fast 給 kid-friendly 提示。新增 `YOUTUBE_API_KEY`（未設沿用第一把 Gemini key）。
  · 播放窗用 YouTube IFrame Player API（nocookie host），**自適應容器寬度**、16:9；不顯示相關影片連結，避免分散注意力。
  · **影片播放時自動暫停麥克風**（不讓影片聲音被當成小朋友說話、亂觸發小雞老師），暫停/播完後若先前麥克風是開著的就自動開回。
  · **兒童知識型頻道庫**（`data/channels.json` + `ChildChannelLibrary`）：維護一份經挑選、適合 6-9 歲的 YouTube 頻道清單（種子：樂樂TV、十萬個為什麼、FCCSD 成語任務、小豬佩奇中文官方）。query 命中庫內頻道主題時，先對該精選頻道做鎖頻道搜尋（命中即用，省配額），否則退一般 safeSearch；精選結果標 ⭐ 並排最前。管理／檢索 API：`GET /api/a1/channels`（列出）、`POST /api/a1/channels`（入庫，channelId 去重、寫回 JSON）。
  · **影片庫（持久累積，漸漸不需要 API）**（`data/videobank.json` + `VideoBank`）：找影片先查影片庫，某主題已累積 >= 5 支就直接服務、**完全不打 YouTube API**（毫秒回）；不足才搜尋並把結果分門別類**寫回庫**（依主題去重累積）。常見主題多半搜一次就跨過門檻，之後永遠免 API；YouTube key 失效時也能用庫內既有影片續命。後台檢索：`GET /api/a1/videobank`（各主題與數量）。
  · **連續看相關影片**：後端一次回多支相關影片（精選優先），播放窗加 ◀ 上一部／下一部 ▶＋進度（N/M），在同一個窗內 `loadVideoById` 切換、**不重打 API**；切到下一支會自動播放，麥克風隨播放狀態自動暫停／恢復。
  · **搜尋來源改用自架 Invidious**（借鏡 `ytlite`，`InvidiousClient` + `INVIDIOUS_API_URL`，預設同機 1215）：找影片改打 Invidious 的 `/api/v1/search`，**零 YouTube Data API 配額**；YouTube Data API 降為 Invidious 不可用時的後備。安全採「精選優先＋家庭友善過濾」：精選頻道一律放行並排最前，非精選頻道用 Invidious 頻道 `isFamilyFriendly` 把關（查不到則保守剔除）。搭配影片庫——新主題打 Invidious 一次、寫回庫，之後同主題直接從庫毫秒服務。
- **小家教講解能力**（`explain` intent）：對小朋友唸/打出的題目做「題目 → 一步步講解 → 答案」。涵蓋英文題/單字/句子、數學應用題與概念；純算式仍走直式動畫。
- **拍照讀題（OCR）**：對著考卷拍照 → Gemini 2.5 Flash 多模態辨識題目原文 → 餵進講解流程。前端相機鈕、自動縮圖（最長邊 1280 / JPEG）後上傳。
- **英文發音 / 跟讀練習**：英文題附帶關鍵單字（單字＋中文意思），卡片下方可 🔊 聽（en-US 朗讀）、🎤 跟讀（獨立 en-US 單發辨識）並比對，過了灑花計分。
- **數學確定性 SVG 圖解**：`explain.viz` 帶結構化規格，前端用 SVG 照畫——`count`（加減數東西，拿走打紅叉、加上標綠底）與 `groups`（乘除分組）。畫圖 100% 由前端決定，永遠正確。
- **Imagen 4 情境生圖**：新增 `ImagenVertexProvider`（`imagen-4.0-fast-generate-001`），作為生圖 cascade 的可靠後備（專門 T2I，每次都出圖）；中文 prompt 先翻英再畫。

### 變更 Changed
- **生圖策略雙軌**：情境圖走 Imagen 4（可靠），數學圖解走確定性 SVG（永不畫錯）。`explain` 移出自動生圖集合。
- **生圖 cascade 第二層**從 Gemini-on-Vertex（同樣多模態、會空回）換成 Imagen 4。
- **聊天版面**改為對話置頂可滾動、輸入列釘底（比照 opencms）。
- **開發期 log** 改 append 長久留存，每次啟動補帶時間戳的分隔標記。
- **對話層改走 daemon 無狀態 completion**：意圖分類原本每輪向 opencode daemon 開一個一次性 `bare` session（`POST /session` → `message` → `DELETE`），會把純服務端中介資料落地成 userhome 的可見 project session（先污染再打掃）。opencode 落地 stateless completion 端點後，收斂成單步 `POST /api/v2/completion`：daemon 不建 session、不寫 storage、不進 list，呼叫前後 session 數不變。回應 `parts[]` 形狀與原 message 一致，解析端零改；失敗碼（429/502/500 → 掉接 Gemini，400 設定錯不掉接）維持 cascade 行為。

### 修正 Fixed（服務端中介資料）
- **對話 session 堆積在 userhome**：移除一次性 bare session 的 create+delete 治標、改用無狀態 completion，根治「小朋友對話變成 `pkcs12` userhome 可見 project session」；並清掉歷史已堆積的 95 個殘留 session。

### 修正 Fixed
- **造句中英夾雜**：system prompt 加「純中文鐵則」，禁止把「每天」吐成「every天」（教英文除外）。
- **生圖偶發 502**：空回 / 暫態 5xx 在同層重試一次再判失敗。
- **筆順卡片偏移**：HanziWriter SVG 尺寸對齊容器實際寬度，字置中不再歪。
- **新圖文串流不追底**：illustrations 轉態與圖片載入後自動捲到底。
- **送出後輸入欄沒清空**：送出即清空對話輸入欄。

## [2026-06-18]

### 新增 Added
- **小雞老師對話升級**：測驗（聽寫/成語）overlay 化；對話意圖分類改借 opencode bare session 走 Claude OAuth 訂閱（失敗掉接 Gemini）。
- **畫圖成本級聯**：免費 apikey →（502/冷卻）→ Vertex 福利點數。

### 修正 Fixed
- webctl 載入 nvm，讓 nohup 背景行程找得到 node。
- compose 加 restart policy，修復服務無法開機自啟。
