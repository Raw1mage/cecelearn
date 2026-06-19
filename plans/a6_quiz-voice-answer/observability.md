# Observability: a6_quiz-voice-answer

## Events

純前端互動；可選 console 結構化事件（沿用既有命名風格，非必需）。

| 事件 | 觸發點 | 欄位 |
|---|---|---|
| `quiz.voice.start` | 按下麥克風鈕 | subject, lang, source（capture/recognizeOnce） |
| `quiz.voice.result` | 辨識回填 | subject, len（辨識字數） |
| `quiz.voice.fail` | reject 或空回 | subject, reason（no_speech/empty/unsupported） |

## Metrics

可由事件聚合，非必須儀表板。

- 語音使用率（voice.start / 填空題顯示次數）：驗證孩子是否真的用語音。
- 語音失敗率（voice.fail / voice.start）：辨識可用性。
- 科目分布：確認國語為主要受益題型。

## Logs

- 無後端變更，無新增後端 log。
- 前端事件僅為開發期 debug 用途。

## Alerts

- 前端互動功能，無伺服器告警。
- 開發期觀測重點：voice.fail 比例偏高 → 檢查麥克風權限/辨識語言。

## Debug checkpoints（對應 code-thinker syslog contract）

- **Boundary 1**：按鈕 → listen() 進入（listening=true、lang 正確）。
- **Boundary 2**：listen() → 辨識來源（capture 借用 vs recognizeOnce 退路擇一）。
- **Boundary 3**：辨識結果 → 回填或提示（setInput 或 setMicHint 二擇一，listening 必還原 false）。
