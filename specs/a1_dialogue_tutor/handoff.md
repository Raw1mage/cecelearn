# Handoff: a1_dialogue_tutor

## Execution Contract

把 A1 從「單次查字」演化為「漸進式對話型小家教」。**MVP-first，逐 Milestone 推進**：M1 後端對話契約 → M2 前端對話迴圈與 Stage 泛化 → M3 插畫（依 0.2 決策解鎖）。

實作前必讀（建立心智模型）：
- `specs/a1_dialogue_tutor/spec.md`（行為合約 + Acceptance Checks）
- `specs/a1_dialogue_tutor/design.md`（DD-1..DD-12 設計決策 + Risks）
- `specs/a1_dialogue_tutor/data-schema.json`（契約型別 SSOT）
- `specs/a1_dialogue_tutor/diagrams/*`（IDEF0 A0/A1/A2 + GRAFCET 回合狀態機）
- `specs/architecture.md`（webapp 模組邊界、provider 須在後端規則）

## Required Reads

既有程式，改前必讀：

- `webapp/frontend/src/features/a1/A1Page.tsx` — 680 行；語音辨識核心 useEffect（VAD/喚醒詞/Samsung）**不得重寫**，僅改辨識結果下游（DD-10）
- `webapp/frontend/src/features/a1/hanziWriterAdapter.ts` / `bopomofo.ts` — 保留沿用
- `webapp/frontend/src/shared/api/client.ts` — apiClient 既有模式
- `webapp/backend/src/server.ts` — 手刻 router 風格，新增路由依此風格
- `webapp/backend/src/contracts/providers.ts` — 契約型別擺放慣例
- `webapp/backend/src/providers/moeProvider.ts` — 既有 Gemini provider 寫法（chat/image provider 參照）
- `webapp/backend/src/config/env.ts` — `geminiApiKeys` 來源

## Stop Gates In Force

必停，回報後等使用者：

1. **[?] 0.2 影像 model id 決策**（OQ-1/R4）：M3 啟動前必須確認用哪個 Gemini 影像模型與權限。未定 → M3 阻塞，先做 M1+M2。
2. **架構變更批准**：新增 chat/illustrate endpoint 屬於對外 API 契約擴充；契約型別定稿（task 1.1 / 3.1）前向使用者確認 `ChatResponse` / `IllustrateResponse` 形狀。
3. **語音辨識回歸風險**：task 2.5 改造 A1Page 後，若 Chrome/Samsung 實測發現既有辨識退化 → 停止，回報，不疊補丁。
4. **no-silent-fallback**：任何 Gemini 失敗都顯式報錯；若發現需要佔位圖才能跑通 → 停，這是設計違規信號。

## Execution-Ready Checklist

- [x] proposal.md / spec.md / design.md / data-schema.json 完成
- [x] IDEF0 A0/A1/A2 + GRAFCET 建模並通過 drawmiat 驗證、SVG 渲染
- [x] tasks.md 分 Milestone 切片
- [ ] **使用者覆核設計**（p7）— 進入 implementing 前需使用者確認方向與 Stop Gate 0.2
- [ ] 0.2 影像 model 決策（解鎖 M3）

## Validation Plan

- M1：curl `/api/a1/chat` 連續兩輪，驗 intent 分類 + 上下文延續 + payload 結構
- M2：Chrome + Samsung 實測語音不退化；四 intent 顯示正確；TTS；筆順+練習保留；重整清空
- M3：造句/故事按鈕觸發插畫；失敗 fail-fast；防重複觸發
- 收尾：spec.md Acceptance Checks 全綠；更新 architecture.md；event_record；promote verified

## Out of Scope（勿擴張）

登入/持久化/rotation/圖庫/離線；legacy A1；opencode session 引擎；gemini-cli；A2/A3/A5。
