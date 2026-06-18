# Proposal: a1_dialogue_tutor

## Why

- A1 目前是「單次查字」工具：語音/文字輸入一個字 → 回筆順動畫 + 造詞 + 成語。每次互動都是一問一答、互不相關，無法延續上下文。
- 使用者希望把 A1 從「查字典」**漸進式**演化為「對話型小家教」：小朋友能用語音跟它聊天，家教能造詞、造句、講故事，並且邊聊邊產生趣味插畫。
- 「造句」「講故事」「插畫」本質上都是「對話的一種輸出」，而非彼此獨立的功能。因此版型也要從「固定欄位」泛化為「能承載多種回合輸出的視窗」。
- 多輪對話需要 session context。經評估，**不採用** opencode/opencms 的 session 引擎（為 coding agent 設計，過度工程且把開發者能力暴露到兒童 app），改用後端薄對話層：Gemini `generateContent` 本身無狀態，多輪靠每次帶完整 `contents[]` 達成。

## Original Requirement Wording (Baseline)

- 「擴充A1的『造詞』功能。新增『造句』功能。當小朋友詢問『用<phrase>造句』時，就調用 accounts.json 的 gemini-cli api 去產生答案。顯示句子的方式可能會改變版型安排。把顯示『造詞』的區域泛化為一個可以顯示造詞、造句結果的視窗。而原本顯示『筆畫』的圖框，泛化為可以顯示插圖的圖框。插圖的生成，可以是透過 gemini-cli api 去調用 banana，根據造句的情境去畫一張趣味風格的例圖。」
- 後續澄清：「其實我是希望把 A1 泛化為對話型小家教。」「漸進式：造詞、造句、講故事、一邊聊一邊產生插畫。」「前端記憶體為主，無需登入。」

## Requirement Revision History

- 2026-06-16: initial draft created via plan-init.ts
- 2026-06-16 (R1): 需求從「造詞+造句+插圖三項加法」升級為「A1 → 漸進式對話型小家教」。造詞/造句/講故事/插圖收斂為對話的 intent。
- 2026-06-16 (R2 決策定錨):
  - 目標代碼庫 = `webapp/frontend` + `webapp/backend`（非 legacy `A1_Chinese_word_lookup/`）。
  - AI 調用機制 = 後端 proxy + Gemini REST（用 `GEMINI_API_KEYS`），**不用** gemini-cli 子程序、**不**讀 opencode 的 accounts.json（那是 opencode 帳號檔，非本專案資產；本機亦無 gemini-cli）。
  - 插圖生成 = 造句/故事後「按鈕觸發」生成，非自動。
  - 造句觸發 = 語音+文字皆可，偵測「用X造句」語意分流。
  - session context = 前端記憶體為主，無需登入。

## Effective Requirement Description

1. A1 升級為「對話型小家教」：小朋友可用語音或文字與家教多輪對話，家教記得本次對話的前文。
2. 家教依使用者語意分流 intent：查字（既有）、造詞、造句、講故事、閒聊、（按鈕觸發的）畫插圖。
3. 「造詞顯示區」泛化為**結果視窗（Result Stage）**：可承載造詞卡片、造句句子、故事段落、對話泡泡等多種回合輸出。
4. 「筆畫圖框」泛化為**插圖框（Illustration Stage）**：可顯示 HanziWriter 筆順動畫，也可顯示 AI 生成的情境插畫。
5. 造句/故事完成後，提供「畫一張」按鈕，按下才呼叫後端 → Gemini 影像模型生成趣味風格插畫。
6. 所有 Gemini 呼叫（文字對話、影像生成）一律走 `webapp/backend` proxy，前端不持有 API key。
7. 對話 history 存於前端記憶體；重整頁面即清空；不需登入或後端持久化。

## Scope

### IN
- `webapp/frontend/src/features/a1/`：A1Page 從「單次查詢迴圈」改為「多輪對話迴圈」；新增結果視窗與插圖框的泛化元件。
- `webapp/backend`：新增對話 endpoint（帶 `contents[]` 多輪）、影像生成 endpoint；對應 provider/engine 與契約型別。
- intent 偵測與分流（造詞/造句/講故事/查字/閒聊/畫圖）。
- 前端語音輸入（沿用既有 Web Speech Recognition）與語音輸出（瀏覽器 `SpeechSynthesis` TTS）。
- 契約型別、data-schema、IDEF0/GRAFCET 設計建模、tasks/handoff。

### OUT
- 使用者帳號、登入、後端對話持久化、跨裝置同步。
- legacy `A1_Chinese_word_lookup/` 的改動（維持現狀，不動）。
- opencode/opencms session 引擎的拆解或橋接。
- gemini-cli 子程序整合（明確不採用）。
- A2/A3/A5 的任何改動。
- 影像生成的伺服端永久儲存（本期回傳即用即丟，不建圖庫）。

## Non-Goals

- 不做通用聊天機器人；對話範圍鎖定「兒童中文學習小家教」語境。
- 不追求離線可用；Gemini 呼叫需網路。
- 不在本期實作多帳號 rotation / quota 管理（沿用 backend 既有 `GEMINI_API_KEYS` 處理方式）。

## Constraints

- 架構規則（specs/architecture.md）：provider 呼叫必須在後端，不得在瀏覽器持有 secret。
- 架構規則：fail fast，不得新增 silent fallback（影像生成失敗要顯式報錯，不偷偷給佔位圖當成功）。
- 兒童使用情境：對話內容需安全、正向；prompt 需加上兒童語境與安全約束。
- 既有語音辨識邏輯（VAD、喚醒詞「小雞小雞」、Samsung manual mode）已穩定，泛化時不得破壞。
- 影像生成耗時/耗額度高 → 必須使用者按鈕觸發，不可每輪自動生成。

## What Changes

- A1Page 的 `lookup()` 單次迴圈 → 對話迴圈：維護 `messages[]`，每輪送後端、收回覆、語音播報。
- 右側「造詞 Panel」→ 結果視窗元件，依回合 intent 渲染不同輸出形態。
- 左側「筆畫框」→ 插圖框元件，可在筆順動畫與情境插畫之間切換。
- backend server.ts 新增 `/api/a1/chat`（多輪對話）與 `/api/a1/illustrate`（影像生成）路由。
- 新增對話/影像 provider（Gemini REST），契約型別擴充。

## Capabilities

### New Capabilities
- 多輪語音對話：小朋友能跟家教連續對話，家教記得前文。
- 造句：偵測「用X造句」→ 後端生成例句（含注音/朗讀）。
- 講故事：偵測「講一個關於X的故事」→ 後端生成短故事。
- 情境插畫：按鈕觸發 → 後端影像模型依當前句子/故事情境畫趣味插圖。
- 語音輸出（TTS）：家教回覆可朗讀。

### Modified Capabilities
- 查字造詞：保留既有行為，成為對話 intent 之一；輸出改由結果視窗呈現。
- 筆順動畫：保留，成為插圖框的一種顯示模式。

## Impact

- 受影響程式：`webapp/frontend/src/features/a1/*`、`webapp/frontend/src/shared/api/client.ts`、`webapp/backend/src/server.ts`、`webapp/backend/src/contracts/providers.ts`、`webapp/backend/src/modules/a1.ts`、`webapp/backend/src/providers/*`。
- 受影響文件：`specs/architecture.md`（A1 feature 描述需更新為對話型 + 影像 endpoint）。
- 受影響環境：backend 需可呼叫 Gemini 影像生成模型（確認 `GEMINI_API_KEYS` 對應模型可用）。
