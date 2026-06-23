# Proposal: game_launch_framework

## Why

- 小雞老師（a1）已有一套「語音 → 啟動遊戲」機制：後端 intent 分類器吐封閉 intent（`start_dictation` / `start_idiom` / `start_quiz`）→ 前端 `overlayForIntent()` 映射成 overlay 種類 → `setActiveOverlay()` 開全螢幕遊戲。但這套機制是**逐遊戲 hardcode** 的。
- 新做的 a7 成語填字遊戲**沒有接進這套機制**：它是獨立 route（`/a7`）+ 首頁一個 `<a href>` 連結，無 intent、不能用語音啟動，跟其他遊戲走完全不同的路。
- 更根本的問題：每接一個新遊戲，要散改 **6 處**——後端 intent enum ×2（`opencodeBareChatProvider` + `geminiChatProvider` 的 JSON schema）、prompt 範例（`a1ChatShared.ts`）、前端 `overlayForIntent()`、`A1Page` overlay render switch、首頁 quick-chips。漏改任一處就出現「能說但不會開」或「能點但沒語音」的半殘狀態。
- 需要一個**單一真實來源（registry）**，讓「語音可啟動」成為所有遊戲的預設能力，新遊戲只加一筆 entry。

## Original Requirement Wording (Baseline)

- "你要讓小雞老師能透過語音啟動遊戲機制。日後所有新擴充的遊戲一律採用同樣的方式觸發"

## Requirement Revision History

- 2026-06-21: initial draft created via plan-init.ts
- 2026-06-21: 使用者拍板三項決策——(1) 遊戲身體統一改成 overlay；(2) 通用化深度＝完整共享 registry；(3) spec 落點＝新建 game_launch_framework

## Effective Requirement Description

1. 建立一份**前後端共用的 game registry**（單一 TS source，前端與後端各自 import），作為所有可語音啟動遊戲的單一真實來源。
2. 從 registry **衍生**所有接入點：後端 intent enum、JSON schema enum、prompt 觸發詞範例；前端 intent→overlay 映射、首頁入口鈕、overlay 掛載。
3. 把 **a7 成語填字接進此機制**：A7Page 接 `onClose`/`onComplete`、改用 overlay 掛載、新增 `start_crossword` intent；保留 `/a7` 為 debug route。
4. 日後新遊戲＝**加一筆 registry entry + 提供 overlay 元件**，自動具備語音啟動、首頁入口、overlay 掛載，無須散改多處。

## Scope

### IN

- 新增共用 game registry 模組（前後端皆可 import 的型別與資料）。
- 後端：intent enum / JSON schema enum / prompt 觸發詞範例改由 registry 衍生（取代 hardcode）。
- 前端：`overlayForIntent` 改讀 registry；首頁 quick-chips 由 registry 渲染；`A1Page` overlay render 由 registry 驅動（取代 if-else switch）。
- a7 接入：A7Page 支援 overlay 模式（`onClose`/`onComplete`）、新增 `start_crossword` intent + 觸發詞、overlay 掛載。
- 既有三遊戲（dictation / idiom / quiz）遷移到 registry 驅動，行為不變（迴歸對齊）。

### OUT

- 不改既有語音辨識核心 useEffect（DD-10，a1 既有不變式）。
- 不改既有 a2 / a5 / quiz / a7 的玩法內部邏輯（只改「如何被啟動 / 掛載」）。
- 不做新遊戲本身（本框架只負責「啟動」，不負責任何具體遊戲內容）。
- 不改後端 intent 分類模型（claude-cli / gemini）的選用策略。

## Non-Goals

- 不做後端遊戲狀態持久化 / 計分後端化。
- 不做遊戲間導航記憶（deep-link 回復進度）。
- 不引入路由式遊戲頁的長期架構（overlay 是統一身體；route 僅保留為 debug）。

## Constraints

- 前後端是兩個 TS 專案（`webapp/frontend`、`webapp/backend`），共用 registry 須能被雙方 import（型別 + 純資料，無執行期相依）。
- 後端兩個 chat provider（`opencodeBareChatProvider`、`geminiChatProvider`）的 JSON schema enum 必須與 registry 一致，否則模型可能吐出前端不認得的 intent。
- 不得 silent fallback（天條 #11）：未知 intent 不得偷偷映射成某個預設遊戲；無對應 entry 就不開 overlay。
- 6–9 歲 UI 慣例：大字可點、入口鈕用 emoji + 短詞。

## What Changes

- 新增 `gameRegistry`（單一真實來源），收斂目前散落 6 處的接入點。
- a7 從「獨立 route」升級為「overlay + 語音可啟動」，與其他遊戲一致。
- 既有三遊戲的接入點改由 registry 驅動（行為等價）。

## Capabilities

### New Capabilities

- 語音啟動 a7：小朋友說「玩成語填字 / 來填字 / 成語闖關」→ `start_crossword` → 開 a7 overlay。
- registry 驅動的新遊戲接入：加一筆 entry 即得語音 intent + 首頁鈕 + overlay 掛載。

### Modified Capabilities

- intent→overlay：由 hardcode `overlayForIntent` 改為 registry 查表。
- 首頁 quick-chips：由 hardcode JSX 改為 registry map 渲染。
- 後端 intent schema / prompt：由 hardcode enum 改為 registry 衍生。

## Impact

- 後端：`contracts/providers.ts`（A1Intent）、`providers/a1ChatShared.ts`、`providers/opencodeBareChatProvider.ts`、`providers/geminiChatProvider.ts`。
- 前端：`features/a1/hooks/useConversation.ts`、`features/a1/A1Page.tsx`、`features/a1/components/ConversationView.tsx`（intent label）、`features/a7/A7Page.tsx`。
- 新增：共用 game registry 模組（落點 design.md 決定）。
- 文件：README、CHANGELOG、`specs/architecture.md`（新增 game-launch 機制章節）。
