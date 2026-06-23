# Tasks: game_launch_framework

> Phase 結構即執行階段；每完成一項立即勾選並 plan-sync。狀態筆記見 design.md DD。

## 1. 共用 registry 與型別

- [x] 1.1 新增 `webapp/shared/gameRegistry.ts`：定義 `GameEntry` / `LaunchIntent` / `OverlayKind` 型別 + `GAME_REGISTRY` 常數（含 dictation/idiom/quiz/crossword 四筆）+ `BASE_INTENTS` 常數
- [x] 1.2 實作共用衍生器：`launchIntents()` / `allIntentEnum()`（純資料，零執行期相依，前後端可 import）
- [x] 1.3 驗證前後端 tsconfig 能跨頂層 import `webapp/shared/`；若不行採 DD-1 fallback（後端為主、前端鏡像型別）並記風險

## 2. 後端接入點改由 registry 衍生

- [x] 2.1 `contracts/providers.ts`：`A1Intent = BaseIntent | LaunchIntent`，移除散列的 start_* 硬編（保留 base intent）
- [x] 2.2 `providers/opencodeBareChatProvider.ts`：JSON schema `intent.enum` 改呼叫 `allIntentEnum()`
- [x] 2.3 `providers/geminiChatProvider.ts`：JSON schema `intent.enum` 改呼叫 `allIntentEnum()`（與 2.2 同源，INV-1）
- [x] 2.4 `providers/a1ChatShared.ts`：intent 說明段 + 觸發詞範例由 `gamePromptLines(GAME_REGISTRY)` 衍生；新增 start_crossword 觸發詞並與 start_idiom 區隔（DD-8）
- [x] 2.5 後端 tsc --noEmit 通過；確認兩 provider enum 內容相等（單元斷言或腳本）

## 3. 前端接入點改由 registry 驅動

- [x] 3.1 新增 `features/a1/overlayRegistry.tsx`：`overlayKind → React 元件`（dictation→A5Page / idiom→A2Page / quiz→QuizPage / crossword→A7Page，DD-2/DD-3）
- [x] 3.2 `features/a1/hooks/useConversation.ts`：`overlayForIntent` 改讀共用 registry 查表（查無回 null，DD-5）；`QuizMode` 型別改用 `OverlayKind`
- [x] 3.3 `features/a1/A1Page.tsx`：overlay render 區塊改用 `overlayRegistry` 取元件（取代 if-else switch）；quick-chips 改用 `gameChips(GAME_REGISTRY)` map 渲染（移除 a7 的 `<a href>` 異類）
- [x] 3.4 `features/a1/components/ConversationView.tsx`：intent→中文 label 由 registry `conversationLabel` 衍生（DD-10）

## 4. a7 接入 overlay 機制

- [x] 4.1 `features/a7/A7Page.tsx`：新增 `onClose?` / `onComplete?` props；overlay 模式由 ✕ 觸發 onClose、過關觸發 onComplete（對齊 A2Page/A5Page 的 R1 慣例，DD-4）
- [x] 4.2 route 模式（`/a7`）兩 props 皆不傳，保留原獨立行為（不退化既有 debug 入口）
- [x] 4.3 確認 a7 overlay 開啟時麥克風互斥 + 關閉恢復沿用既有 DD-5（A1Page activeOverlay effect 已涵蓋，毋須改語音核心）

## 5. 整合驗證

- [x] 5.1 前後端 tsc --noEmit 無錯
- [x] 5.2 `./webctl.sh restart` 後手動驗收 spec.md Acceptance Checks 全場景（語音開四遊戲 / a7 ✕ 關閉 / 過關回對話 / unclear 不開 / 入口鈕數 == registry）
- [x] 5.3 迴歸：dictation/idiom/quiz 語音與點擊行為與改造前等價（對齊 test-vectors）
- [x] 5.4 單一來源驗證：暫時移除一筆 entry，確認對應語音 intent + 入口鈕 + overlay 同步消失（INV-5），驗畢還原

## 6. 文件與收尾

- [x] 6.1 更新 README.md（語音可啟動遊戲說明 + a7 改 overlay）
- [x] 6.2 更新 CHANGELOG.md
- [x] 6.3 同步 `specs/architecture.md`（新增 game-launch 機制章節、registry 單一來源、a7 overlay 化）
- [x] 6.4 event_record 收尾（Key Decisions / Issues / Verification / Remaining）
