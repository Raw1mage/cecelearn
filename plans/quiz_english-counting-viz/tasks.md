# Tasks: quiz_english-counting-viz

## 1. 後端：tally viz 契約 + 確定性生題

- [x] 1.1 `quizFramework.ts`：MathVizSpec 加 `kind:'tally'` + `count?` 欄位；KpInfo vizKind 加 `'tally'`
- [x] 1.2 `quizFramework.ts`：NOUN_BANK（名詞→emoji，6-9歲、全 emoji 可表達）+ NUMBER_WORDS（1-10英文數字詞）
- [x] 1.3 `quizFramework.ts`：`genTallyItems(kp, strand, count, nonce)` 確定性生英文數量題（英文題幹+英文數字選項+tally viz，答案釘死為 N）
- [x] 1.4 `quizFramework.ts`：`sanitizeViz` 加 tally 分支（驗 count 為正整數、icon 乾淨）
- [x] 1.5 `quizGenProvider.ts`：機制科分支 vizKind==='tally' → 走 genTallyItems 繞過 Gemini
- [x] 1.6 `curriculum.json`：eng-g2-number / eng-g4-how-many 改 `vizKind:"tally"`

## 2. 前端：tally viz 渲染 + 作答前顯示

- [x] 2.1 `contracts/providers.ts` + `client.ts`：A1MathViz 加 `'tally'` kind + `count?` 欄位
- [x] 2.2 `MathDiagram.tsx`：TallyDiagram（平鋪 N 個 icon，**無算式、無答案**）
- [x] 2.3 `QuizPage.tsx`：tally viz 在 stem 區（submit 前）渲染；count/groups 維持 submit 後

## 3. 驗證

- [x] 3.1 backend build（tsc）+ frontend build 通過
- [x] 3.2 手動驗：英文 quiz 出數量題、圖顯示 N 個物件、答案=N 的英文數字、選項英文、批改正確
- [x] 3.3 Architecture sync + event log 收尾
