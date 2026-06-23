# Handoff: a7_idiom_crossword

## Execution Contract

執行者要打造 cecelearn 的成語交叉填字遊戲模組（a7）。**核心技術風險在後端排盤演算法**（先做、先驗），UI 後接。MVP 範圍嚴格依 proposal.md（不做完整金幣經濟、不做水墨新樣式）。

## Required Reads

1. `plans/a7_idiom_crossword/proposal.md` — 範圍與使用者決策（5 項拍板）
2. `plans/a7_idiom_crossword/spec.md` — 行為需求與驗收場景
3. `plans/a7_idiom_crossword/design.md` — **排盤演算法 + taxonomy + invariants**（最重要）
4. `plans/a7_idiom_crossword/data-schema.json` — A7 對外契約型別
5. `plans/a7_idiom_crossword/tasks.md` — 分階段執行清單
6. 既有程式對照：
   - `webapp/backend/src/providers/idiomQuizEngine.ts`（idioms.json 讀取/shuffle 模式）
   - `webapp/backend/src/contracts/providers.ts`（契約風格、A1ErrorResponse 形狀）
   - `webapp/backend/src/server.ts`（route 註冊方式）
   - `webapp/frontend/src/features/a6/QuizPage.tsx`（overlay/狀態機/celebrate/score/tts 用法）
   - `webapp/frontend/src/shared/{speech/tts,celebrate,ScoreContext,api/client}.ts`
   - `webapp/frontend/src/App.tsx`（route 掛載）

## Critical Invariants（驗收硬條件，design.md INV-1..4）

- INV-1：每個 blank 的正解字必在 tray 中。
- INV-2：交叉點字同時滿足兩條成語（crossOK 保證重疊格字相同）。
- INV-3：交叉點一律 given（MVP），避免一格被兩條 blank 同時要求不同字。
- INV-4：tray 字數 == blank 數（MVP 無誘答）。
- 可解性 oracle：把每個 blank 填回其 cell.char 後，每條 slot 拼字 == 該 slot.idiom。

## Stop Gates In Force

1. **排盤失敗率過高**（Phase 2.3）：若調參後 MAX_ATTEMPTS 內仍頻繁生不出 2 成語+1 交叉的盤面 → 停，回報數據與選項（放寬門檻／改演算法／加手工種子）。
2. **契約破壞性變更**：若 data-schema.json 不足以支撐實作、需改契約形狀 → 停，提案後等批准（architecture_change）。
3. **需改 idioms.json 結構**（補釋義欄位）：MVP 用例句兜底不需改；若決定接 moeProvider 補釋義 → 屬 scope 擴張，停並確認。
4. **入口/導覽設計**（Phase 5.2）：a7 進入點放哪、是否要從 a1 對話流觸發 → 若無既有明確慣例可循，確認後再做。

## Validation Plan

- 後端：Phase 2.2 單元測試斷言 INV-1..4 + 可解性 oracle（跑 ≥100 次生成）；Phase 2.4 curl 驗 API 形狀。
- 前端：Phase 5.4 `tsc` 無錯；Phase 5.3 `./webctl.sh restart` 後手動跑完 spec.md 全部 Acceptance Checks。
- 零成本驗證：確認 `/api/a7/puzzle` 不觸發任何外部 API（純本地 idioms.json + 演算法）。

## Execution-Ready Checklist

- [x] proposal / spec / design / data-schema / idef0 / grafcet / tasks 齊備
- [x] 演算法 taxonomy 與 invariants 已定義（design.md）
- [x] 關鍵檔案清單與既有可重用 anchor 已列（design.md Critical Files / Code Anchors）
- [x] 使用者 5 項決策已定錨（proposal.md）
- [ ] 進入 implementing（首個 task 勾選時自動轉態）

## Notes

- 沿用既有分層慣例，不引入新框架/服務/DB。
- 不 silent fallback：生成失敗顯式回 `{ok:false}`。
- 不新增 fallback mechanism（使用者天條）；提示/錯誤皆顯式。
- commit 前須：tasks.md checkbox 同步、event_record 收尾、specs/architecture.md 同步檢查。
