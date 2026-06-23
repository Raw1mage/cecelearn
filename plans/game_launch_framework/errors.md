# Errors: game_launch_framework

每個錯誤含：code / 觸發條件 / 使用者可見訊息（6–9 歲友善）/ 復原策略 / 責任層。對齊「不 silent fallback」（天條 #11）。

## Error Catalogue

### REGISTRY_INTENT_NO_OVERLAY
- **觸發條件**：後端吐出某 launch intent，但前端 registry 查無對應 entry（registry 不一致）。
- **使用者可見訊息**：（無遊戲開啟）「我好像聽錯了，再說一次好嗎？」
- **復原策略**：不開任何 overlay（no-op，回對話）。記 console.warn 標 intent。屬開發期不一致 bug，必修 enum 同步（INV-1），不可補預設遊戲掩蓋（DD-5）。
- **責任層**：前端 useConversation（overlayForIntent 回 null）。

### OVERLAY_KIND_NO_COMPONENT
- **觸發條件**：registry 有 entry、overlayForIntent 回某 overlayKind，但前端 overlayRegistry 無對應 React 元件（INV-3 破壞）。
- **使用者可見訊息**：「這個遊戲還在準備中，先玩別的好嗎？」
- **復原策略**：不掛載、回對話；console.error 標 overlayKind。屬開發期漏接，必補 overlayRegistry。
- **責任層**：前端 A1Page / overlayRegistry。

### PROVIDER_ENUM_DRIFT
- **觸發條件**：兩個 chat provider 的 intent enum 不相等（INV-1 破壞），模型可能吐出某 provider 不認得的 intent。
- **使用者可見訊息**：（無直接訊息，分類退化為 unclear → 溫柔引導）
- **復原策略**：開發期由單元斷言/腳本攔截（Task 2.5）；執行期不可達狀態。修法：兩 provider enum 同源 allIntentEnum（DD-6）。
- **責任層**：後端 provider 建構。

### CHAT_CLASSIFY_FAILED
- **觸發條件**：chat provider 回非 ok（既有錯誤，非本框架新增）。
- **使用者可見訊息**：沿用既有 a1 chat 失敗訊息。
- **復原策略**：沿用既有 cascade / 重試行為，不因本框架改變。
- **責任層**：後端 chat provider（既有）。

### SHARED_IMPORT_UNRESOLVED
- **觸發條件**：前端或後端 build 期無法解析 `webapp/shared/gameRegistry`（tsconfig 跨頂層 import 限制，DD-1）。
- **使用者可見訊息**：（build 期，無執行期訊息）
- **復原策略**：採 DD-1 fallback（後端為主、前端鏡像型別），**先報告再改**，不 silent 切換執行期下發路徑。
- **責任層**：build / 開發者。
