# Tasks: a1_dialogue_tutor

> 漸進式對話型小家教。Milestone 分層，MVP-first。每個 task 為 build agent 可獨立認領的切片。
> 狀態記號：`[ ]` 未開始 / `[~]` 進行中 / `[x]` 完成 / `[!]` 阻塞(附原因) / `[?]` 待決策 / `[>]` 已委派 / `[-]` 取消。

## 0. 前置驗證（阻塞解除）

- [x] 0.1 確認 `GEMINI_API_KEYS` 對應 key 可呼叫 Gemini 文字 `generateContent`（既有 MoeWordLookupProvider 已驗證可行 → 低風險；M1 curl 實測 6 intent 全綠再次確認）
- [?] 0.2 確認影像生成 model id 與權限（OQ-1/R4）。確定用哪個影像模型（Gemini image / Imagen）後才能做 M3。決策前 M3 不啟動。

## 1. Milestone 1 — 後端對話層（contract-first）

- [x] 1.1 在 `contracts/providers.ts` 新增型別：`Intent`、`ChatMessage`、`ChatRequest`、`ChatResponse`、`SentencePayload`、`StoryPayload`、`ErrorResponse`（對齊 data-schema.json）
- [x] 1.2 新增 `providers/geminiChatProvider.ts`：把 messages 組成 Gemini `contents[]`（system 安全指令 + history），呼叫 Gemini REST，`responseSchema` 帶 intent + 各 payload；回傳 ChatResponse
- [x] 1.3 prompt 設計：兒童語境 + 安全約束 + intent 封閉集合定義 + few-shot（lookup / make_words / make_sentence / tell_story / chat / unclear）
- [x] 1.4 擴充 `modules/a1.ts`：新增 `chat(messages, hint?)`，注入 GeminiChatProvider
- [x] 1.5 `server.ts` 新增 `POST /api/a1/chat` 路由（沿用手刻 router 風格）；錯誤走 ErrorResponse fail-fast
- [x] 1.6 驗證 M1：curl 連續兩輪對話，確認 intent 分類正確、上下文延續、各 intent payload 結構正確（6 intent 全綠）

## 2. Milestone 2 — 前端對話迴圈 + Stage 泛化

- [x] 2.1 `shared/api/client.ts` 新增 `chat(messages, hint?)` 方法 + 鏡像型別
- [x] 2.2 新增 `hooks/useConversation.ts`：維護 `messages` state、`sendTurn(text)`、history 上限（R5）
- [x] 2.3 新增 `components/ResultStage.tsx`：依 `intent` switch 渲染（lookup/make_words→造詞卡片；make_sentence→句子；tell_story→段落；chat/unclear→泡泡/引導語）。造詞卡片沿用既有 RubyWord
- [x] 2.4 新增 `components/IllustrationStage.tsx`：`mode ∈ {stroke, illustration, loading, error}`；stroke 模式內嵌既有 HanziWriter（重播/練習保留）
- [x] 2.5 改造 `A1Page.tsx`：`lookup()` → `sendTurn()`（DD-10 最小變更：語音辨識核心 useEffect 不動，只改辨識結果下游指向）；組裝 ResultStage + IllustrationStage
- [x] 2.6 新增 `shared/speech/tts.ts`：封裝 `SpeechSynthesis`（zh-TW），可開關，預設開；家教回覆朗讀
- [x] 2.7 對話 history 顯示：泛化既有「最近查詢」Panel 為 ConversationView（顯示多輪 user/tutor）
- [~] 2.8 驗證 M2：typecheck + build 通過（TSC_EXIT=0）。瀏覽器實機語音/四 intent/TTS/筆順 待使用者實測

## R6. Revise — 版型融合 + 多句造句（使用者實測反饋）

- [x] R6.1 後端契約：`A1SentencePayload.sentence` → `sentences: string[]`；`A1ChatMessage` 擴充 lookup/sentence/story payload
- [x] R6.2 geminiChatProvider：RESPONSE_SCHEMA sentences 陣列 + prompt 造句數量偵測（預設 1、上限 5）
- [x] R6.3 前端 client.ts 鏡像型別同步
- [x] R6.4 新增 TurnContent（抽出富渲染、多句卡片）+ ConversationView 重寫為單一全寬對話串流（inline 富內容、busy 指示、自動捲動）；移除 ResultStage
- [x] R6.5 useConversation：tutor 訊息帶 payload；TTS 唸讀 reply + 句子/故事內容；illustration context 用 sentences[0]
- [x] R6.6 A1Page：移除獨立 ResultStage Panel + conversationOpen state，右側單一全寬對話串流
- [x] R6.7 CSS：landscape grid `auto 1fr 1fr` → `auto 1fr`、對話面板 100% 寬可滾動、補齊整套對話串流樣式（M2 漏上的 conv/sentence/story class）
- [x] R6.8 驗證：backend+frontend typecheck EXIT=0；curl「用開心造三個句子」回 sentences[3] 全綠；dev server 重啟

