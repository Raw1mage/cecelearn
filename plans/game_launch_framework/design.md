# Design: game_launch_framework

## Context

cecelearn 的 a1（小雞老師）已有「語音 → 啟動遊戲」鏈路，但是逐遊戲 hardcode、散落 6 處，且 a7 完全沒接入。本設計建立一份**前後端共用的 game registry** 作為單一真實來源，所有接入點從它衍生。

### 既有鏈路（現況，作為改造基準）

```
語音/文字
  → 後端 chat provider（opencodeBareChat 或 geminiChat）
      ├─ JSON schema enum（hardcode 列 14 個 intent）
      └─ system prompt（a1ChatShared.ts，hardcode 觸發詞範例）
  → 回 { intent, reply }
  → 前端 useConversation.sendTurn
      → overlayForIntent(intent)  // hardcode if-else 3 條
      → setActiveOverlay(kind)
  → A1Page render switch（hardcode：dictation→A5Page / idiom→A2Page / quiz→QuizPage）
首頁 quick-chips：hardcode 4 顆 JSX（含 a7 的 <a href> 異類）
```

### 現況的 6 個 hardcode 接入點（要收斂）

1. `contracts/providers.ts` — `A1Intent` union 型別含 `start_dictation`/`start_idiom`/`start_quiz`
2. `providers/opencodeBareChatProvider` — JSON schema `intent.enum`
3. `providers/geminiChatProvider` — JSON schema `intent.enum`（與 2 必須一致）
4. `providers/a1ChatShared.ts` — system prompt intent 清單 + 觸發詞範例
5. `features/a1/hooks/useConversation.ts` — `overlayForIntent()` if-else
6. `features/a1/A1Page.tsx` — overlay render switch + quick-chips JSX

## Goals / Non-Goals

### Goals
- 單一 registry 驅動全部 6 個接入點。
- a7 接入：`start_crossword` intent + overlay 模式 + 首頁鈕，與其他遊戲一致。
- 既有三遊戲遷移後行為等價（迴歸）。
- 新遊戲＝加一筆 entry + overlay 元件。

### Non-Goals
- 不重寫語音辨識核心（DD-10 a1 不變式照舊）。
- 不改任何遊戲玩法內部邏輯。
- 不持久化遊戲狀態。

## Registry 契約 (taxonomy)

### `GameEntry`

- **名稱**：`GameEntry`
- **代表什麼**：一個可被語音/點擊啟動的遊戲的完整啟動定義。
- **輸入（欄位）**：
  - `id: string` — 穩定識別（如 `'idiom'`、`'crossword'`），等同 overlayKind。
  - `intent: LaunchIntent` — 對應的後端啟動意圖名（如 `'start_crossword'`）。
  - `label: string` — 首頁入口鈕中文短詞（如 `'成語填字'`）。
  - `emoji: string` — 入口鈕 emoji（如 `'🧩'`）。
  - `triggerExamples: string[]` — prompt 觸發詞範例（如 `['玩成語填字','來填字','成語闖關']`）。
  - `intentDescription: string` — 給 system prompt 的一句意圖說明。
  - `conversationLabel: string` — ConversationView 顯示的 intent 標籤（如 `'成語填字'`）。
- **輸出**：被前後端各自的衍生函式讀取，產生 enum / prompt / overlay 映射 / 入口鈕。
- **不允許解讀成**：遊戲玩法定義（玩法在各 feature 元件內，registry 只管「如何被啟動」）；不含執行期 React 元件引用（避免後端 import 前端元件，見 DD-3）。
- **何時算完成**：一筆 entry 七個欄位齊備，且前端有對應 overlay 元件登記。

### `LaunchIntent`

- **名稱**：`LaunchIntent`
- **代表什麼**：registry 所有 entry 的 `intent` 欄位集合所構成的字面量聯集型別。
- **輸入**：registry entries。
- **輸出**：併入後端 `A1Intent` union 與兩個 provider 的 schema enum。
- **不允許解讀成**：所有 intent（lookup/chat 等非啟動 intent 不在此集合，仍 hardcode 於 base intent 清單）。
- **何時算完成**：`A1Intent = BaseIntent | LaunchIntent`，且兩 provider enum == `[...BASE_INTENTS, ...launchIntents]`。

### `GAME_REGISTRY`

- **名稱**：`GAME_REGISTRY`
- **代表什麼**：`readonly GameEntry[]`，全系統唯一的遊戲清單。
- **輸入**：開發者手寫。
- **輸出**：所有衍生器的來源。
- **不允許解讀成**：可在執行期動態增刪的可變陣列（編譯期常數）。
- **何時算完成**：含現有 4 遊戲（dictation/idiom/quiz/crossword）。

## 衍生器 (derivation functions)

| 衍生器 | 位置 | 輸入 | 輸出 |
|---|---|---|---|
| `launchIntents()` | 共用 | GAME_REGISTRY | `LaunchIntent[]`（intent 名陣列） |
| `allIntentEnum()` | 後端 | BASE_INTENTS + registry | provider schema 用的完整 enum 陣列 |
| `gamePromptLines()` | 後端 | registry | system prompt 的 intent 說明 + 觸發詞範例段 |
| `overlayForIntent()` | 前端 | registry | `intent → overlayKind`（查表，查無回 null） |
| `gameChips()` | 前端 | registry | 首頁入口鈕資料（emoji+label+overlayKind） |
| `overlayComponent()` | 前端 | overlayRegistry | `overlayKind → React 元件`（前端側登記，DD-3） |

## 落點 (DD-1)

共用 registry 是**純資料 + 型別**，無執行期相依，可被前後端 import。落點：

