# Proposal: personalization_preferences（localStorage 個人化偏好層）

## Why

- cecelearn（小雞老師）要從「自家/小範圍試用」走向**對大眾開放**。一旦面對不特定的小朋友與家長，「一套設定全體共用」就不夠了——每個小孩的年級、暱稱、字級需求、要不要朗讀、喜歡的主題都不同。
- 現況的偏好狀態**散落且大多不持久**：
  - TTS 總開關是 `tts.ts` 的 module-level `enabled`，**每次重載就回到預設 `true`**，不存任何地方。
  - 只有 A5 聽寫頁有局部 localStorage：`cecelearn-tts-prefs`（rate/pitch）、`cecelearn-a5-prefs`（出題範圍）。
  - `useConversation.ts` 用 localStorage，但那是「每日生圖/影片配額計數」，不是使用者偏好。
  - **沒有**中央偏好層、沒有使用者身份（暱稱/年級）、沒有統一 key 命名規範、沒有版本遷移機制。
- 要對大眾開放，缺的是一個「**集中、型別安全、版本化、跨頁共用**」的 localStorage 偏好層，把零散狀態收編，並提供一個讓家長/小孩自助調整的設定入口。

## Original Requirement Wording (Baseline)

- 「cecelearn的功能如果要開始對大眾開放，就要開始考慮到個人化的問題。一些個人偏好設定，要開始用 browser localstorage 來客製化。」

## Requirement Revision History

- 2026-06-20: 初版——以 question() 收斂範圍：第一版納入語音/身份/學習/介面四類偏好；純 localStorage 不碰後端；入口做成「齒輪 → 全站設定面板 overlay」。

## Effective Requirement Description

1. 建立**單一中央 PreferencesStore**：型別安全、版本化（schemaVersion + migrate）、單一 localStorage key、跨頁共用、提供 React hook 與非 React 讀取點。
2. 第一版偏好四類：
   - **語音**：TTS 總開關、語速 rate、音高 pitch、（保留中英聲音選擇欄位）。
   - **身份**：小朋友暱稱 nickname、年級 grade。
   - **學習**：預設意圖傾向、難度、主題興趣。
   - **介面**：字級 fontScale、深淺色 theme、麥克風預設開關。
3. **收編現有散落狀態**：TTS 總開關改為持久化（取代 module-level `enabled` 的瞬時狀態）；A5 的 `cecelearn-tts-prefs`/`cecelearn-a5-prefs` 一次性遷移進中央 store（保留向後相容讀取）。
4. **全站設定面板**：app header 一個齒輪鈕 → 開 overlay，四個分頁/分區編輯上述偏好，即時生效 + 寫回 localStorage。
5. 偏好套用到 A1 主畫面（暱稱稱呼、字級、深淺色、預設意圖、麥克風預設開關）。

## Scope

### IN
- 中央 `PreferencesStore`（型別、預設值、版本遷移、單一 key、subscribe/get/set、React hook）。
- 收編 TTS 總開關持久化、A5 prefs 遷移。
- 全站設定面板（齒輪 → overlay，四區）。
- 偏好套用到 A1（身份/字級/深淺色/預設意圖/麥克風預設）。
- localStorage 不可用時 fail-soft（記憶體內 fallback，不擋功能）。

### OUT
- 後端帳號同步 / 雲端偏好（純 localStorage，先不碰後端）。
- 多使用者 profile 切換（單一裝置單一偏好，之後再議）。
- 學習歷程追蹤 / 錯題分析（屬 roadmap 長期願景，不在此 plan）。
- 家長控制（影片黑名單/功能鎖/每日上限）——question() 未選入第一版，列後續。

## Non-Goals

- 不做帳號系統、不做登入。
- 不把既有「配額計數」localStorage（`a1_illustrate_daily`/`a1_video_daily`）併入偏好 store（語意不同：那是用量不是偏好）。

## Constraints

- 純前端、零後端成本（對齊 README「零後端成本」原則）。
- 不新增 silent fallback：localStorage 不可用時走顯式記憶體 fallback 並可觀測，不偷偷吞狀態（對齊天條 #11）。
- TTS 狀態的單一真實來源目前是 `tts.ts` module-level `enabled`；收編時必須維持「設定面板是唯一切換入口、不與 module 失步」的既有不變式（見 `TtsToggle.tsx` 註解）。
- 型別安全：所有偏好欄位有 TypeScript 型別與預設值；讀取 corrupt JSON 時回預設不崩。

## What Changes

新增 `shared/preferences/` 中央層 + `shared/components/SettingsPanel`；改 `tts.ts` 開關持久化、`A5Page` 改讀中央 store、`AppLayout`/`A1Page` 套用偏好。

## Impact

- 前端新增：`webapp/frontend/src/shared/preferences/{store.ts,types.ts,usePreferences.ts}`、`shared/components/SettingsPanel.tsx`、齒輪鈕。
- 前端修改：`shared/speech/tts.ts`（開關持久化）、`features/a5/A5Page.tsx`（遷移）、`shared/components/AppLayout.tsx`（齒輪入口 + 字級/主題 class）、`features/a1/A1Page.tsx`（套用偏好）。
- 後端：無（純前端）。
