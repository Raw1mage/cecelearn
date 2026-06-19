# Spec: a6_quiz-voice-answer

## Purpose

定義「學科練習（A6 QuizPage）文字作答題型支援語音輸入」的行為需求。受益對象是不會中文輸入法的低年級學童；語音為輔助輸入路徑，不取代打字、不更動既有出題/批改流程。

## Requirements

### Requirement: 填空題提供語音作答入口

#### Scenario: 非選擇題顯示麥克風鈕
- **GIVEN** 學童作答一題 `fill` / `make_word` / `read_aloud`
- **WHEN** 作答區渲染
- **THEN** 文字輸入框旁出現「用說的作答」麥克風鈕
- **AND** 輸入框 placeholder 提示可打字或用說的

#### Scenario: 選擇題不顯示麥克風鈕
- **GIVEN** 學童作答一題 `choice`
- **WHEN** 作答區渲染
- **THEN** 僅顯示選項按鈕，無麥克風鈕（已是點選互動）

### Requirement: 語音辨識結果回填輸入框

#### Scenario: 辨識成功
- **GIVEN** 學童按下麥克風鈕並說出答案
- **WHEN** 辨識回傳非空文字
- **THEN** 文字填入答案輸入框
- **AND** 學童可再修改後按「送出答案」（不自動送出）

#### Scenario: 依科目選辨識語言
- **GIVEN** 題目科目為 `english`
- **WHEN** 啟動語音辨識
- **THEN** 以 `en-US` 辨識
- **AND** 其餘科目（國語／數學）以 `cmn-Hant-TW` 辨識

### Requirement: 不與主辨識搶麥克風

#### Scenario: 在對話 Provider 內借用主辨識
- **GIVEN** QuizPage 渲染於 A1Page 的 SpeechCaptureContext 內
- **WHEN** 學童按下麥克風鈕
- **THEN** 借用 A1 主辨識的一次性擷取（captureOnce），不新開第二支辨識器

#### Scenario: 無 Provider 時退回獨立辨識
- **GIVEN** QuizPage 不在 SpeechCaptureContext 範圍
- **WHEN** 學童按下麥克風鈕
- **THEN** 退回獨立單發辨識 recognizeOnce(lang)

### Requirement: 失敗給看得懂的提示且不阻斷打字

#### Scenario: 聽不到或辨識失敗
- **GIVEN** 學童按下麥克風鈕
- **WHEN** 辨識 reject 或回空字串
- **THEN** 顯示提示語（「沒聽到，再按一次麥克風喔」/「沒聽清楚，再說一次好嗎？」）
- **AND** 輸入框維持可打字，作答不被阻斷

#### Scenario: 換題重置提示
- **GIVEN** 上一題曾出現語音提示
- **WHEN** 進入下一題或開始新測驗
- **THEN** 提示與聽取狀態清空

## Acceptance Checks

- [x] 非選擇題（fill / make_word / read_aloud）作答框旁渲染麥克風鈕；選擇題不渲染。
- [x] 辨識結果回填輸入框、不自動送出；可修改後送出。
- [x] 英文科以 en-US、國語/數學以 cmn-Hant-TW 辨識。
- [x] 優先 useSpeechCapture().captureOnce 借用主辨識；無 Provider 退回 recognizeOnce。
- [x] 辨識失敗/空回顯示孩子可讀提示，打字路徑不被阻斷。
- [x] listening / micHint 於換題（next）與新測驗（start）重置。
- [x] `tsc --noEmit` 前端型別檢查通過。
- [ ] 實機麥克風端到端驗證（瀏覽器權限 + 真實口說回填）— headless 無麥克風，待真機確認。
