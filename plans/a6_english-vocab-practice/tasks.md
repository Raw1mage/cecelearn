# Tasks: a6_english-vocab-practice

對應 specbase/proposal.md 需求與 design.md 設計。

## 1. 後端單字庫與 API 實作
- [x] 1.1 定義英文練習資料契約（於 `webapp/backend/src/contracts/providers.ts` 新增相關介面）
- [x] 1.2 建立後端 `webapp/backend/src/modules/a6.ts` 模組，封裝基礎單字庫（含翻譯、拼寫）與圖片生成快取對接
- [x] 1.3 於 `webapp/backend/src/server.ts` 註冊 `/api/a6/quiz` 路由，並整合至服務啟動流程

## 2. 前端英文手寫描摹板實作（EnglishWritingPad）
- [x] 2.1 建立 `webapp/frontend/src/features/a6/components/EnglishWritingPad.tsx`
- [x] 2.2 實作離線 Offscreen Canvas 模板渲染（Arial 粗體，取得目標字母像素黑點總量）
- [x] 2.3 實作手寫筆跡繪製、座標投影與碰撞標記邏輯
- [x] 2.4 實作碰撞覆蓋率計算（Coverage > 80% 觸發完成，限制畫板外部無效塗鴉）
- [x] 2.5 支援提示模式（淺灰字背景）與「強制描摹通關」校驗機制

## 3. 前端練習卡片 UI（A6VocabCard）
- [x] 3.1 建立 `webapp/frontend/src/features/a6/A6VocabCard.tsx` 卡片主組件
- [x] 3.2 實作卡片彈出與關閉的毛玻璃浮動樣式（Overlay Card）
- [x] 3.3 實作單字插圖渲染與 Web Speech API 語音朗讀播放按鈕（en-US 語系）
- [x] 3.4 實作單字拼字格子進度列（逐字手寫，寫對自動前進至下一字）
- [x] 3.5 整合過關 confetti 特效與 `ScoreContext` 累加記分

## 4. A1 對話觸發與 A1Page 接線
- [x] 4.1 修改 A1 對話邏輯，使其在辨識到英文練習意圖時回傳 `action: "start_english_practice"` payload
- [x] 4.2 於 `webapp/frontend/src/features/a1/A1Page.tsx` 整合 `A6VocabCard` 組件並監聽對話 Actions 觸發彈出

## 5. 專案編譯與驗證
- [x] 5.1 執行 `tsc` 確認前後端編譯全綠無警告
- [~] 5.2 於瀏覽器中執行 E2E 手寫描摹測試與語音播放測試，確保 80% 碰撞判定精準，且看答案時亦須完成描摹才能過關 (因 CDP 瀏覽器沙盒異常，委由使用者手動驗證)
- [x] 5.3 記錄執行時的 Debug Checkpoints 並登錄 Event Log 收尾
