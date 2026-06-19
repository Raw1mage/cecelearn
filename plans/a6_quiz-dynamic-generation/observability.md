# Observability: a6_quiz-dynamic-generation

## Events

後端 console 結構化日誌（沿用既有風格）。

| 事件 | 觸發點 | 欄位 |
|---|---|---|
| `[QuizGen] runtime 生題就緒` | 啟動 | 機制科組數、知識點數 |
| `[QuizBank] 載入` | 啟動 | 種子數、知識點數 |
| `[QuizGen] <kpId> 生題失敗` | genForKp throw | kpId、err |

## Metrics

可由日誌/請求記錄聚合，非必須儀表板。

- 生題延遲（/api/quiz p50/p95）：runtime 生題對 QuizPage loading 的影響。
- viz 剝除率（vizStripped / 含 viz 題數）：模型 viz 一致性；偏高代表 prompt 要再收緊。
- 事實退回率（fail-safe 退回 / 事實題數）：reposeFact 釘答案通過率；偏高代表種子或 prompt 問題。

## Logs

- 後端 stdout（webctl logs backend）。
- 請求記錄 request.log（含 /api/quiz 狀態與延遲）。

## Alerts

無自動告警（個人專案）；以 viz 剝除率、事實退回率人工巡檢為主。

## Debug checkpoints（對應 code-thinker syslog contract）

- 機制科出題異常 → 看 genForKp 是否 throw、validate 剔除原因。
- 數學圖解疑似畫錯 → 不可能（sanitizeViz 把關）；若發生，查是否有繞過安全網的路徑。
- 事實題答案疑似錯 → 查該題是否退回種子；種子答案本身錯則屬 FACT_SEED_QUALITY，需審種子。
