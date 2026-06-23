# Tasks: a7_idiom_crossword

> Phase 結構即執行階段；每完成一項立即勾選並 plan-sync。狀態筆記見 design.md DD。

## 1. 後端契約與生成演算法

- [x] 1.1 在 `webapp/backend/src/contracts/providers.ts` 追加 A7 型別（A7Cell / A7Slot / A7GridBounds / A7CrosswordPuzzle / A7PuzzleSuccessResponse / A7ErrorResponse）+ `IdiomCrosswordProvider` interface（對齊 data-schema.json）
- [x] 1.2 新增 `webapp/backend/src/providers/idiomCrosswordProvider.ts`：載入 idioms.json（過濾四字成語）、buildCharIndex（反向索引）
- [x] 1.3 實作排盤核心：seed 首條成語、findCrossingCandidate、crossOK、place、MAX_ATTEMPTS 迴圈（design.md 演算法）
- [x] 1.4 實作 toPuzzle：交叉字設 given、其餘隨機挑 1~2 字設 blank、組 tray（無誘答）、附 slot 例句（meaning 可空）
- [x] 1.5 失敗顯式回 null → module 轉 `{ok:false, error:'GENERATION_FAILED'}`（不 silent fallback，DD-9）
- [x] 1.6 新增 `webapp/backend/src/modules/a7.ts`（薄封裝 provider.generate）

## 2. 後端路由與單元驗證

- [x] 2.1 在 `webapp/backend/src/server.ts` 註冊 `GET /api/a7/puzzle`（解析 level/difficulty query → 呼叫 module → 回 JSON）
- [x] 2.2 寫生成器單元測試（或一次性腳本）：對 N 次生成斷言 INV-1..4（tray 字數=blank 數、交叉字一致、把 blank 填回後每條 slot 拼字==idiom）
- [x] 2.3 量測排盤失敗率（MAX_ATTEMPTS 下 fail rate），若過高調參數（門檻=2 成語+1 交叉）
- [x] 2.4 curl `GET /api/a7/puzzle` 驗證回傳形狀符合 data-schema

## 3. 前端契約與資料層

- [x] 3.1 在 `webapp/frontend/src/shared/api/client.ts` 鏡像 A7 型別 + `getCrosswordPuzzle(level?, difficulty?)`
- [x] 3.2 新增 `webapp/frontend/src/features/a7/useCrossword.ts`：填字狀態 hook（fillState map、tray 已用狀態、place/clear/hint/reset、單槽校驗、整盤完成偵測）

## 4. 前端 UI 元件

- [x] 4.1 新增 `components/CrosswordBoard.tsx`：依 gridBounds 用 CSS grid 佈局，渲染 given/blank cell、交叉點、已完成槽高亮
- [x] 4.2 新增 `components/CharTray.tsx`：底部備選字塊，點選態/已用態
- [x] 4.3 新增 `A7Page.tsx`：狀態機（loading/play/result），整合 board+tray+提示鈕+重置鈕+過關卡片
- [x] 4.4 教學揭曉：單槽完成顯示釋義（兜底例句）+ 🔊 用 `shared/speech/tts` 朗讀
- [x] 4.5 過關回饋：`celebrate()` + `useScore().addScore` + 「下一關/回首頁」
- [x] 4.6 在 `webapp/frontend/src/styles.css` 加 a7 樣式（沿用主題變數，大字可點，6–9 歲友善）

## 5. 路由與整合驗證

- [x] 5.1 `webapp/frontend/src/App.tsx` 掛 `/a7` route
- [x] 5.2 入口：在首頁/導覽加入進入 a7 的連結（對齊既有模組入口慣例）
- [x] 5.3 `./webctl.sh restart` 後手動驗收 spec.md Acceptance Checks 全部場景（生成→填字→提示→教學→過關→重置→失敗回報）
- [x] 5.4 前端 build 通過（tsc 無錯）

## 6. 文件與收尾

- [x] 6.1 更新 README.md 功能總覽（加入 a7 成語填字闖關）
- [x] 6.2 更新 CHANGELOG.md
- [x] 6.3 同步 `specs/architecture.md`（新增 a7 模組邊界、資料流；若無架構文件則記註）
- [x] 6.4 event_record 收尾（Key Decisions / Issues / Verification / Remaining）
