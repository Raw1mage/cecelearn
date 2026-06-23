# Errors: a7_idiom_crossword

每個錯誤含：code / 觸發條件 / 使用者可見訊息（6–9 歲友善）/ 復原策略 / 責任層。遵守天條：顯式回報、不 silent fallback。

## Error Catalogue

### 後端（idiomCrosswordProvider / module / server）

| code | 觸發條件 | 使用者可見訊息 | 復原策略 | 責任層 |
|---|---|---|---|---|
| `GENERATION_FAILED` | MAX_ATTEMPTS 內排不出合法盤（≥2 成語 + ≥1 交叉） | 「題目正在準備中，再試一次好嗎？」 | 前端顯示「再試一次」鈕，重新 `GET /api/a7/puzzle` | provider → module 包成 `{ok:false}` |
| `IDIOM_DB_EMPTY` | idioms.json 載入失敗或過濾後 < 2 條四字成語 | 「題目庫還沒準備好喔！」 | 顯式回 `{ok:false}`；後端啟動 log warn；不回殘缺盤 | provider 載入層 |
| `INVALID_QUERY` | level/difficulty query 非法（如 difficulty 非列舉值） | （不顯給小朋友，前端用預設值） | 後端忽略非法值套預設 normal/easy；不報錯給孩子 | server route 解析層 |

### 前端（A7Page / useCrossword / api client）

| code | 觸發條件 | 使用者可見訊息 | 復原策略 | 責任層 |
|---|---|---|---|---|
| `PUZZLE_FETCH_FAILED` | `getCrosswordPuzzle` 網路/非 2xx/解析失敗 | 「連不上題目，再試一次！」 | 顯示「再試一次」鈕重抓；不進入殘缺盤 | api client / A7Page |
| `PUZZLE_SHAPE_INVALID` | 回傳 puzzle 不符 data-schema（缺 slots/tray/cells） | 「題目怪怪的，換一題吧！」 | 視為失敗，提供重抓；console.error 記形狀 | A7Page 防禦層 |
| `TTS_UNAVAILABLE` | 瀏覽器不支援 SpeechSynthesis 或朗讀失敗 | （靜默，不擋遊戲）朗讀鈕無作用提示「這個裝置不能唸喔」 | fail-soft：教學文字照常顯示，僅朗讀降級 | shared/speech/tts |

## 設計原則

- 後端生成失敗一律走 `{ok:false, error, message}`，**不**回半成品盤面（INV 不可破）。
- 前端對所有後端回應做 shape 防禦（`PUZZLE_SHAPE_INVALID`），不信任直接 render。
- 教學朗讀（TTS）是增強功能，失敗 fail-soft，不阻斷主玩法。
- 無任何 silent fallback / 自動換題掩蓋錯誤；換題一律由小朋友主動點「再試一次/下一關」。
