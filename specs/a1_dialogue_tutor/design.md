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
- **DD-24**: 找影片搜尋層改走自架 Invidious（借鏡同機 ytlite），零 YouTube Data API 配額。find_video 原走 YouTube Data API v3（每日 quota，常撞 quotaExceeded），改打自架 Invidious `/api/v1/search`（region=TW, type=video, sort=relevance）取得真實 videoId，**播放仍走 YouTube iframe 不變**——只換「搜尋／metadata」這一層。Data API 降為 Invidious 不可用時的後備（仍 safeSearch=strict）。env 新增 `INVIDIOUS_API_URL`（預設 `http://localhost:1215` 指同機 ytlite 的 Invidious），空字串可停用、改走 Data API。兒童安全＝雙閘：(1) 精選頻道庫（active）一律放行並穩定排最前；(2) 非精選頻道因 Invidious 搜尋無 safeSearch 參數，改用頻道層級 `isFamilyFriendly`（YouTube familySafe microformat，24h 快取、唯一 channelId 平行查）過濾，查不到一律保守剔除。理由：YouTube Data API 每日配額是找影片功能的單點脆弱（配額用罄即全斷），ytlite 已證明自架 Invidious 抓取零配額可行且同機已在跑；播放層用真實 videoId 完全不受影響，風險面只在搜尋層。代價：找影片新主題時依賴同機 ytlite 的 Invidious docker 在跑（停了會退 Data API 或退影片庫既有內容，不崩）；新主題家庭友善過濾多花約 1～1.4s（之後該主題走影片庫毫秒服務）。新增 `providers/invidiousClient.ts`（search + isChannelFamilyFriendly）、`providers/videoBank.ts`（本地影片快取庫 `data/videobank.json`，依主題分類累積去重持久化，某主題 >=BANK_SERVE_MIN(5) 支即直接從庫服務不打任何外部 API——常見主題漸漸完全免外部請求）。實測：恐龍/太陽系新主題實走 Invidious 各 20 支（★樂樂TV 排第一）寫回庫，二次同主題 bank_hit 1ms 零外部請求，Data API 配額用罄正好證明已不依賴。
- **DD-25**: 借鏡 ytlite 的能力**只借鏡不照搬**——ytlite 是 per-user OAuth 真實訂閱 + 個人 nav/blocklist（需登入），cecelearn 是全域 curated 白名單（無使用者、無登入、兒童安全）。兩者哲學相反，故不引入 OAuth/登入/per-user 模型。從 ytlite 借鏡三個 cecelearn 缺的能力，全部做成「全域、無登入、JSON 檔持久化」風格（比照既有 channels.json/videobank.json）：feed 預熱（DD-27）、家長黑名單（DD-26）、可點主題索引（DD-28）。搜尋層（Invidious）已於 DD-24 共用完成，是兩專案唯一真正共用的程式碼路徑。
- **DD-26**: 家長黑名單＝全域反向硬擋清單（`data/blocklist.json`，比照 channels.json 讀寫模式）。新增 `Blocklist` provider（has/add/remove/list）+ `POST /api/a1/block`（action=block/unblock）管理端點。find_video 的 search 結果、familyFilter、feed 預熱、影片庫服務一律先 filter 掉 blocklist 命中的 channelId（硬擋，優先於精選白名單加權）。理由：白名單只能加權排序、擋不掉非精選的壞片（目前靠 Invidious isFamilyFriendly 軟過濾）；黑名單提供家長可控的硬性封鎖，多一層防線。無登入＝全域單一清單（這台機器服務單一家庭情境，per-user 是 ytlite 的多租戶需求，cecelearn 不需要）。
- **DD-27**: Feed 預熱＝手動端點（`POST /api/a1/prewarm`），不引入後端排程器。遍歷 ChildChannelLibrary active 頻道 → 打 Invidious `/api/v1/channels/{id}` 取 latestVideos → familyFilter + blocklist 過濾 → 依頻道 topics 寫回 VideoBank 各主題。理由：cecelearn 後端目前無排程器，setInterval 會綁定 server 生命週期且難觀測；手動端點 self-contained、可由人工或外部 cron 觸發、零新相依、最小 blast radius。InvidiousClient 新增 `channelLatestVideos(channelId)` 方法。
- **DD-28**: 前端可點主題索引（快捷 chip 列）＝動態取自 VideoBank。前端打既有 `videoBankSummary` 端點，把已累積主題（恐龍/太陽系…）做成可點 chip，點了直接送 find_video（庫已足量則毫秒從庫服務）。理由：隨累積自然長出來、零維護、不需後端固定種子清單；主題就是真實有內容的主題，不會點了空手而回。
- **DD-29**: Feed 預熱（DD-27）落地的前置 blocker 與修法：原同機 ytlite 自架 Invidious（2026.04.09-606467c）頻道端點 /api/v1/channels/{id} 的 latestVideos parser 解不出 YouTube 改版後的頻道影片頁，每筆回 type:parse-error（ytlite 自己抓頻道影片用同一端點、同樣症狀）。決策：升級 ytlite 的 Invidious engine 至 2026.06.15-73a1bac（quay :latest 標籤過時誤導，實際停在 2026.02；改 pin 最新日期 tag），同步 invidious-companion:latest。升級後頻道 parser 修復、latestVideos 正常回真實影片。實測 prewarm channels:4、16 主題共 +525 支寫回 VideoBank 持久化。搜尋端點（find_video 主路徑）與 ytlite middleware（12 天未動）升級後均正常，無 collateral damage。註：cecelearn 找影片現在依賴 ytlite Invidious ≥2026.06 的頻道 parser；prewarm 對舊版/parse-error 會自然回 channels:0（fail-soft，不崩不亂塞）。
- **DD-30**: 跨機運行期依賴的處理策略＝明示化、不拆（使用者選定）。cecelearn 找影片借用同機 ytlite 專案已在跑的 Invidious docker（INVIDIOUS_API_URL 預設 localhost:1215 = ytlite 對外 port），不自帶一份 infra。耦合三層：(1) 設定層＝env 軟耦合可覆寫；(2) 運行期＝假設 ytlite Invidious 同機跑著；(3) 版本層＝feed 預熱需 Invidious ≥2026.06（DD-29 頻道 parser）。明示化三動作：(a) InvidiousClient 加 ping()（打 /api/v1/stats）+ baseUrl()；(b) server.ts 啟動時一次性 health probe——連得到 log OK、連不到 log WARN 明確點名此依賴，永不擋啟動；(c) env.ts 預設值註解、README ⚠️ 區塊、architecture.md 全部明寫此跨機依賴與自足做法（改 INVIDIOUS_API_URL 指向自己的 Invidious）。不引入 fallback、不 silent；找影片本就 fail-soft 退 Data API / 影片庫。理由：ytlite 視為本機長期共存基礎服務（如同 redis/postgres），借用省一份 infra 維護（兩份 Invidious 各打 YouTube、各維護 db volume/companion secret）；代價用明示文件 + 啟動 probe 補足，讓部署者意識到依賴而非被靜默咬。
- **DD-31**: Invidious 抽成獨立共用層（supersede DD-30 的「明示化借用 ytlite」）。使用者要求：若 Invidious 一定要 docker 才能跑，就抽成兩專案共用的中性層，誰都不擁有。落地：建 /home/pkcs12/projects/invidious-shared/（db+companion+engine 三容器，external docker network invidious_shared_net，host port 1215，engine pin 2026.06.15-73a1bac，複製 config.yml + 9 個 SQL init，具名 volume invidious_shared_pg 自持）。從 ytlite compose 移除 Invidious 三服務、middleware 改 join invidious_shared_net。零資料遷移風險（先查證 Invidious postgres users/playlists/videos 全空＝純 cache，無真實用戶態；ytlite 用戶訂閱在 Google OAuth + /opt/ytlite_v3/user_db，不在 Invidious DB）。連線字串雙邊不變：cecelearn 用 host localhost:1215、ytlite 用內部 alias invidious:3000。cutover 驗證全過：共用層 host 1215 HTTP 200 + 頻道 parser 回真實 type:video；ytlite middleware→invidious:3000 HTTP 200、/search?q= 200、search items=20；cecelearn host 端 search 20。ytlite 中斷僅 cutover 期間數秒，已恢復。共用層起停：cd /home/pkcs12/projects/invidious-shared && docker compose up -d。要完全自足改 INVIDIOUS_API_URL 指向專屬實例。
- **DD-34**: 移除前端預設主題熱鍵（快捷 chip 列，廢止 DD-28），找影片改全靠對話觸發。使用者回報：主題 chip 不是每個都能正確發揮——主題名取自 VideoBank key（而 key 來自頻道標籤），導致主題不明確（如「英文」「生活」太空泛）、重複（「成語」兩組來自不同頻道）。根因同 DD-33：DD-28 的 chip 直接信任 VideoBank 主題桶，但桶名/桶內容在 prewarm 移除前皆受頻道標籤污染。即便 DD-33 已清污染桶，「把累積主題自動做成 chip」仍會把任何未來累積的桶名（可能仍不適合當固定入口）暴露成 UI。決策：找影片本質是「小朋友臨時好奇 → 對話講出來」的流程，固定主題入口反而誤導；移除前端 chip，讓 find_video 全靠 Gemini intent 從對話判定。落地（純前端，後端 videoBankSummary 端點與 client method 保留作後台檢索）：A1Page 刪 videoTopics state / useEffect 載入 / handleTopicChip / JSX chip 列；styles.css 刪 .a1-topic-chips/.a1-topic-chip 樣式。frontend tsc -b EXIT=0 + vite build EXIT=0。
- **DD-33**: 移除 feed 預熱（supersede DD-27/29，廢止 DD-32 的 channelLatestVideos/prewarm 分支）。Root cause：使用者回報「找影片熱鍵文不對題」。偵查發現問題不在熱鍵或搜尋層，而在 prewarm 灌進影片庫的污染資料。prewarm 的設計＝遍歷精選頻道抓「最新片」→ 原封不動寫進該頻道宣告的「每一個 topic 標籤」。兩個錯誤假設：(1)「頻道標 `數學` ⇒ 其影片都是數學」——錯，標籤是頻道概括守備範圍，非每支影片內容保證；(2)「精選頻道 ⇒ 近期影片都適齡切題」——錯，頻道會漂移（FCCSD 標 `成語` 卻近期發「讀給臺灣的詩/南京1937/民進黨成立」等成人政論，對 6-9 歲不適齡）。實證污染（videobank.json）：`數學`桶＝桃捷尋奇/認識倉鼠/情緒劇場（零數學）、`成語`桶＝政論詩朗讀+倉鼠、`自然`桶＝Tell Me Why 英文版+桃捷。而 bank-serve 門檻僅 5 支 → 這些桶永久服務垃圾、永不觸發真實搜尋（熱鍵 chip 直送 topic → bank_hit → 回污染內容）。修法（移除 prewarm + 清空污染桶）：刪 server.ts `POST /api/a1/prewarm` route、a1.ts `prewarm()`、YoutubeVideoProvider `prewarm()`、YtDlpVideoProvider `channelLatestVideos()`、contracts `A1PrewarmResponse` 與 interface `prewarm?`；videobank.json 過濾掉所有 `prewarm:` 來源桶（16 個），僅保留真實 query 搜出的乾淨桶（恐龍/太陽系/火山）。影片庫往後只由真實 query 累積——每支影片都實際命中過該 query，杜絕「頻道標籤≠影片內容」的文不對題。tsc EXIT=0。
- **DD-32**: 找影片搜尋層從 Invidious 熱 service 換成 yt-dlp 被動函式（supersede DD-24/29/30/31）。使用者本質提問：「為什麼必須是熱 service？不能被動呼叫？」——對。Invidious 是「伺服器形狀」（連線池/反爬 token/postgres，需 db+companion+engine 三容器常駐 daemon）；cecelearn 找影片只是 query→清單 的被動需求，yt-dlp 是「函式形狀」——呼叫才 execFile spawn 去爬、回 flat-playlist NDJSON metadata 就退出，無 daemon/docker/postgres/跨服務依賴。落地：新增 YtDlpVideoProvider（search 走 ytsearchN:，channelLatestVideos 走 youtube.com/channel/<id>/videos，ping 走 --version），刪 InvidiousClient，YoutubeVideoProvider invidious→ytdlp、移除 familyFilter，env INVIDIOUS_API_URL→YTDLP_PATH（預設 yt-dlp 走 PATH），server.ts 換 provider+startup probe。兒童安全改靠精選白名單（排前）+ 家長黑名單（硬擋）兩道閘——yt-dlp 無 isFamilyFriendly 欄位，失去頻道層軟過濾，但對兒童 app「只放精選+硬擋黑名單」比信任 YouTube familySafe flag 更可控。PoC 實測：搜尋 1.7-1.8s、頻道最新片 1.3s、命中率高（恐龍/火山搜尋全台灣兒童頻道、樂樂TV curated 排前）；端到端 search 12 筆、prewarm channels:4 topics:5。延遲有 VideoBank 快取頂著（常見主題毫秒回）。安裝：單一 binary 到 PATH（需系統 python3），-U 更新。連帶拆除：DD-31 共用 Invidious 層已 docker compose down -v + 刪目錄 + 移孤兒網路；ytlite 因仍需 Invidious（未遷移）已 git restore 還原自帶 Invidious 三容器並驗證恢復（middleware→invidious OK、網頁 200）。cecelearn 找影片現在零 docker、零常駐、零跨服務依賴。

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
- `webapp/frontend/src/features/a1/hooks/useConversation.ts` — `enrichForModel` — 故事接龍連續性核心（DD-22）：送模型的歷史副本把 tell_story/continue_story 回合 text 補回「［故事進行中］段落（交棒語）」，模型才看得到自己上一句劇情；只動副本不動顯示。同檔 storyActive/storyActiveRef/setStory/endStory 管接龍狀態與 hint=story
- `webapp/frontend/src/features/a1/components/TurnContent.tsx` — `TurnContent` — 接龍泡泡渲染：tell_story/continue_story 共用故事卡，顯示 topic「故事接龍」徽章、段落、交棒語 prompt，done 時顯示收尾。A1Page 另有「接龍中」bar + 結束故事鈕（endStory），buildTutorSpeech 唸段落+交棒語
