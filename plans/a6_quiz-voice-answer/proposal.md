# Proposal: a6_quiz-voice-answer

## Why

- 學科練習（A6 QuizPage）的填空/造詞/跟讀題用文字輸入框作答（placeholder「把答案打進來…」）。
- 目標使用者是國小低年級學童，**還不會中文輸入法**，無法把「國語」題的中文答案打進去——這是實際使用障礙，等同把這些題型對小小孩封死。
- App 已有成熟語音基礎建設（A1 常駐中文辨識 + 英文跟讀「借用主辨識」契約），缺的只是把它接到 QuizPage 的作答框。

## Original Requirement Wording (Baseline)

- 「這種題目要允許語音輸入，因為小孩不會電腦輸入法」（針對國語・填空題截圖：「彩虹出現之前，發生了什麼事？」）

## Requirement Revision History

- 2026-06-19: initial draft created via plan-init.ts
- 2026-06-19: 依使用者單句需求成案；範圍鎖定 QuizPage 文字作答題型加語音輸入

## Effective Requirement Description

1. QuizPage 非選擇題（fill / make_word / read_aloud）的作答框旁提供「用說的作答」麥克風鈕。
2. 辨識結果填入既有輸入框（不直接送出），讓孩子可再修改後送出。
3. 辨識語言依科目自動切換：英文科 `en-US`，其餘（國語／數學）`cmn-Hant-TW`。
4. 不與 A1 常駐中文辨識搶麥克風——借用主辨識的一次性擷取契約；不在 Provider 範圍時退回獨立辨識。
5. 聽不到／辨識失敗給孩子看得懂的提示，狀態於換題時重置。

## Scope

### IN
- A6 QuizPage 文字作答題型（fill / make_word / read_aloud）的語音輸入鈕與狀態。
- 依科目選辨識語言。
- 失敗提示與換題重置。

### OUT
- 選擇題（已是點選，不需語音）。
- 出題、批改、計分、圖解等既有 QuizPage 流程（不更動）。
- 語音辨識核心、A1 主辨識迴圈、英文跟讀契約（複用，不重寫）。
- 數學口說中文數字（「十二」）→ 阿拉伯數字（12）的批改正規化（已知限制，列為後續）。

## Non-Goals

- 不做離線/自建語音模型；沿用瀏覽器 Web Speech API。
- 不持久化語音作答紀錄。

## Constraints

- 必須複用 `useSpeechCapture` 借用主辨識契約（DD-跟讀），避免雙 SpeechRecognition 搶麥克風互相弄聾。
- QuizPage 已渲染在 A1Page 的 `SpeechCaptureContext.Provider` 內，可直接借用；仍需保留不在 Provider 內的獨立辨識退路。
- 視覺沿用既有 `a1-en-speak` 麥克風鈕樣式，不新增 CSS。

## What Changes

- `webapp/frontend/src/features/a6/QuizPage.tsx`：作答框改為「輸入框 + 麥克風鈕」橫列，新增 `listening` / `micHint` 狀態與 `listen()` 擷取處理。

## Capabilities

### New Capabilities
- 學科練習語音作答：填空題可「用說的」，辨識文字回填輸入框後再送出。

### Modified Capabilities
- QuizPage 文字作答框：placeholder 改為「把答案打進來，或按麥克風用說的…」，旁加麥克風鈕與聽取提示。

## Impact

- 受影響檔：`webapp/frontend/src/features/a6/QuizPage.tsx`（唯一）。
- 複用：`shared/speech/recognizeOnce.ts`、`features/a1/speechCapture.ts`（`useSpeechCapture`）、A1Page 提供的 `SpeechCaptureContext`。
- 已知後續：數學口說數字批改正規化（見 OUT）。
