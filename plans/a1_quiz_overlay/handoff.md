# Handoff: a1_quiz_overlay

## Execution Contract

把「小雞老師」對話打造成唯一入口，並讓聽寫(A5)與成語(A2)能由對話喚起為全螢幕 overlay，結束回流成績總結卡。複用既有測驗元件，不重寫其內部邏輯。

## Required Reads

- `plans/a1_quiz_overlay/proposal.md` — 需求與範圍
- `plans/a1_quiz_overlay/design.md` — DD-1~DD-8 決策與 Code Anchors
- `plans/a1_quiz_overlay/spec.md` — GIVEN/WHEN/THEN 與 Acceptance Checks
- `plans/a1_quiz_overlay/diagrams/` — IDEF0(A0) + GRAFCET 觸發狀態機
- `specs/architecture.md` — A1 feature 段落（DD-10/DD-11 語音/echo 約束）
- 現況關鍵檔（design.md Critical Files 全列）

## Execution Order

依 tasks.md phase 1→7 順序。建議切片：
1. 後端 intent（phase 1）先行——它是觸發路徑的源頭，可獨立驗證。
2. 前端型別（phase 2）→ 元件 overlay 化（phase 3）→ 對話狀態與觸發（phase 4）→ 總結卡（phase 5）。
3. Portal/路由（phase 6）與樣式整合（phase 7）收尾。

## Stop Gates In Force

- **麥克風互斥（DD-5/R2）**：overlay 與 A1 語音辨識的資源衝突需實機驗證；若行為異常，停下回報而非疊補丁。
- **既有意圖退化**：若 phase 任一步驟破壞了既有 5 種意圖渲染，停。
- **architecture sync**：phase 7.4 收尾前必同步 specs/architecture.md。

## Execution-Ready Checklist

- [x] proposal / design / spec 完成
- [x] IDEF0 + GRAFCET 驗證通過並存圖
- [x] tasks.md 分階段、可勾選
- [ ] 使用者批准進 implementing（plan_advance --to implementing）

## Validation Plan

- 後端：tsc 編譯 + 手打 /api/a1/chat 驗 intent。
- 前端：tsc + vite build。
- 端到端：spec.md Acceptance Checks 逐項手測（語音/chip 觸發、overlay、麥克風互斥、回流、中途關閉、既有意圖不退化）。

## Notes

- 不重寫語音辨識 useEffect（DD-10）、A5 手寫/評分引擎、A2 出題狀態機。
- 不動生圖成本閘（R8）。
- /a2 /a3 /a5 route 保留為 debug。
- 完成後 event_record 收尾 + 同步 architecture.md（scope=a1_quiz_overlay，repo=cecelearn）。
