# Implementation Spec

## Goal

- 實作 A5 聽寫練習功能，提供四種題型（描寫/聽寫/選擇/手寫）和課綱篩選出題，整合遊戲化計分。

## Scope

### IN

- 後端出題引擎（vocabQuizEngine）+ API endpoint
- 前端 A5 頁面完整流程（設定 → 答題 → 結果 → 回顧）
- 四種題型各自的答題元件
- TTS 語音整合
- 計分 + combo + 煙火特效

### OUT

- 音效素材（未來加）
- 等級徽章持久化
- 錯題本 / 間隔重複

## Assumptions

- HanziWriter CDN 版本支援 quiz() 和 animateCharacter() API（已在 A1 驗證）
- speechSynthesis API 在目標瀏覽器（Chrome/Safari）可用且支援 zh-TW
- vocabulary.json 資料結構穩定（已有 816 課 2979 字）
- 教育部辭典 HTTP 爬取持續可用（已在 A1 驗證）

## Stop Gates

- 若 HanziWriter quiz 模式無法在行動裝置觸控正常運作 → 需替代手寫方案
- 若 speechSynthesis 在主要目標平台不可用 → 聽寫題型延後
- 若教育部辭典改版導致爬取失敗 → 例句題型改用 Gemini 生成

## Critical Files

- `webapp/backend/src/providers/vocabQuizEngine.ts` — 核心出題引擎
- `webapp/backend/src/contracts/providers.ts` — A5 型別定義
- `webapp/backend/src/server.ts` — 路由新增
- `webapp/frontend/src/features/a5/A5Page.tsx` — 主頁面容器
- `webapp/frontend/src/features/a5/QuizSetup.tsx` — 出題設定
- `webapp/frontend/src/features/a5/modes/TraceMode.tsx` — 描寫練習
- `webapp/frontend/src/features/a5/modes/DictationMode.tsx` — 聽寫測驗
- `webapp/frontend/src/features/a5/modes/ChoiceMode.tsx` — 選擇填空
- `webapp/frontend/src/features/a5/modes/HandwriteMode.tsx` — 手寫填空
- `webapp/frontend/src/features/a5/QuizResult.tsx` — 結果頁
- `webapp/frontend/src/shared/api/client.ts` — API 方法新增
- `webapp/frontend/src/App.tsx` — 路由新增
- `webapp/frontend/src/routes/PortalPage.tsx` — 卡片入口

## Structured Execution Phases

- Phase 1: 後端出題引擎 + API — 載入 vocabulary.json，實作篩選邏輯和題目生成，新增 `/api/a5/quiz` 路由
- Phase 2: 前端骨架 + 描寫練習（題型 D）— A5Page 流程狀態機，QuizSetup 出題設定 UI，TraceMode 描寫元件（HanziWriter quiz），計分整合
- Phase 3: 聽寫測驗（題型 C）— DictationMode 元件，TTS speechSynthesis 整合，多字逐字手寫串接，重聽功能
- Phase 4: 例句填空（題型 A+B）— 後端即時爬取教育部辭典例句，ChoiceMode 選擇題元件，HandwriteMode 手寫元件
- Phase 5: 遊戲化強化 — Combo 連擊系統，即時得分飄字動畫，全對煙火特效，等級徽章（Header 顯示）

## Validation

- Phase 1: `curl -X POST localhost:3014/api/a5/quiz -d '{"mode":"random","questionCount":5,"quizType":"trace"}'` 回傳 5 題含 character + bopomofo
- Phase 1: `curl -X POST localhost:3014/api/a5/quiz -d '{"mode":"curriculum","publisher":"康軒版","grade":"3年級","questionCount":3,"quizType":"trace"}'` 回傳 3 年級康軒生字
- Phase 2: 瀏覽器開 `/a5`，選描寫練習，完成 3 題，計分板加 3 分
- Phase 3: 瀏覽器開 `/a5`，選聽寫測驗，聽到語音唸出詞語，手寫完成，計分
- Phase 4: 瀏覽器開 `/a5`，選例句填空，看到挖空例句 + 4 選項，答對計分
- Phase 5: 連續答對 5 題以上，看到 combo 計數器和加倍提示
- 全流程：TypeScript 編譯無錯誤（`tsc --noEmit`）

## Handoff

- Build agent must read this spec first.
- Build agent must read companion artifacts before coding.
- Build agent must materialize runtime todo from tasks.md.