## 3. Milestone 3 — 情境插畫（按鈕觸發）

> 依賴 0.2 決策。0.2 未定則此 milestone 阻塞。

- [x] 3.1 `contracts/providers.ts` 已有 `A1IllustrateRequest`/`A1IllustrateResponse`/`SceneIllustrationProvider`（M2 期已備）
- [x] 3.2 新增 `providers/geminiImageProvider.ts`：Nano Banana `gemini-2.5-flash-image`，回 base64 data URI（DD-7）；失敗回 ErrorResponse（fail-fast）。模態用 `['TEXT','IMAGE']`（`['IMAGE']`-only 偶爾回 text-only → empty）
- [x] 3.3 `server.ts` 注入 GeminiImageProvider + 新增 `POST /api/a1/illustrate` 路由
- [x] 3.4 `shared/api/client.ts` 已有 `illustrate(context, targetWord?)`（M2 期已備）
- [x] 3.5 `useConversation` 抽出 `fetchIllustration(turn)`；**自動觸發**（illustratable 回合 sendTurn 內直接呼叫，取代按鈕）；IllustrationStage 自動 loading/illustration/error + 保留「再畫一張」「再試一次」手動重畫（生成中 illustrateBusyRef 防重複）
- [x] 3.6 驗證 M3：curl illustrate 回 `ok:true` image/png ~2MB；失敗顯式 ErrorResponse 不給佔位圖（fail-fast）；自動生圖串好

## V. 語音自由對話模式（DD-10 v2 — 使用者決策：電腦全雙工）

> 決策：電腦麥克風可長開 → 真全雙工。平板 Android Chrome full-duplex 仍 OUT OF SCOPE。

- [x] V.1 移除「小雞小雞」喚醒詞：桌面連續模式下任何 final 辨識結果直接送出（onresult 重寫，interim 略過）。Samsung 手動路徑保留
- [x] V.2 真全雙工：TTS 朗讀時麥克風不暫停（使用者耳機防回音）；清除所有 wake 殘留（wakeHit state / wakeWindowRef / wakeTimerRef / openWakeWindow / 喚醒提示文字 / JSX a1-panel--wake）
- [x] V.3 驗證：frontend `tsc -b` EXIT=0；dev server 重啟；瀏覽器實機驗證待使用者

## R7. 版面重構 + AEC 修復 + 插畫歷史 + 直接畫圖 + 改名（使用者反饋）

> 反饋：(1) AEC 自我迴圈無限循環 (2) 版面效率差、圖框不該常駐 (3) 插畫要留歷史/可下載/不被洗 (4) 直接畫圖請求被拒 (5) 改名 希希→小雞。

- [x] R7.1 後端改名 希希→小雞（geminiChatProvider SYSTEM_PROMPT + few-shot + server.ts health）
- [x] R7.2 tts.ts echo 軟閘 `isWithinSpeechGuard()`：朗讀中 + 700ms 尾窗（DD-11）
- [x] R7.3 contracts/client.ts：新增 `draw` intent + `A1DrawPayload` + `A1ChatMessage.id`
- [x] R7.3b 後端 provider 直接畫圖：SYSTEM_PROMPT draw 定義、RESPONSE_SCHEMA draw 物件、ILLUSTRATABLE 加 draw、ParsedReply/response 透傳
- [x] R7.4 useConversation 重構：`illustrations: Record<msgId, state>` per-message 歷史（不覆蓋）+ 顯示保留全部訊息（只裁送後端）+ draw 納入自動生圖 + `redrawIllustration(msgId)`
- [x] R7.5 新建 inline `StrokeBox` 元件：筆順動畫移進 stream（lookup turn 用），要顯示時才出現
- [x] R7.6 ConversationView inline 渲染每則：TurnContent + StrokeBox(lookup) + MessageIllustration(loading/image+下載+重畫/error)
- [x] R7.7 A1Page 拆除左欄固定圖框 → 單欄 chat 佈局（輸入列置頂 + 全寬 stream）；onresult 加 echo gate；改名；傳 illustrations/onRedraw
- [x] R7.8 CSS 重排：`a1-main-layout`→`a1-chat-layout` 單欄、inline 筆順/插畫 max-width、landscape flex column；改名 index.html/env.ts
- [x] R7.9 驗證：backend+frontend typecheck EXIT=0；dev server 重啟；curl draw intent 回 `intent:draw/illustratable:true/draw.subject`、改名生效

