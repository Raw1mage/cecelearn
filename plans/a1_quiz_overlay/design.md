# Design: a1_quiz_overlay

## Context

A1「小雞老師」對話是產品唯一入口。算術(A3)已被吸收成 inline `solve_arithmetic` 卡片，因為它是「一問一答的確定性渲染」。但聽寫(A5)與成語(A2)是有狀態的測驗 session：

- A5：全螢幕手寫板（WritingPad / canvas）、TTS 唸題、預取 buffer、連擊計分、橫向偵測、`a5-active` 全螢幕高度量測。
- A2：setup→quiz→result→review 狀態機，多題選擇題，計分檢討。

兩者都需要脫離對話泡泡的沉浸式呈現 → 採全螢幕 overlay。對話作為「啟動器 + 結果回流匯流點」。

## Goals / Non-Goals

### Goals
- 對話可喚起聽寫/成語測驗（語音意圖 + 快捷鈕雙路徑）。
- 測驗保有既有完整 UI 與互動（複用，不重寫）。
- 測驗結束回流結構化成績到對話串流。
- Portal 收掉，"/" = 對話。

### Non-Goals
- 不重寫語音辨識核心、A5 手寫/評分引擎、A2 出題狀態機。
- 不做跨測驗成績持久化。

## Decisions

- **DD-1**：聽寫與成語採「全螢幕 overlay」而非 inline 卡片。理由：A5 物理上需要全螢幕手寫畫布（已有 `a5-active` 全螢幕高度量測邏輯），縮進泡泡會破壞手機觸控書寫體驗；A2 雖較輕，但為一致性與「測驗 = 進入一個 session 再退出」的心智模型，同採 overlay。
- **DD-2**：overlay 複用既有 `A5Page` / `A2Page` 元件，透過新增 `onClose` / `onComplete` props 參數化，而非另寫一份。理由：避免重複維護出題流程與計分邏輯（SSOT）。
- **DD-3**：觸發雙路徑——後端 intent 封閉集新增 `start_dictation` / `start_idiom`（語音/打字意圖）；A1 輸入列新增快捷 chip（直接送出對應意圖文字或直接設 overlay 狀態）。兩條路最終都收斂到 useConversation 的 overlay 開啟邏輯。
- **DD-4**：overlay 開啟狀態由 `useConversation` 持有（`activeOverlay: 'dictation' | 'idiom' | null`），A1Page 依此條件渲染 overlay 容器。理由：對話 hook 是唯一知道「使用者剛要求測驗」的地方，狀態集中。
- **DD-5**：overlay 開啟期間需處理與 A1 麥克風的資源互斥——overlay 掛起時，A1 應停止語音辨識（呼叫既有 toggleListening 的關閉路徑 / 設 wantListening=false），避免 A5 的 TTS 與 A1 的 SpeechRecognition 互相干擾（echo 軟閘 DD-11 只在 A1 內生效，不涵蓋 overlay）。overlay 關閉後恢復。fail-fast：不自動 fallback，明確開關。
- **DD-6**：測驗結果回流——overlay 完成時呼叫 `onComplete(summary)`，useConversation 插入一則 tutor 訊息，攜帶新的 `quizSummary` payload（intent 標記為 `start_dictation`/`start_idiom` 的結果或新增 summary 型別），ConversationView 渲染總結卡。回流卡不觸發生圖、不朗讀完整內容（沿用 buildSpeech 只唸 reply 的範式）。
- **DD-7**：舊 route /a2 /a3 /a5 保留為 debug/直達路由（與 A3 現狀一致），不移除。Portal 卡片入口移除，"/" 直接掛 A1Page（App.tsx 已是 "/" → A1Page，需移除 PortalPage 作為可達首頁的路徑或保留為純 debug）。
- **DD-8**：新 intent 無對應動作不得 silent fallback——後端解析到 `start_dictation`/`start_idiom` 只需 `reply`（引導語），無額外 payload；前端依 intent 開 overlay。若後端回了未知 intent，維持既有 unclear 處理。

## Risks / Trade-offs

- **R1（高）**：A5/A2 改成 props 參數化時，可能破壞既有獨立 route 行為。緩解：props 設預設值（onClose/onComplete 可選），route 模式不傳即維持原行為。
- **R2（高）**：A1 麥克風與 A5 TTS 資源衝突 / echo 迴圈。緩解：DD-5 明確互斥，overlay 期間停 A1 辨識；需實機驗證。
- **R3（中）**：A5 全螢幕 `a5-active` class 與 overlay 容器的 z-index / 高度量測在巢狀掛載時行為。緩解：overlay 用 fixed 全螢幕容器，沿用 a5-active 邏輯，實測 visualViewport 高度。
- **R4（中）**：後端 intent enum 多處需同步（schema enum / ILLUSTRATABLE / few-shot / 前端 union / INTENT_LABEL）。緩解：tasks.md 列為單一 phase 一次改完並驗證。
- **R5（低）**：Gemini 對新意圖判斷不穩（把「練習聽寫」誤判成 chat）。緩解：few-shot 補多個說法；快捷鈕作為穩定 fallback 觸發路徑（非 silent，使用者主動點）。

## Critical Files

- `webapp/frontend/src/routes/PortalPage.tsx` — 移除卡片入口
- `webapp/frontend/src/App.tsx` — 路由：移除 Portal 作為首頁
- `webapp/frontend/src/features/a1/A1Page.tsx` — 輸入列快捷 chip + overlay 容器渲染 + 麥克風互斥
- `webapp/frontend/src/features/a1/hooks/useConversation.ts` — activeOverlay 狀態 + 新 intent 處理 + onComplete 回流
- `webapp/frontend/src/features/a1/components/ConversationView.tsx` — INTENT_LABEL + 總結卡渲染
- `webapp/frontend/src/features/a5/A5Page.tsx` — onClose/onComplete props（overlay 模式）
- `webapp/frontend/src/features/a2/A2Page.tsx` — onClose/onComplete props（overlay 模式）
- `webapp/frontend/src/shared/api/client.ts` — A1Intent union + quizSummary payload 型別
- `webapp/frontend/src/styles.css` — overlay 容器 + 快捷 chip + 總結卡樣式
- `webapp/backend/src/providers/geminiChatProvider.ts` — intent enum / few-shot / schema / ILLUSTRATABLE

## Code Anchors

- `geminiChatProvider.ts:64-113` RESPONSE_SCHEMA（intent enum 在 69）
- `geminiChatProvider.ts:115-119` ILLUSTRATABLE 集合
- `useConversation.ts:96-144` sendTurn（intent 分派點）
- `A1Page.tsx:398-477` 輸入列 + 對話 panel（chip 與 overlay 容器掛點）
- `ConversationView.tsx:17-26` INTENT_LABEL
- `A5Page.tsx:43-585` A5Page（onClose/onComplete 注入點：startQuiz / handleNext result 分支）
- `A2Page.tsx:24-188` A2Page（onClose/onComplete 注入點：submitQuiz / resetQuiz）
