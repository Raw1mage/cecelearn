# Handoff: a6_quiz-dynamic-generation

## Execution Contract

學科練習出題後端：全科 runtime 動態生題，無機制科死題庫。題型框架單一真相源（quizFramework.ts）由 runtime（QuizGenProvider）與離線 CLI 共用。機制科（國/數/英）從 curriculum 知識點即時生、viz 安全網把關；事實科（自然/社會）從事實種子重包裝、釘答案、失敗退回種子。已實作完成，本包為補文件。

## Required Reads

- `plans/a6_quiz-dynamic-generation/proposal.md` — Why 與範圍
- `plans/a6_quiz-dynamic-generation/design.md` — DD-1~DD-8、Architecture、Code anchors
- `plans/a6_quiz-dynamic-generation/spec.md` — GIVEN/WHEN/THEN 與 Acceptance Checks
- `webapp/backend/src/providers/quizFramework.ts` — 框架單一真相源
- `webapp/backend/src/providers/quizGenProvider.ts` — runtime 編排
- `webapp/backend/data/curriculum.schema.json` — 兩層資料契約

## Related Plans

- `plans/a1_quiz_overlay/` — QuizPage 出題 overlay（消費 /api/quiz）
- `plans/a6_quiz-voice-answer/` — QuizPage 語音作答
- `specs/a1_dialogue_tutor/` — start_quiz 意圖（觸發出題）

## Execution Order（已完成）

1. quizFramework.ts 框架（phase 1）
2. quizGenProvider.ts / quizBankProvider.ts（phase 2-3）
3. server.ts 路由接線（phase 4）
4. 資料資產 + 驗證（phase 5-6）

## Stop Gates In Force

- 數學圖解永不畫錯：viz 算式對不上一律剝除，不得餵不一致 viz 給前端 SVG（DD-4）。
- 事實題永不出錯答案：reposeFact 正解必須等於種子答案，不過退回種子原題（DD-3/DD-8）。
- 框架單一真相源：sanitizeViz / reposeFact 契約只此一份，runtime 與 CLI 共用（DD-5）。

## Execution-Ready Checklist

- [x] backend tsc 綠
- [x] frontend tsc 綠（API 形狀不變）
- [x] live 驗：機制科即時生、事實科釘答案 + 變化、meta 26 組
- [x] curriculum.json / quizbank.json 就位

## Validation Plan

見 spec.md Acceptance Checks 與 test-vectors.json；以 live curl /api/quiz 與 /api/quiz/meta 為主，輔以獨立節點腳本驗 viz 算式一致性。

## Notes

事實種子 reviewed:false，上線前需人工抽審；scripts/gen-quizbank.mjs 框架拷貝待併。
