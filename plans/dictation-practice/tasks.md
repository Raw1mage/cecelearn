# Tasks

## 1. 後端出題引擎 + API

- [ ] 1.1 在 `contracts/providers.ts` 新增 `A5QuizItem`、`A5QuizResponse`、`A5QuizOptions` 型別定義
- [ ] 1.2 建立 `providers/vocabQuizEngine.ts`：載入 vocabulary.json，實作三種篩選模式（random/curriculum/custom）
- [ ] 1.3 vocabQuizEngine：實作描寫題（題型 D）生成 — 選字 + 查注音（從 vocabulary.json 或 MoeProvider）
- [ ] 1.4 vocabQuizEngine：實作聽寫題（題型 C）生成 — 選字 + 組詞語 + 查詞語注音
- [ ] 1.5 vocabQuizEngine：實作選擇填空題（題型 A）生成 — 爬取教育部辭典例句 + 挖空 + 造干擾選項
- [ ] 1.6 vocabQuizEngine：實作手寫填空題（題型 B）生成 — 同 A 但不含選項
- [ ] 1.7 建立 `modules/a5.ts` 模組工廠
- [ ] 1.8 在 `server.ts` 新增 `POST /api/a5/quiz` 路由，接收 A5QuizOptions 並回傳 A5QuizResponse
- [ ] 1.9 驗證：curl 測試 random + curriculum + custom 三種模式各出 5 題

## 2. 前端骨架 + 描寫練習（題型 D）

- [ ] 2.1 在 `shared/api/client.ts` 新增 `generateVocabQuiz()` 方法和 A5 型別
- [ ] 2.2 建立 `features/a5/A5Page.tsx` 主容器：管理 setup→loading→quiz→result→review 狀態機
- [ ] 2.3 建立 `features/a5/QuizSetup.tsx`：出題模式下拉（隨機/課綱/自訂）、課綱三層篩選器（出版社→年級→課次）、題數、題型選擇
- [ ] 2.4 建立 `features/a5/modes/TraceMode.tsx`：筆順動畫 → HanziWriter quiz → 回報完成/失敗
- [ ] 2.5 建立 `features/a5/QuizResult.tsx`：顯示得分、答對率、combo 最高紀錄
- [ ] 2.6 建立 `features/a5/QuizReview.tsx`：列出所有題目、標示對錯、附帶筆順重播
- [ ] 2.7 修改 `App.tsx` 新增 `/a5` 路由
- [ ] 2.8 修改 `PortalPage.tsx` 新增 A5 功能卡片
- [ ] 2.9 新增 A5 相關 CSS 到 `styles.css`
- [ ] 2.10 整合 ScoreContext：描寫完成 +1 分，全對煙火
- [ ] 2.11 驗證：瀏覽器完成描寫練習 3 題，計分板正確

## 3. 聽寫測驗（題型 C）

- [ ] 3.1 建立 TTS 工具函式 `features/a5/tts.ts`：封裝 speechSynthesis API，支援中文語音、語速調整、佇列唸詞
- [ ] 3.2 建立 `features/a5/modes/DictationMode.tsx`：TTS 唸詞 → HanziWriter quiz 逐字手寫 → 自動跳下一字
- [ ] 3.3 DictationMode：重聽按鈕（喇叭圖示）
- [ ] 3.4 DictationMode：顯示注音提示（可切換顯示/隱藏）
- [ ] 3.5 整合計分：聽寫全對 +5、部分對 +1/字
- [ ] 3.6 驗證：瀏覽器完成聽寫 3 題，語音正常、手寫正常、計分正確

## 4. 例句填空（題型 A + B）

- [ ] 4.1 建立 `features/a5/modes/ChoiceMode.tsx`：顯示挖空例句 + 4 選項 grid
- [ ] 4.2 ChoiceMode：選擇後即時判定對錯（綠色/紅色 + 正確答案）
- [ ] 4.3 建立 `features/a5/modes/HandwriteMode.tsx`：顯示挖空例句 + HanziWriter quiz 手寫
- [ ] 4.4 HandwriteMode：區分無提示完成（+3）和有提示完成（+1）
- [ ] 4.5 驗證：瀏覽器完成選擇題 + 手寫題各 3 題，計分正確

## 5. 遊戲化強化

- [ ] 5.1 A5Page 新增 combo 狀態管理：連擊計數器、倍率計算（≥3: ×1, ≥5: ×1.5, ≥10: ×2）
- [ ] 5.2 新增 combo UI：火焰 emoji + combo 數字 + 倍率提示
- [ ] 5.3 新增得分飄字動畫：答對時 "+N" 從題目區飄向 Header 計分板
- [ ] 5.4 全對煙火特效整合（已有 celebrate()）
- [ ] 5.5 QuizResult 顯示 combo 最高紀錄和總得分
- [ ] 5.6 驗證：連續答對 5 題以上看到 combo 和加倍提示
