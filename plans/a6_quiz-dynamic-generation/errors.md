# Errors: a6_quiz-dynamic-generation

每個錯誤含使用者可見影響、復原策略、負責層。fail-safe 原則：生題失敗不得輸出錯誤內容（錯答案/錯圖解），寧可少題或退回種子。

## Error Catalogue

| 錯誤碼 | 觸發 | 影響/使用者可見 | 復原 | 負責層 |
|---|---|---|---|---|
| `GEN_GEMINI_FAIL` | callGemini 全金鑰失敗（429/逾時/非 2xx） | 該 KP 該批無題 | 該 KP 略過；其餘 KP 仍回；前端少幾題 | quizGenProvider |
| `GEN_VIZ_STRIPPED` | sanitizeViz 算式不符 | 該題無圖解（題目仍在） | 剝除 viz、保留題目（DD-4） | quizFramework.sanitizeViz |
| `GEN_VALIDATE_DROP` | validate 不過（缺欄位/choices 不含答案） | 該題被剔除 | 丟棄該題；不污染回傳 | quizFramework.validate |
| `FACT_REPOSE_REJECT` | reposeFact 釘答案/選項驗證不過 | — | 退回種子原題（審過的題）（DD-3/DD-8） | quizGenProvider |
| `RANGE_EMPTY` | 該科級無 KP / 無種子 | 回 items:[] | 前端顯示「這個範圍還沒有題目」 | quizGenProvider |

## 已知限制（非錯誤，列為後續）

- `FACT_SEED_QUALITY`：事實種子 reviewed:false，可能偏難/偏長。釘答案保證答案正確，題幹品質待人工審 ~120 條種子。
- `GEN_OFFLINE`：機制科無離線後備；Gemini 全掛時無法出機制科題（事實科可退回本地種子，但仍需取種子）。

## 原則

- 生題失敗 fail-soft：少題可以，輸出錯內容不行。
- 事實題的正確性錨在「種子答案」，不靠模型即時自證。
