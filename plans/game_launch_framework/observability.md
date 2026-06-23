# Observability: game_launch_framework

對齊 cecelearn 既有結構化 log 慣例（如 `a1.chat.intent`）。本框架的觀測重點是「intent→overlay 啟動鏈路」的可追溯與不一致偵測。

## Events

- `a1.chat.intent`（既有，沿用）：每輪分類結果 `{intent, reply_len}`。本框架新增的 `start_crossword` 自然納入。
- `game.launch.resolved`（新增，前端 console）：overlayForIntent 命中時記 `{intent, overlayKind}`。
- `game.launch.noop`（新增，前端 console.warn）：launch intent 但 registry 查無 entry（REGISTRY_INTENT_NO_OVERLAY），記 `{intent}`。
- `game.overlay.no_component`（新增，前端 console.error）：overlayKind 無對應元件（OVERLAY_KIND_NO_COMPONENT），記 `{overlayKind}`。
- `game.overlay.open` / `game.overlay.close`（新增，前端 console）：overlay 開關 + 麥克風狀態切換 `{overlayKind, micRestored}`。

## Metrics

- `launch_intent_count`：各 launch intent 啟動次數（依 intent 分組），看哪個遊戲最常被語音叫起。
- `launch_noop_rate`：launch intent 但未開 overlay 的比率（理想為 0；>0 代表 registry 不一致 bug）。
- `registry_entry_count` vs `chip_count`：開發期斷言相等（INV-2）。
- `provider_enum_equal`：兩 provider enum 是否相等（INV-1），開發期斷言。

## Logs

- 沿用 a1 既有開發期 log（append 長久留存）；本框架的 console 事件加 `game.` 前綴便於 grep。

## Alerts

- 開發/CI：`launch_noop_rate > 0` 或 `provider_enum_equal == false` 視為 build 阻塞（INV-1/INV-4 破壞）。
- 執行期無自動 alert（前端純客戶端）；不一致由開發期斷言與手動驗收攔截。
