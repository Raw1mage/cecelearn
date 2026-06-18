# Tasks: a1_quiz_overlay

對應 spec.md Requirements 與 design.md Decisions。每完成一項即時勾選。

## 1. 後端 intent 擴充

- [x] 1.1 `geminiChatProvider.ts` RESPONSE_SCHEMA intent enum 新增 `start_dictation`、`start_idiom`（DD-3）
- [x] 1.2 system prompt intent 說明補兩條 + few-shot（「我要練習聽寫」「考我聽寫」「來玩成語」「成語練習」）
- [x] 1.3 確認 ILLUSTRATABLE 集合不含新 intent（新 intent 不生圖，DD-6/DD-8）
- [x] 1.4 驗證：tsc 後端編譯通過；手動打 /api/a1/chat 送「我要練習聽寫」回 intent=start_dictation

## 2. 前端型別與 client

- [x] 2.1 `shared/api/client.ts` A1Intent union 新增兩個 intent
- [x] 2.2 新增 quizSummary payload 型別（dictation/idiom 結果：mode/correct/total/maxCombo?）+ A1ChatMessage 可帶 quizSummary
- [x] 2.3 驗證：tsc 前端編譯通過

## 3. 測驗元件 overlay 化（複用，不重寫）

- [x] 3.1 `A5Page.tsx` 新增可選 props `onClose?` / `onComplete?(summary)`；result 階段觸發 onComplete，提供關閉鈕呼叫 onClose（DD-2）。route 模式不傳 props 維持原行為（R1）
- [x] 3.2 `A2Page.tsx` 同樣參數化 onClose/onComplete；submitQuiz 後可回傳成績，提供關閉鈕
- [x] 3.3 驗證：直接開 /a2 /a5 行為不退化（route 模式）

## 4. 對話 overlay 狀態與觸發

- [x] 4.1 `useConversation.ts` 新增 `activeOverlay: 'dictation' | 'idiom' | null` 狀態 + open/close API（DD-4）
- [x] 4.2 sendTurn 收到 start_dictation/start_idiom → 插入引導語 tutor 泡泡 + 設 activeOverlay（DD-8 不 silent fallback）
- [x] 4.3 新增 onQuizComplete(summary) → 插入 tutor 總結卡訊息（DD-6）
- [x] 4.4 `A1Page.tsx` 輸入列新增「聽寫」「成語」快捷 chip，點擊等同對應意圖（DD-3）
- [x] 4.5 `A1Page.tsx` 依 activeOverlay 條件渲染全螢幕 overlay 容器，掛 A5Page/A2Page（fixed 全螢幕 + 關閉鈕，R3）
- [x] 4.6 麥克風互斥：overlay 開啟時停 A1 辨識（wantListening=false + abort），關閉時恢復（DD-5/R2）

## 5. 對話總結卡渲染

- [x] 5.1 `ConversationView.tsx` INTENT_LABEL 補 start_dictation/start_idiom 標籤
- [x] 5.2 新增成績總結卡渲染（讀 message.quizSummary，顯示答對/總題數/最高連擊）
- [x] 5.3 驗證：完成測驗回對話出現總結卡（Playwright：成語 5 題 → 交卷 → overlay 自動關閉，對話出現 tutor 泡泡「你完成了成語練習！答對 X/N 題」+ 結構化總結卡 `.a1-quiz-summary--idiom`，顯示答對/總題數）

## 6. Portal 收斂與路由

- [x] 6.1 `routes/PortalPage.tsx` 移除卡片入口（或整檔退役）（DD-7）
- [x] 6.2 `App.tsx` "/" 確認掛 A1Page；移除 Portal 作為可達首頁；/a2 /a3 /a5 保留為 debug route
- [x] 6.3 驗證：訪 "/" 顯示對話無卡片；/a2 /a3 /a5 仍可直達

## 7. 樣式與整合驗證

- [x] 7.1 `styles.css` 新增 overlay 容器、關閉鈕、快捷 chip、總結卡樣式
- [x] 7.2 前端 build（tsc + vite）通過
- [~] 7.3 端到端手測（Playwright headless，base /cecelearn/）：
  - [x] chip 喚起聽寫與成語 → 全螢幕 `.a1-quiz-overlay` + ✕ 關閉鈕（A5「開始聽寫」/ A2「開始練習」）
  - [x] 完成回流：A2 交卷 → overlay 關閉 → 對話總結卡（見 5.3）
  - [x] 中途關閉：✕ 關 overlay → 回對話，`.a1-quiz-overlay` 移除、greeting 仍在
  - [x] 既有意圖不退化：送「蘋果的蘋」→ tutor「小雞老師・查字」泡泡正常渲染、無錯誤
  - [x] Portal 收斂：「/」無卡片（FeatureCard/國字/Portal 皆 0），/a2 /a3 /a5 仍可直達
  - [ ] **語音喚起 + 麥克風互斥（DD-5/R2）需實機驗證**：headless 無麥克風無法觀測；語音走與 chip 相同的 intent 分派。待真機確認 overlay 開啟停 A1 辨識、關閉恢復。
- [x] 7.4 同步 `specs/architecture.md` A1 feature 段落（overlay 觸發 + Portal 變更）
