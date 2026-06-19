# 變更紀錄 CHANGELOG

本檔記錄 cecelearn・小雞老師 的重要變更。格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)。

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