- `webapp/shared/gameRegistry.ts`（新增 `webapp/shared/`，前後端各自相對 import）。
  - 後端 `import` 路徑相對 `../../shared/gameRegistry`，前端同理。
  - 若 tsconfig 路徑限制無法跨頂層 import，退而求其次：registry 放後端 `contracts/`，前端鏡像一份型別 + 由 build 階段同步（次選，DD-1 記風險）。

## Decisions

- **DD-1** 共用 registry 落 `webapp/shared/gameRegistry.ts`，純資料+型別、零執行期相依，前後端相對 import。若 monorepo tsconfig 不允跨頂層，fallback 為後端為主、前端鏡像型別（不鏡像資料則改由 `/api/a1/games` 下發——但這引入執行期相依，列為最終手段）。
- **DD-2** overlay 元件登記（`overlayKind → React 元件`）放**前端側** overlayRegistry，不進共用 registry——因為後端不可 import React 元件。共用 registry 只帶 `overlayKind` 字串。
- **DD-3** registry 不含任何 React 引用，保持後端可安全 import。前端用第二張表把 overlayKind 接到元件。
- **DD-4** a7 統一改 overlay：A7Page 接 `onClose?`/`onComplete?`，route 模式（`/a7`）兩者皆不傳、保留原獨立行為（對齊 a2/a5 的 R1 慣例）。
- **DD-5** 不 silent fallback（天條 #11）：`overlayForIntent` 查無對應 entry 回 null，不開任何 overlay；後端 enum 不含的 intent 模型不該吐，吐了前端也忽略。
- **DD-6** 兩個 chat provider 的 enum 必須同源（都呼叫 `allIntentEnum()`），根治「provider 間 enum 漂移」。
- **DD-7** base intent（lookup/make_words/.../chat/unclear）維持 hardcode `BASE_INTENTS` 常數；只有「啟動遊戲」類 intent 進 registry。理由：base intent 不是遊戲、語意異質，硬塞 registry 反而扭曲模型。
- **DD-8** `start_crossword` 觸發詞需與既有 `start_idiom`（成語選擇題）區隔：填字用「填字/闖關/連連看格子」類詞，避免模型把「玩成語」歧義路由。prompt 範例需明確對比兩者。
- **DD-9** 既有三遊戲遷移採「行為等價」驗證：遷移前後對相同輸入，intent 分類與開啟的 overlay 必須一致（test-vectors 對齊）。
- **DD-10** ConversationView 的 intent→中文 label（`start_idiom:'成語'`）也由 registry 的 `conversationLabel` 衍生，避免又一處 hardcode。
- **DD-11**: DD-1 落點實測定案：共用 registry 放 webapp/backend/src/shared/gameRegistry.ts（非頂層 webapp/shared/）。實測證據——頂層 webapp/shared/ 被後端 tsconfig rootDir:"src"+include:["src"] 擋下（TS6059）；移入 backend src/shared 後，後端原生 import + 前端跨樹相對 import（../../backend/src/shared/gameRegistry，Bundler resolution）兩邊 tsc --noEmit 皆 EXIT=0。單一真實來源保留，毋須鏡像/執行期下發 fallback。

## Risks / Trade-offs

- **共用 `webapp/shared/` vs 各自鏡像**：共用單一檔最乾淨（單一真實來源），但跨頂層 import 可能撞 tsconfig `rootDir`/`include` 限制；鏡像型別省設定但留下「資料兩份」風險。選共用為主、鏡像為備（DD-1）。
- **registry 帶元件 vs 只帶字串**：帶元件最少接線，但逼後端 import React（不可行）。選只帶 overlayKind 字串 + 前端第二張表（DD-2/DD-3），代價是新遊戲要動兩個地方（registry entry + overlayRegistry），但兩處都在「加一筆」等級，且邊界清晰。
- **base intent 是否也進 registry**：全進 registry 最一致，但 base intent 非遊戲、語意異質會污染 prompt 結構。選只收遊戲啟動 intent（DD-7）。
- **a7 overlay vs 保留 route**：overlay 統一身體、語音可啟動、與其他遊戲一致；route 失去語音入口。選 overlay 為主、route 留 debug（DD-4）。

## Critical Files

- 新增 `webapp/shared/gameRegistry.ts`（registry + 型別 + 衍生器）
- 新增 `webapp/frontend/src/features/a1/overlayRegistry.tsx`（overlayKind→元件，DD-2）
- 改 `webapp/backend/src/contracts/providers.ts`（A1Intent = BaseIntent | LaunchIntent）
- 改 `webapp/backend/src/providers/a1ChatShared.ts`（prompt 由 gamePromptLines 衍生）
- 改 `webapp/backend/src/providers/opencodeBareChatProvider.ts` + `geminiChatProvider.ts`（enum 由 allIntentEnum 衍生）
- 改 `webapp/frontend/src/features/a1/hooks/useConversation.ts`（overlayForIntent 查表）
- 改 `webapp/frontend/src/features/a1/A1Page.tsx`（overlay render + quick-chips 由 registry 驅動）
- 改 `webapp/frontend/src/features/a1/components/ConversationView.tsx`（intent label 由 registry）
- 改 `webapp/frontend/src/features/a7/A7Page.tsx`（接 onClose/onComplete overlay 模式）

## Invariants

- **INV-1** 兩個 chat provider 的 intent enum 永遠相等（同源衍生）。
- **INV-2** 首頁入口鈕數量 == registry entry 數（不多不少）。
- **INV-3** 每個 registry entry 的 intent 都能被 `overlayForIntent` 查到對應 overlayKind，且該 overlayKind 在 overlayRegistry 有元件。
- **INV-4** 非啟動 intent（base）絕不映射到任何 overlay。
- **INV-5** 移除一筆 entry → 對應語音 intent、入口鈕、overlay 同步消失（單一來源）。
