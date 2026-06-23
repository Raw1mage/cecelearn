# Tasks: personalization_preferences

對應 spec proposal/design。第一版：localStorage 個人化偏好層。

## 1. 中央 PreferencesStore（型別安全 / 版本化 / 單一 key）

- [x] 1.1 `shared/preferences/types.ts`：定義 `Preferences`（voice/identity/learning/ui 四區）、`DEFAULT_PREFERENCES`、`PREFS_SCHEMA_VERSION`、單一 key 常數 `cecelearn:prefs:v1`（DD-1/DD-2）
- [x] 1.2 `shared/preferences/store.ts` core：`getPreferences/setPreference/subscribe/resetPreferences`，純 TS 不依賴 React（DD-3）
- [x] 1.3 load 流程：parse JSON → 版本不符跑 `migrate` → 缺欄位補 DEFAULT → corrupt 回 DEFAULT；全程 try/catch fail-soft 記憶體 fallback（DD-2/R3）
- [x] 1.4 舊 key 一次性遷移：中央 key 不存在且 `cecelearn-tts-prefs`/`cecelearn-a5-prefs` 存在 → 併入、不刪舊 key（DD-5/R2）
- [x] 1.5 `shared/preferences/usePreferences.ts`：`useSyncExternalStore` hook（讀整包或單欄 selector）（DD-3）

## 2. 收編現有散落狀態

- [x] 2.1 `tts.ts`：啟動從 store 初始化 `enabled`，subscribe voice.ttsEnabled 同步 module；`setTtsEnabled` 改寫 store（equality guard 防環）（DD-4/R1）
- [x] 2.2 `TtsToggle.tsx`：改用 `usePreferences` 讀 voice.ttsEnabled（仍是唯一切換入口之一，與面板一致）
- [x] 2.3 `A5Page.tsx`：rate/pitch 改優先讀中央 store；保留舊 key 讀寫相容（出題範圍維持原邏輯，留第 3/4 區套用）（DD-5）

## 3. 全站設定面板（齒輪 → overlay）

- [x] 3.1 `shared/components/SettingsPanel.tsx`：全螢幕 overlay（比照 .a1-quiz-overlay 模式），四區分頁（DD-6）
- [x] 3.2 語音區：TTS 開關（走 setTtsEnabled 維持不失步）、rate slider、pitch slider（即時 setPreference）
- [x] 3.3 身份區：暱稱輸入、年級選擇（沿用 A5 年級格式）
- [x] 3.4 學習區：預設意圖傾向、難度、主題興趣（可編輯，消費漸進 DD-8）
- [x] 3.5 介面區：字級 fontScale、深淺色 theme、麥克風預設開關
- [x] 3.6 「回復預設」按鈕（resetPreferences）
- [x] 3.7 `AppLayout.tsx`：header 加齒輪鈕（與 TtsToggle 同列）開關 overlay

## 4. 套用偏好到主畫面

- [x] 4.1 `AppLayout.tsx`：fontScale → root `--app-font-scale`；theme → root `data-theme`（寫 documentElement 因 rem 相對 root）（DD-7）
- [x] 4.2 `styles.css`：`:root` font-size calc 套 `--app-font-scale`（全站 rem 等比）；`[data-theme="dark"]` 最小可行深色覆寫
- [x] 4.3 `A1Page.tsx`：暱稱經 ConversationView `greetingName` 套起始問候；`micDefaultOn` 凍結 mount-time ref 作 `wantListening` 初值（無 effect 回灌，DD-8）

## 5. 驗證

- [x] 5.1 frontend `tsc -b` 全綠（EXIT=0）；backend tsc 亦綠（無波及）
- [~] 5.2 live：改各偏好 → 重載 → 保留 — 程式碼路徑驗證（單一 key 持久化 + load 補預設）；瀏覽器手動 smoke 待使用者
- [x] 5.3 tts 開關：面板與 TtsToggle 皆走 store/setTtsEnabled，module 鏡像同步（equality guard 防環）；echo gate 既有路徑未動
- [x] 5.4 A5 舊 key：store 初始化一次性遷移 cecelearn-tts-prefs/cecelearn-a5-prefs、不刪舊 key，A5Page 保留相容讀取
- [x] 5.5 隱私模式：store 全程 try/catch，localStorage 不可用走記憶體 fallback（顯式，不靜默吞）

## 後續（非本 plan 範圍）
- 家長控制（影片黑名單 / 功能鎖 / 每日上限）— question() 未選入第一版。
- 後端帳號同步 / 多 profile 切換。
- 學習偏好（意圖傾向/難度/主題）深度消費進 A1 對話流。