## R8. 生圖成本閘（自動上限 + 每日硬上限）

> 反饋延伸：Nano Banana 每張付費，自動生圖需防亂花費。TTS 為零成本不動。

- [x] R8.1 useConversation 成本閘：`SESSION_AUTO_LIMIT=8`（session 自動生圖上限，超過改 offer）+ `DAILY_LIMIT=40`（localStorage 每日總上限跨日歸零，超過 capped）；真正送 API 前才 bump 計數；手動「畫給我看」/重畫略過 session 上限但仍受每日硬上限約束
- [x] R8.2 ConversationView MessageIllustration 新增 `offer`（畫給我看鈕）/`capped`（今日用完）渲染 + CSS
- [x] R8.3 驗證：frontend typecheck EXIT=0；frontend 重啟

## R9. 故事接龍互動進化（continue_story，DD-19 落地 + DD-21/22/23）

> 反饋延伸：「說故事的功能要能互動進化，例如故事接龍。小朋友也能參與其中接著發展劇情。」DD-19 早先宣告 continue_story 但程式碼仍是一次性整篇；本節真正落地接龍，並修好連續性 bug。互動風格經 AskUserQuestion 由使用者選定「真·一句接一句」（DD-21）。

- [x] R9.1 後端 contracts：A1Intent 加 `continue_story`；A1StoryPayload 加 `prompt?`/`done?`；A1ChatRequest.hint 與 DialogueChatProvider.chat 放寬為 `'lookup'|'story'`
- [x] R9.2 a1ChatShared：tell_story 改「只開場」、新增 continue_story 規則 + few-shot、加 `STORY_HINT`、加「先讀完所有［故事進行中］段落、沿用同一主角往下接」連續性硬規則；INTENT_JSON_SCHEMA enum/story(prompt,done)；ILLUSTRATABLE 加 continue_story；hasRequiredPayload 同 tell_story
- [x] R9.3 三 provider + server + module 打通 hint='story'：geminiChatProvider（responseSchema enum/story prompt,done + STORY_HINT）、opencodeBareChatProvider（STORY_HINT）、cascadeChatProvider、modules/a1.ts、server.ts 解析
- [x] R9.4 前端 client 型別鏡像：continue_story、story prompt/done、chat hint 放寬
- [x] R9.5 useConversation：storyActive 狀態 + storyActiveRef、接龍中自動帶 hint=story、回應後依 intent/done 進出接龍、`endStory()`；`enrichForModel` 送出歷史回填故事本體（DD-22）；接龍回合略過 SESSION_AUTO_LIMIT（DD-23）
- [x] R9.6 渲染：buildTutorSpeech 唸段落+交棒語；TurnContent 接龍故事卡（徽章/交棒語/收尾）；A1Page「接龍中」bar + 結束故事鈕 + placeholder；ConversationView 接龍 intent label；styles.css 接龍樣式
- [x] R9.7 RCA 修連續性（DD-22）：根因後端歷史只送 m.text、故事段落在 m.story 沒送 → 每句重開；修法 enrichForModel 回填 + prompt 硬規則
- [x] R9.8 驗證：backend+frontend tsc --noEmit EXIT=0；frontend vite build 通過；對 live cascade 後端實走五回合接龍，主角/劇情連續、收尾 done=true

## R10. 找影片改走自架 Invidious（借鏡 ytlite）+ 本地影片快取庫

> 反饋：「引入 ytlite 的搜尋技術來解決 cecelearn 的找影片需求，並創建本地的影片快取資料庫。」find_video 原走 YouTube Data API v3（每日配額），改借鏡同機 ytlite 的做法打自架 Invidious（零配額）；Data API 降為後備。影片庫 VideoBank 做成本地快取資料庫，常見主題漸漸免外部請求。安全＝精選頻道優先 + 非精選頻道 Invidious isFamilyFriendly 過濾。

