# Proposal: a6_english-vocab-practice

## Why

- 「小雞老師」平台目前缺乏英文學習模組。新增 A6 英文單字練習，能健全國小學童在國語字詞（A1）、成語（A2/A7）與數學（A3）之外的英語學習版圖。
- 透過「看圖、聽音、手寫」的多感官互動方式，幫助 6–9 歲兒童更直覺地記憶英文單字及其拼寫。
- 當 A1 對話中偵測到英文練習意圖時，以浮動卡片（Card Overlay）型式顯示練習，能保持既有對話流不中斷，同時流暢切換至專注練習狀態。

## Original Requirement Wording (Baseline)

- 「開啟一個plan。要做英文單字練習模組。當對話串觸發英文練習時，比照其他練習模組，以卡片型式浮出畫面。要有手寫輸入模組，圖像生成模組，語音輸出模組。出題方式是，畫面顯示一張圖，語音唸出一個單字，然後提供一個手寫輸入畫板，讓小朋友手寫英文字。比照中文聽寫練習的做法，可以看答案，但看了答案還是要描寫完成才能過關。」

## Requirement Revision History

- 2026-06-28: Initial proposal created and structured.

## Effective Requirement Description

1. **對話觸發 (A1 Trigger)**：當使用者在 A1 對話輸入「英文練習」或「英文單字」等語意意圖時，後端或前端觸發特別的 Action Payload，讓 A6 卡片以 Overlay 形式彈出。
2. **練習卡片 UI**：包含單字圖片顯示、朗讀按鈕、單字字母格子（逐字書寫或整詞拼寫）、手寫板、提示按鈕、清除按鈕及送出校正按鈕。
3. **圖像生成 (Image Generation)**：串接後端現有的圖像生成與快取機制（如 `gemini` / `imagen`），根據單字動態生成或讀取具象化的教學插圖。
4. **語音朗讀 (Speech Synthesis)**：使用 Web Speech API TTS 朗讀英文單字（包含點擊手排重複發音）。
5. **英文手寫板 (Handwriting Canvas)**：
   - 支援「看答案」提示模式（以淺灰色字體虛線作為背景）。
   - 小朋友必須用滑鼠/觸控筆沿著背景字母進行「描摹」或自主書寫。
   - 利用 Canvas 像素碰撞校驗演算法，當書寫軌跡覆蓋該字母主要像素點達特定比例（如 80%）時，判定該字母描摹完成。
   - 即使開啟提示（看答案），依然需要完成描摹才能過關。

## Scope

### IN

- **前端 feature**: 新增 `webapp/frontend/src/features/a6/` 包含 A6 練習卡片主組件、英文手寫板（描摹型 Canvas）、TTS 播放控制。
- **A1 整合**: 在 A1Page 的對話流中，加入 A6 浮動卡片的渲染邏輯與 Intent 觸發。
- **後端模組與 API**: 新增 `webapp/backend/src/modules/a6.ts` 及相關 API 端點（如 `/api/a6/quiz` 獲取練習單字，並內部呼叫繪圖 provider 獲取插圖）。
- **單字庫**: 新增常用的基礎英文單字種子資料。
- **描摹演算法**: 基於 Canvas Offscreen 渲染目標字母的像素碰撞比對法，免去引入笨重的第三方 ML 辨識庫。

### OUT

- **高級手寫草書辨識**（本階段僅針對印刷體英文字母進行路徑/像素碰撞描寫判定）。
- **自定義教材上傳功能**（以內建基礎英文單字與動態生圖為主）。

## Non-Goals

- 不取代現有的中文生字或聽寫功能。
- 不做英文文法與整句聽寫。

## Constraints

- **開發規範**: 遵循 TS + React 前端與 Bun 後端架構，無須引入額外 package（避免 dependency scan 複雜化）。
- **瀏覽器相容**: TTS 使用 Web Speech API `speechSynthesis`（需設定語系為 `en-US`）。
- **效能**: 圖像載入與生成遵循既有的 `CachedIllustrationProvider` 機制，確保多次練習同一單字時零延遲與零額外生成成本。

## What Changes

- 新增前端 `features/a6/` 模組。
- 新增後端 `modules/a6.ts` 模組與 `/api/a6/quiz` 路由。
- 調整 `webapp/frontend/src/features/a1/A1Page.tsx` 以處理 A6 觸發動作。
- 調整 `webapp/backend/src/server.ts` 以註冊 `/api/a6/` 系列路由。

## Capabilities

### New Capabilities

- **英文單字圖像與語音練習**：整合圖像生成、語音合成與手寫拼字判定。
- **英文字母 Canvas 描摹校驗**：支援提示線描摹與像素覆蓋度百分比判定。

### Modified Capabilities

- **A1 對話意圖辨識**：在對話流中識別「英文練習」意圖，並回傳 Action Payload 喚起 A6。

## Impact

- 影響檔案：`A1Page.tsx`、`server.ts`、`contracts/providers.ts`，並新增 a6 feature 與 module 檔案。

