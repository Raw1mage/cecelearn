# Design: personalization_preferences

## Context

cecelearn 前端是 Vite + React + TS（`webapp/frontend/src/`）。功能模組在 `features/`，共用層在 `shared/`。app 殼層是 `shared/components/AppLayout.tsx`，路由在 `App.tsx`（A1 為 `/` 單一入口）。

現有與「偏好」相關的真實狀態散落點（已勘查）：
- `shared/speech/tts.ts`：module-level `let enabled = true`，是 TTS 總開關**唯一真實來源**；`setTtsEnabled/isTtsEnabled` 是存取點。**不持久**，重載歸 `true`。`TtsToggle.tsx` 是目前唯一切換 UI。
- `features/a5/A5Page.tsx`：自帶 `cecelearn-tts-prefs`（`{rate,pitch}`）與 `cecelearn-a5-prefs`（出題範圍 `Record<string,string>`）兩個獨立 localStorage key + 自己的 load/save。
- `features/a1/hooks/useConversation.ts`：`a1_illustrate_daily` / `a1_video_daily` 是**用量計數**（跨日歸零），語意上不是偏好，**不收編**。

## Goals
- 單一中央偏好層，型別安全、版本化、跨頁共用、fail-soft。
- 收編 TTS 總開關（持久化）與 A5 prefs（遷移）。
- 齒輪 → overlay 設定面板（四區）。
- A1 套用身份/介面/學習偏好。

## Non-Goals
- 後端同步、登入、多 profile、學習歷程。

## Decisions

- **DD-1（單一 key + 命名空間）**：所有偏好存在**單一** localStorage key `cecelearn:prefs:v1`，值為一個 JSON 物件（巢狀分區 voice/identity/learning/ui）。理由：單一 key 易做版本遷移與整體匯出/重置；避免目前 `cecelearn-tts-prefs`/`cecelearn-a5-prefs` 那種零散 key 蔓延。

- **DD-2（版本化 + migrate 函式）**：JSON 帶 `schemaVersion`。讀取時若版本落後，跑 `migrate(old) -> latest`，缺欄位以 `DEFAULT_PREFERENCES` 補。corrupt / parse 失敗 → 回 `DEFAULT_PREFERENCES`，不崩（對齊 code-thinker：fail-soft 但顯式）。

- **DD-3（store 形狀：framework-agnostic core + React hook）**：核心 `store.ts` 是純 TS（`getPreferences/setPreference/subscribe/resetPreferences`），不依賴 React；React 層 `usePreferences.ts` 用 `useSyncExternalStore` 訂閱。理由：`tts.ts` 等非 React module 也要讀偏好，核心必須能在 React 外被呼叫。

- **DD-4（TTS 開關收編：store 為真實來源，tts module 為鏡像）**：`tts.ts` 啟動時從 store 初始化 `enabled`，並 `subscribe` store 的 voice.ttsEnabled 變化同步 module-level `enabled`；`setTtsEnabled` 改為「寫 store」(store 再回灌 module)。維持既有不變式「切換入口單一、module 不失步」（`TtsToggle.tsx` 註解）。`TtsToggle` 改讀 store。理由：保留 tts.ts 對 `enabled` 的高頻同步讀取（echo gate 等），同時讓 store 成為持久真實來源。

- **DD-5（A5 prefs 遷移：一次性 + 向後相容）**：store 初始化時，若中央 key 不存在但舊 `cecelearn-tts-prefs`/`cecelearn-a5-prefs` 存在 → 一次性讀入併進中央 store（voice.rate/pitch；a5 範圍另存 learning 或保留 a5 區）。遷移後**不刪舊 key**（向後相容、避免回退災難），但 A5Page 改成優先讀中央 store。理由：避免使用者既有設定在升級後消失。

- **DD-6（設定面板：overlay 掛在 AppLayout，全站可達）**：齒輪鈕放 AppLayout header（與既有 TtsToggle 同列）；點擊開全螢幕 overlay（比照 A2/A5 overlay 既有模式）。四區：語音 / 身份 / 學習 / 介面。即時 `setPreference` 寫回。理由：AppLayout 是所有路由的共用殼，掛這裡最省接線且全站一致。

- **DD-7（介面偏好以 CSS 變數/class 落地）**：`fontScale` → 在 AppLayout 根節點設 `style={{ '--app-font-scale': n }}` 或 `data-font-scale`；`theme`（light/dark）→ root `data-theme` + CSS 變數。理由：與 `styles.css` 既有全域樣式相容，零侵入各元件。

- **DD-8（麥克風預設開關 / 預設意圖：偏好供初值，不奪運行時控制）**：`ui.micDefaultOn` 只決定 A1 進場時 `wantListening` 的**初始值**；運行時使用者仍可手動切換（不被偏好強制覆寫）。`learning.defaultIntentBias`/`difficulty`/`topics` 第一版**先存不一定全用**——身份(grade)與這些欄位先進 store 並在面板可編輯，A1 實際消費範圍以 task 5 為準（最小先用 grade + nickname + ui）。理由：避免一次改動面太大破壞 A1 既有對話流；偏好欄位先就位，消費漸進。

## Risks
- **R1（tts.ts 雙向同步 race）**：store→module 與 module→store 若互相觸發可能成環。緩解：`setTtsEnabled` 只寫 store；store subscriber 只在值真的變化時更新 module（既有 `setPlayingId` 已有 equality guard 的同款做法）。
- **R2（A5 遷移把預設覆蓋使用者值）**：遷移只在「中央 key 不存在」時跑一次，避免每次啟動回灌舊值。
- **R3（localStorage 不可用 / 隱私模式）**：所有讀寫包 try/catch，fallback 記憶體物件；功能不擋（既有 useConversation 同款 fail-soft）。
- **R4（SSR/初次 render 閃爍）**：純 CSR（Vite SPA），fontScale/theme 在 mount 同步套用，閃爍可忽略。

## Critical Files
- 新增 `webapp/frontend/src/shared/preferences/types.ts`（型別 + DEFAULT + schemaVersion）
- 新增 `webapp/frontend/src/shared/preferences/store.ts`（core get/set/subscribe/migrate/遷移舊 key）
- 新增 `webapp/frontend/src/shared/preferences/usePreferences.ts`（useSyncExternalStore hook）
- 新增 `webapp/frontend/src/shared/components/SettingsPanel.tsx`（齒輪 overlay 四區）
- 改 `webapp/frontend/src/shared/speech/tts.ts`（開關收編 store）
- 改 `webapp/frontend/src/shared/components/TtsToggle.tsx`（讀 store）
- 改 `webapp/frontend/src/features/a5/A5Page.tsx`（改讀中央 store + 遷移相容）
- 改 `webapp/frontend/src/shared/components/AppLayout.tsx`（齒輪入口 + font-scale/theme 落地）
- 改 `webapp/frontend/src/features/a1/A1Page.tsx`（套用 nickname/grade/mic 預設）
- 改 `webapp/frontend/src/styles.css`（--app-font-scale / data-theme 變數）

## Validation Plan
- `bun run` backend/frontend `tsc` 全綠。
- live：改任一偏好 → 重載頁面 → 偏好保留（TTS 開關、語速、字級、暱稱、主題）。
- live：A5 既有使用者（已有舊 key）升級後設定不遺失。
- live：tts 開關在面板與 TtsToggle 兩處切換一致、不失步；echo gate 行為不回歸。
- localStorage 停用（隱私模式）→ 功能不崩、走記憶體 fallback。
