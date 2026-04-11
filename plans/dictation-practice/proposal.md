# Proposal

## Why

- 國小學童需要針對「聽寫」能力做加強，這是校內考試的核心技能
- 目前 cecelearn 有查字（A1）、成語（A2）、算數（A3），缺少聽寫 / 寫字練習功能
- 生字題庫已就緒（vocabulary.json：3 出版社 × 6 年級 × 816 課 = 2,979 字）
- HanziWriter quiz 模式已在 A1 驗證可行

## Original Requirement Wording (Baseline)

- "預計還會新增幾張卡片。尤其是希望針對小孩的「聽寫」能力做加強。也就是題目用語音出題，小孩在畫面上手寫答案。題目的理想模式是根據教材課程年級進度區分，但這個也需要去爬資料來源才會有。短期只能先土法建立題庫，並比照成語題目一樣用兩種模式出題。要克服的困難就是手寫辨識給分，並設法遊戲化給予特效和分數。"

## Requirement Revision History

- 2026-04-11: 初始需求確立。生字表已從 stroke.gh.miniasp.com 爬取完成。
- 2026-04-11: 功能計畫 plan.md 完成，確立四種題型和遊戲化設計。
- 2026-04-11: 使用者要求用 planner 補齊實作細節。

## Effective Requirement Description

1. 提供國小學童多種模式的國字練習功能（選擇填空、手寫填空、聽寫、描寫）
2. 出題範圍支援隨機、按課綱篩選（出版社/年級/課次）、家長自訂三種模式
3. 手寫辨識使用 HanziWriter quiz 模式（已驗證）
4. 語音出題使用瀏覽器 speechSynthesis API（免費、離線）
5. 計分遊戲化：即時反饋、combo 連擊、等級徽章、煙火特效
6. 題庫來源：vocabulary.json（靜態）+ 教育部辭典（即時爬取例句）

## Scope

### IN

- A5 聽寫練習卡片（前端 + 後端）
- 四種題型的前端互動介面
- 後端出題 API：從 vocabulary.json 篩選 + 教育部辭典取例句
- 計分整合（ScoreContext）+ 遊戲化特效
- Portal 首頁新增 A5 卡片入口

### OUT

- 英文單字練習（M7 獨立規劃）
- 教材進度同步（需另案爬取各版教科書進度表）
- 家長報表 / 學習歷程追蹤
- 錯題本 / 間隔重複演算法
- 後端資料庫（繼續使用 JSON 檔案）

## Non-Goals

- 不做使用者帳號系統
- 不做本地持久化存儲（分數仍為揮發式）
- 不做音效（保留給未來遊戲化階段）

## Constraints

- HanziWriter 是 CDN 載入的外部庫，不能用 npm import
- TTS 品質取決於瀏覽器和作業系統（iOS Safari 表現最好，桌面 Chrome 次之）
- 教育部辭典爬取有延遲（200-500ms/字），例句題需要即時爬取
- Gemini API key 是 free tier，每分鐘 5-15 次限制

## What Changes

- 新增 `webapp/frontend/src/features/a5/` 目錄（6-8 個前端檔案）
- 新增 `webapp/backend/src/providers/vocabQuizEngine.ts`（後端出題引擎）
- 新增 `webapp/backend/src/modules/a5.ts`（模組工廠）
- 修改 `webapp/backend/src/server.ts`（新增 `/api/a5/quiz` 路由）
- 修改 `webapp/backend/src/contracts/providers.ts`（新增 A5 型別）
- 修改 `webapp/frontend/src/App.tsx`（新增 A5 路由）
- 修改 `webapp/frontend/src/routes/PortalPage.tsx`（新增卡片）
- 修改 `webapp/frontend/src/shared/api/client.ts`（新增 API 方法）
- 修改 `webapp/frontend/src/styles.css`（A5 專屬樣式）

## Capabilities

### New Capabilities

- **描寫練習**：展示筆順動畫後進入 HanziWriter quiz 手寫練習
- **聽寫測驗**：TTS 唸出詞語 + 注音，學童手寫作答
- **例句選擇**：從教育部辭典取例句，挖空填空 4 選 1
- **例句手寫**：例句填空 + HanziWriter 手寫作答
- **課綱篩選**：三層下拉選單（出版社 → 年級 → 課次）
- **即時反饋**：答對綠色 + 得分動畫，答錯紅色 + 正確答案
- **Combo 連擊**：連續答對顯示火焰 + 加倍計分

### Modified Capabilities

- **計分板**：增加 A5 的得分來源（多種題型不同分值）
- **Portal 首頁**：新增第四張功能卡片

## Impact

- 前端新增約 800-1200 行程式碼
- 後端新增約 200-300 行程式碼
- 無 breaking change，純新增功能
- 不影響現有 A1/A2/A3 功能
