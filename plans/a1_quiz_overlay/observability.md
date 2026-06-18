# Observability: a1_quiz_overlay

## Events

前端 console.log 結構化事件，沿用既有 a1.* 命名。

| 事件 | 觸發點 | 欄位 |
|---|---|---|
| `a1.chat.intent` | 後端回 intent（既有，擴充） | intent（含 start_dictation/start_idiom）, latencyMs |
| `a1.overlay.open` | overlay 開啟 | mode（dictation/idiom）, trigger（intent/chip） |
| `a1.overlay.close` | overlay 關閉 | mode, reason（complete/manual） |
| `a1.overlay.summary` | 回流總結卡插入 | mode, correct, total, maxCombo? |
| `a1.mic.suspend` | overlay 開啟暫停辨識 | wasListening |
| `a1.mic.resume` | overlay 關閉恢復辨識 | resumed（bool） |

## Metrics

可由 console 事件聚合，非必須儀表板。

- overlay 觸發來源分布（intent vs chip）：驗證雙路徑都被使用。
- overlay 完成率（complete / open）：中途關閉比例。
- 聽寫/成語平均答對率：沿用既有 ScoreContext。

## Logs

- 後端 `a1.chat.request` / `a1.chat.intent`（既有）涵蓋新 intent，無需新增後端 log。
- 前端 overlay 生命週期事件為新增，協助 debug 麥克風互斥（R2）與掛載失敗（OVERLAY_MOUNT_FAIL）。

## Alerts

- 本功能為前端互動，無伺服器告警。
- 開發期觀測重點：`a1.mic.resume` 的 resumed=false（麥克風未恢復，對應 MIC_RESUME_FAIL）需人工注意。

## Debug checkpoints（對應 code-thinker syslog contract）

- **Boundary 1**：對話 → 意圖判定（a1.chat.intent 是否回對新 intent）。
- **Boundary 2**：意圖 → overlay 開啟（a1.overlay.open + a1.mic.suspend 成對出現）。
- **Boundary 3**：overlay → 對話回流（a1.overlay.close + a1.mic.resume + a1.overlay.summary 一致性）。
- 麥克風狀態是跨 A1↔overlay 邊界的關鍵 state，三個 boundary 都需觀測 wantListening 真值。
