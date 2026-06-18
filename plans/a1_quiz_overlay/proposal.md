# Proposal: a1_quiz_overlay

## Why

- 產品方向已收斂為「小雞老師」單一對話入口（見 specs/architecture.md：A3 已被吸收成 A1 inline 算術教學）。
- 目前 Portal 仍以三張卡片並列（國字查詢 / 成語練習 / 聽寫練習），聽寫(A5)與成語(A2)是各自獨立的 route 頁面，與「對話為核心」的產品敘事脫節。
- 需要讓聽寫與成語也能從對話自然喚起，但兩者本質是「有狀態的測驗 session」（成語多題選擇題、聽寫全螢幕手寫板），不適合像算術那樣縮成單則對話泡泡。

## Original Requirement Wording (Baseline)

- "小雞老師的聽寫測驗和成語練習，現在只剩對話界面了，要怎麼呈現功能？"

## Requirement Revision History

- 2026-06-18: initial draft created via plan-init.ts
- 2026-06-18: 經 question 收斂使用者三項決定 —
  1. Portal 收掉，小雞老師對話當唯一入口（"/" = A1）。
  2. 聽寫與成語都以「全螢幕 overlay」呈現（非 inline 卡片）。
  3. 觸發方式「語音意圖 + 快捷鈕」都要。
  4. /a2 /a3 /a5 舊 route 保留為 debug/直達路由。
  5. 走 plan-builder 正式 spec 後再 implementing。

## Effective Requirement Description

1. 移除 Portal 卡片入口；應用根路徑 "/" 直接呈現 A1「小雞老師」對話界面。
2. 對話可透過兩種方式喚起聽寫 / 成語測驗：
   - 語音/打字意圖（後端 intent 封閉集新增 `start_dictation`、`start_idiom`）。
   - 對話輸入列上的快捷按鈕（chip）。
3. 喚起後：小雞老師先回一句引導語泡泡，同時拉起對應測驗的「全螢幕 overlay」（複用既有 A5Page / A2Page UI，不重寫內部邏輯）。
4. 測驗於 overlay 內完成或被關閉後，回到對話並插入一則 tutor 總結卡（答對數 / 總題數 / 最高連擊等），與既有 inline 算術卡片同一種呈現範式。
5. /a2 /a3 /a5 route 保留可直接開啟，作為 debug/直達測試路徑。

## Scope

### IN
- Portal 移除卡片入口，"/" route 改為 A1 對話。
- 後端 geminiChatProvider intent 封閉集新增 `start_dictation` / `start_idiom` + few-shot + schema enum。
- 前端 A1 型別（A1Intent）、A1Page 輸入列新增快捷 chip。
- useConversation 處理新 intent → 設定 overlay 開啟狀態 + 引導語。
- A5Page / A2Page 抽出成可被 A1 以 overlay 形式掛載的元件（接受 onClose / onComplete 回呼）。
- overlay 結束回呼結果 → 對話串流插入 tutor 總結卡（新 message 型別或沿用既有 payload 範式）。
- /a2 /a3 /a5 route 保留為 debug。

### OUT
- 不重寫語音辨識核心 useEffect（DD-10 保留）。
- 不改 A5 手寫板（WritingPad）、評分（grader）、TTS、預取 buffer 的內部邏輯。
- 不改 A2 出題狀態機內部邏輯。
- 不動 A1 生圖成本閘（R8）。
- 不改後端 A2/A5 出題 API 契約。

## Non-Goals

- 不把聽寫/成語塞成 inline 對話泡泡（已明確選 overlay）。
- 不做跨測驗的成績持久化或報表（維持現有 ScoreContext 範圍）。
- 不處理 Android Chrome 全雙工（既有 out of scope 不變）。

## Constraints

- 既有語音辨識／echo 軟閘（DD-10/DD-11）邏輯敏感，overlay 開啟期間需避免與 A1 麥克風搶資源（A5 自己有 TTS，需確認互斥）。
- A5 已用 `document.documentElement` 加 `a5-active` class + visualViewport 量測全螢幕高度；overlay 掛載需沿用而非重寫。
- 後端 intent 為封閉 enum，新增需同步 schema enum、ILLUSTRATABLE 集合判斷、few-shot、前端 A1Intent union、ConversationView 的 INTENT_LABEL。
- fail-fast：新 intent 若無對應 payload 不得 silent fallback。

## What Changes

- Portal：移除 features 卡片陣列（或改為對話直接掛載）。
- Routing：App.tsx "/" → A1Page（已是），移除 PortalPage 作為首頁；/a2 /a3 /a5 保留。
- 後端：intent 集合 + few-shot + schema。
- A1：輸入列 UI、useConversation overlay 狀態、overlay 容器元件、總結卡渲染。
- A5Page/A2Page：參數化 onClose/onComplete，支援被 overlay 掛載。

## Capabilities

### New Capabilities
- 對話喚起測驗：使用者在對話中說「我要練習聽寫 / 來玩成語」或點快捷鈕，即拉起全螢幕測驗。
- 測驗回流總結：測驗結束後對話收到結構化成績總結卡。

### Modified Capabilities
- Portal 首頁：從卡片陣列入口改為對話即首頁。
- A5Page / A2Page：從純 route 頁面，擴充為「既可獨立 route、也可被 A1 overlay 掛載」雙模式。

## Impact

- 前端：`routes/PortalPage.tsx`、`App.tsx`、`features/a1/A1Page.tsx`、`features/a1/hooks/useConversation.ts`、`features/a1/components/ConversationView.tsx`、`features/a5/A5Page.tsx`、`features/a2/A2Page.tsx`、`shared/api/client.ts`（A1Intent）、`styles.css`（overlay 樣式 + chip）。
- 後端：`providers/geminiChatProvider.ts`（intent enum / few-shot / schema）、`contracts/providers.ts`（若型別共用）。
- 文件：`specs/architecture.md`（A1 feature 段落需補 overlay 觸發與 Portal 變更）。