- [x] R10.1 新增 `providers/invidiousClient.ts`：自架 Invidious `/api/v1/search`（region=TW, type=video）回 A1VideoItem[]、`/api/v1/channels/{id}` isFamilyFriendly 查詢（24h 快取）；失敗回 null（上層保守處理）
- [x] R10.2 `config/env.ts`：新增 `invidiousApiUrl`（`INVIDIOUS_API_URL`，預設 `http://localhost:1215` 指同機 ytlite）；空字串＝停用、改走 Data API
- [x] R10.3 `youtubeVideoProvider.ts`：搜尋來源改 Invidious 為主、Data API 後備；新增 familyFilter（精選放行 + 非精選平行查 isFamilyFriendly + 唯一 channelId 快取）；先查庫夠就免搜、搜回寫回庫
- [x] R10.4 `providers/videoBank.ts`：本地影片快取庫（`data/videobank.json`）依主題分類累積、videoId 去重持久化、size/get/accumulate/summary；server.ts wiring + a1.videoBankSummary 端點
- [x] R10.5 驗證：`bun run build`（tsc）EXIT=0；恐龍/太陽系新主題實走 Invidious 20 支→寫回庫（★樂樂TV 排第一）、二次同主題 bank_hit 1ms 零外部請求；Data API 配額用罄正好證明已不依賴

## R11. 借鏡 ytlite 的三能力（不搬 OAuth/登入/per-user）

> 反饋：「和 ytlite 有重疊的部份應該滿多的，主要是影片頻道訂閱管理與列表索引機制。」盤點後：搜尋層（Invidious）DD-24 已共用；訂閱管理/列表索引是概念重疊非可搬程式碼（ytlite per-user OAuth vs cecelearn 全域 curated 白名單）。決策：只借鏡三個 cecelearn 缺的能力，全做成全域/無登入/JSON 檔風格（DD-25）。

### Phase A — 家長黑名單（反向硬擋，DD-26）
- [ ] R11.A1 新增 `providers/blocklist.ts`：`Blocklist`（`data/blocklist.json`，比照 channelLibrary 讀寫）；has/add/remove/list；contracts 加 `BlockedChannel` 型別
- [ ] R11.A2 `data/blocklist.json` 種子檔（空清單 + note）；server.ts 注入 Blocklist
- [ ] R11.A3 youtubeVideoProvider：search 結果、familyFilter、bank serve（bank_hit/bank_only）一律先 filter 掉 blocklist 命中的 channelId（硬擋優先於白名單加權）
- [ ] R11.A4 `POST /api/a1/block`（action=block/unblock，body channelId/channelName）管理端點 + blocklist 檢索端點

### Phase B — Feed 預熱（手動端點，DD-27）
- [x] R11.B1 InvidiousClient 新增 `channelLatestVideos(channelId)`：打 `/api/v1/channels/{id}` 取 latestVideos → A1VideoItem[]
- [x] R11.B2 `POST /api/a1/prewarm`：遍歷 channelLibrary active 頻道 → channelLatestVideos → blocklist 硬擋 → 依頻道 topics 寫回 VideoBank；回各主題新增數摘要
- [x] R11.B3 驗證：手動打 prewarm 端點 → channels:4、16 主題共 +525 支寫回庫、videobank.json 持久化。**前置 blocker（DD-29）**：原 Invidious 2026.04.09 頻道 parser 解不出 latestVideos（每筆 type:parse-error，ytlite 同端點同症狀），升級 ytlite Invidious 至 2026.06.15-73a1bac 後 parser 修復、頻道影片正常回

### Phase C — 可點主題索引（動態取自 VideoBank，DD-28）
- [x] R11.C1 前端 client.ts：videoBankSummary 鏡像型別（A1VideoBankTopic/A1VideoBankSummaryResponse）+ videoBankSummary() method；A1Page 載入時 useEffect 打一次取已累積主題（取 count>0、前 8 個）
- [x] R11.C2 前端快捷 chip 列：videoTopics state + .a1-topic-chips 列，點 chip 送「我想看○○的影片」進對話 → find_video（庫足量毫秒服務）；styles.css 加 .a1-topic-chip 樣式（琥珀色，區別於藍色測驗 chip）
- [x] R11.C3 驗證：frontend tsc -b EXIT=0 + vite build EXIT=0；backend tsc EXIT=0

## 4. 收尾 — 文件與驗收

- [x] 4.1 更新 `specs/architecture.md` + `spec.md`：A1 feature/spec 改為小雞對話型、draw intent、inline stream、echo guard、生圖成本閘與 chat/illustrate endpoint 描述
- [x] 4.2 event_record 收尾：故事接龍 continue_story 落地 + 連續性 RCA 已記入 sqlite 事件層（scope=a1_dialogue_tutor，2026-06-19）；DD-21/22/23 已記入 design.md
- [!] 4.3 跑 spec.md Acceptance Checks 全項；plan promote 至 verified（backend/frontend typecheck 通過；chat make_sentence/draw 通過；Nano Banana illustrate 目前回 `ILLUSTRATE_EMPTY`/rate-limit，暫不 promote verified）
