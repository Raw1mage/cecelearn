# Tasks: a6_quiz-dynamic-generation

對應 spec.md Requirements 與 design.md Decisions。本功能為後端變更（已實作完成）。

## 1. 題型框架單一真相源（quizFramework.ts）

- [x] 1.1 抽出 SUBJECT_PLAN（國/數/英/自然/社會各科題型策略）（DD-5）
- [x] 1.2 buildResponseSchema / buildPrompt（Gemini 大寫 dialect，對齊 geminiChatProvider）
- [x] 1.3 sanitizeViz 安全網：count/groups 算式不變式、icon 只收 emoji（DD-4）
- [x] 1.4 validate 自驗：kpId/stem/answer/steps/source/choices 含答案
- [x] 1.5 callGemini：round-robin 金鑰 + 429 掉接 + 逾時
- [x] 1.6 genForKp：生 → 套 GenItem → sanitizeViz → 回 {items, vizStripped}
- [x] 1.7 reposeFact：事實種子重出選擇題、釘答案、驗選項（DD-3）

## 2. Runtime 生題編排（quizGenProvider.ts）

- [x] 2.1 載入 curriculum，建機制科 strand 索引 + subjectName map（DD-2）
- [x] 2.2 distribute：count 洗牌 round-robin 分配到 KP（DD-7）
- [x] 2.3 機制科路徑：genForKp 並行 → validate → 攤平 QuizServeItem（DD-1）
- [x] 2.4 事實科路徑：取種子 → reposeFact → fail-safe 退回種子（DD-3/DD-8）
- [x] 2.5 meta：機制科（curriculum）＋ 事實科（種子池）合併（DD-6）

## 3. 事實種子池（quizBankProvider.ts）

- [x] 3.1 讀 quizbank.json（trim 成只剩自然/社會 120 條）
- [x] 3.2 serve(subject/grade/count)：洗牌抽種子；meta()：種子池實況

## 4. 路由與接線（server.ts）

- [x] 4.1 GET /api/quiz：全走 quizGen.generate
- [x] 4.2 GET /api/quiz/meta：quizGen.meta()（已合併）
- [x] 4.3 構造 quizBank（種子池）→ 注入 quizGen

## 5. 資料資產

- [x] 5.1 curriculum.json 全科全級 111 KP + curriculum.schema.json 契約
- [x] 5.2 quizbank.json trim 成事實種子池（120 條，reviewed:false）

## 6. 驗證

- [x] 6.1 backend / frontend tsc 全綠
- [x] 6.2 live：機制科即時生（連抽兩次不同）、事實科釘答案 + 變化包裝
- [x] 6.3 live：/api/quiz/meta 回 26 組科級

## 後續（非本 plan 範圍，不阻 verified）

- 事實種子 120 條人工審 → reviewed:true（事實品質把關）— 另開 plan/工項。
- scripts/gen-quizbank.mjs 併入 quizFramework，消除框架雙拷貝 — 技術債，另記。
