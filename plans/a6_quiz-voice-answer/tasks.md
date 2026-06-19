# Tasks: a6_quiz-voice-answer

對應 spec.md Requirements 與 design.md Decisions。本功能為單檔變更（QuizPage.tsx）。

## 1. 借用主辨識接線

- [x] 1.1 `QuizPage.tsx` import `useSpeechCapture`（features/a1/speechCapture）與 `recognizeOnce`（shared/speech）（DD-3）
- [x] 1.2 元件內取 `const capture = useSpeechCapture()`

## 2. 語音作答狀態與處理

- [x] 2.1 新增 `listening` / `micHint` 狀態（DD-6）
- [x] 2.2 `listen()`：依 `item.subject` 選 lang（DD-4）→ capture?.captureOnce 或 recognizeOnce → 成功 setInput、空回/失敗 setMicHint（DD-2/DD-5）
- [x] 2.3 換題 `next()` 與新測驗 `start()` 重置 listening/micHint（DD-6）

## 3. 作答區 UI

- [x] 3.1 非選擇題分支改為「輸入框 + 麥克風鈕」橫列，鈕沿用 `a1-en-speak` 樣式（聽取中 🎙️…、否則 🎤）（DD-1）
- [x] 3.2 placeholder 改「把答案打進來，或按麥克風用說的…」；micHint 以 `.muted` 顯示於下方
- [x] 3.3 選擇題分支不變（無麥克風鈕）

## 4. 驗證

- [x] 4.1 `tsc --noEmit` 前端型別檢查通過
- [ ] 4.2 實機端到端：真機麥克風授權 → 國語填空口說 → 回填 → 送出批改（headless 無麥克風，待真機）
