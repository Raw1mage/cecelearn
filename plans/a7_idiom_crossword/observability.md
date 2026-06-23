# Observability: a7_idiom_crossword

對齊 cecelearn 既有結構化 log 慣例（如 `a1.chat.cascade`、`a1.illustrate.cascade`）。a7 用 `a7.*` 命名空間。零後端成本，log 為主要觀測手段。

## Events

### 後端結構化 Log（webapp/backend）

| event | 觸發點 | 欄位 | 用途 |
|---|---|---|---|
| `a7.puzzle.generate` | 每次 `GET /api/a7/puzzle` 成功 | `{ level, difficulty, idiomCount, blankCount, intersectionCount, attempts, durationMs }` | 觀測排盤規模與耗時 |
| `a7.puzzle.fail` | 生成失敗回 `{ok:false}` | `{ level, difficulty, attempts, error }` | **關鍵**：監控排盤失敗率（design R-1） |
| `a7.db.load` | provider 啟動載入 idioms.json | `{ total, fourCharCount }` | 確認素材庫就緒 |

## 後端啟動 health probe（對齊既有 server.ts startup probe 慣例）

- 啟動時載入 idioms.json，log `a7.db.load`；若 fourCharCount < 2 則 log warn（不崩，API 才回 `IDIOM_DB_EMPTY`）。

## 前端可觀測（console / 既有遙測風格）

| 訊號 | 觸發 | 用途 |
|---|---|---|
| `console.error` PUZZLE_FETCH_FAILED / PUZZLE_SHAPE_INVALID | 抓題或形狀防禦失敗 | 前端診斷 |
| ScoreContext addScore | 過關加分 | 沿用既有分數遙測 |

## Metrics

### 關鍵指標（人工從 log 觀測，MVP 不建 dashboard）

- **排盤失敗率** = `a7.puzzle.fail` / (`a7.puzzle.generate` + `a7.puzzle.fail`)。design Phase 2.3 驗收門檻；過高需調參。
- **平均 attempts**：`a7.puzzle.generate.attempts` 分布，反映演算法效率。
- **平均 blankCount / intersectionCount**：盤面難度分布。

## 驗收期觀測（Phase 2.2/2.3）

- 單元測試/腳本跑 ≥100 次生成，統計失敗率、attempts 分布、INV-1..4 通過率，輸出到測試 log。
- curl 抽樣驗 `a7.puzzle.generate` log 欄位齊全。

## 不做（MVP OUT）

- 不接外部遙測服務（Grafana/Sentry）。
- 不記錄個別孩子的作答資料（無帳號、無 PII）。
