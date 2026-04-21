# Event - 2026-04-21 - A1 voice wakeup fix

## 需求
- 修正 A1 麥克風流程中「先靠 VAD/VOD 類判斷再啟動 WebMedia / SpeechRecognition，效果不好；喚醒了也不會接聽」的問題。

## 範圍
### IN
- `webapp/frontend/src/features/a1/A1Page.tsx` 的語音喚醒、wake window、重新進入 listening 流程。
- 驗證 frontend build 是否仍可通過。

### OUT
- 不更動 backend lookup provider。
- 不新增 fallback 機制。
- 不處理 repo 內其他既有未追蹤/未提交檔案。

## 任務清單
- [x] 確認 A1 權威實作位於 `webapp/frontend/src/features/a1/A1Page.tsx`
- [x] 追蹤喚醒、wake window、recognition/VAD 啟停鏈路
- [x] 修補喚醒後未真正進入接續聆聽/查詢的前端流程
- [x] 執行 frontend build 驗證
- [x] 同步 validation 與 architecture sync 結果

## Debug checkpoints
- Checkpoint 1: `specs/architecture.md` 確認 A1 legacy 為 migration source，實際產品路徑在 `webapp/`
- Checkpoint 2: `A1Page.tsx` 發現 `toggleListening()` 從 off → on 時只更新 UI，未呼叫 `recognition.start()` / VAD wait
- Checkpoint 3: `A1Page.tsx` 發現 interim transcript 命中「小雞」時只亮狀態，未真正設定 `wakeWindowRef.current = true`

## Key decisions
- 保持既有模型：仍使用 `getUserMedia + AudioContext + SpeechRecognition + VAD wait`，只修正狀態轉移缺口。
- 將 wake window 開啟邏輯抽成單一 helper，避免 interim/final 分支行為不一致。
- 重新開啟麥克風時走同一個 resume listening flow，而不是只切 UI state。

## Verification
- 第一輪 `bun run build` 於 `webapp/frontend` 執行失敗，但失敗點為既有非 A1 問題：
  - `src/features/a3/A3Page.tsx:111` `currentNote` 未使用
  - `src/features/a5/A5Page.tsx:76` `gradeResult` 未使用
  - `src/features/a5/tts.ts:10` `cachedLang` 未使用
  - `src/shared/celebrate.ts:16,24` `window.confetti` 可能為 `undefined`
- 追加局部驗證：`bun x tsc --noEmit --jsx react-jsx --moduleResolution bundler --module esnext --target es2020 --lib dom,es2020 --skipLibCheck --noUnusedLocals false --noUnusedParameters false src/vite-env.d.ts src/features/a1/A1Page.tsx`
- 局部 A1 型別檢查通過，代表本次變更未新增 `A1Page.tsx` 型別錯誤。
- 第二輪已修正上述 build blockers，`bun run build` 成功。
- Vite 仍輸出非阻塞警告：`/index.html` 中 `vendor/hanzi-writer.min.js` 缺少 `type="module"`，但不影響本次 build 成功。

## Additional fixes for full build
- `webapp/frontend/src/features/a3/A3Page.tsx`：移除未使用的 `currentNote` state 與對應 setter。
- `webapp/frontend/src/features/a5/A5Page.tsx`：移除未使用的 `gradeResult` state 與重設流程。
- `webapp/frontend/src/features/a5/tts.ts`：移除未使用的 `cachedLang`，改在 `voiceschanged` 時清空 `cachedVoice` 快取。
- `webapp/frontend/src/shared/celebrate.ts`：將 `window.confetti` 收斂為已確認存在的區域變數後再呼叫。

## Architecture Sync
- `specs/architecture.md` 已比對；本次僅修正既有 A1 前端語音狀態轉移，不涉及模組邊界、資料流或架構規則變更。
- Architecture Sync: Verified (No doc changes)

## Remaining
- 無。frontend build 已恢復綠燈。
