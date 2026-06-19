# Handoff: a6_quiz-voice-answer

## Execution Contract

學科練習（A6 QuizPage）填空類題型（fill / make_word / read_aloud）加「用說的作答」麥克風鈕，給不會中文輸入法的低年級學童使用。複用既有借用主辨識契約，單檔變更，不重寫辨識核心、不動出題/批改流程。

## Required Reads

- `plans/a6_quiz-voice-answer/proposal.md` — 需求與範圍
- `plans/a6_quiz-voice-answer/design.md` — DD-1~DD-6 決策與 Code anchors
- `plans/a6_quiz-voice-answer/spec.md` — GIVEN/WHEN/THEN 與 Acceptance Checks
- `webapp/frontend/src/features/a1/speechCapture.ts` — useSpeechCapture 借用主辨識契約
- `webapp/frontend/src/shared/speech/recognizeOnce.ts` — 無 Provider 退路
- `plans/a1_quiz_overlay/design.md` DD-5 — 麥克風互斥同源約束

## Execution Order

單檔（QuizPage.tsx），依 tasks.md：
1. 接線 import + useSpeechCapture（phase 1）。
2. listen() 處理 + listening/micHint 狀態 + 換題重置（phase 2）。
3. 作答區 UI 橫列 + 麥克風鈕（phase 3）。
4. tsc 驗證（phase 4）。

## Stop Gates In Force

- **借用主辨識（DD-3）**：嚴禁在 QuizPage 另開第二支 SpeechRecognition——會與 A1 常駐中文辨識搶麥克風互相弄聾。必須走 useSpeechCapture / recognizeOnce。
- **不自動送出（DD-2）**：辨識結果只回填，不可直接觸發 submit。
- **fail-soft（DD-5）**：辨識失敗不得丟例外阻斷作答；打字路徑永遠保留。

## Execution-Ready Checklist

- [x] proposal / design / spec 完成
- [x] IDEF0 + GRAFCET + sequence + data-schema 完成
- [x] tasks.md 可勾選
- [x] 已實作並 tsc 通過（功能於本 session 完成）

## Validation Plan

- 前端：`tsc --noEmit` 通過（已驗）。
- 端到端：spec.md Acceptance Checks 逐項；實機麥克風授權 → 國語填空口說 → 回填 → 送出批改（待真機）。

## Notes

- 數學口說中文數字批改正規化為已知後續（見 proposal OUT / errors.md）。
- 視覺沿用 `a1-en-speak` 麥克風鈕樣式，無新增 CSS。
