# Errors: a6_quiz-voice-answer

每個錯誤含使用者可見訊息、復原策略、負責層。fail-soft：語音失敗永不阻斷打字作答（DD-5）。

## Error Catalogue

| 錯誤碼 | 觸發 | 使用者可見訊息 | 復原 | 負責層 |
|---|---|---|---|---|
| `MIC_NO_SPEECH` | captureOnce / recognizeOnce reject（逾時、沒聲音） | 「沒聽到，再按一次麥克風喔」 | setMicHint、解除 listening、輸入框可打字 | frontend (QuizPage) |
| `MIC_EMPTY_RESULT` | 辨識回空字串 | 「沒聽清楚，再說一次好嗎？」 | setMicHint、解除 listening、輸入框可打字 | frontend (QuizPage) |
| `MIC_UNSUPPORTED` | 裝置不支援辨識（recognizeOnce 無 Ctor） | 沿用 reject → 同 MIC_NO_SPEECH 提示 | 打字作答為唯一路徑 | frontend (recognizeOnce) |

## 已知限制（非錯誤，列為後續）

- `MATH_SPOKEN_NUMERAL_MISMATCH`：數學題口說中文數字（「十二」）辨識回中文字時，現有 `judge()` 數值容忍（`Number()`）無法配對 → 判錯。本次不處理；語音對國語題不受影響。修法：`judge()` 加中文數字→阿拉伯數字正規化。

## 原則

- 語音是輔助路徑，任何失敗都回到「輸入框可打字」的乾淨狀態。
- 不引入 silent fallback：失敗一律給孩子可讀提示，不靜默吞掉。
