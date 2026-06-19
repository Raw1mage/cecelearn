# Proposal: a6_quiz-dynamic-generation

## Why

- 學科練習（A6 QuizPage / start_quiz）需要源源不絕的題目。最初做法是「離線批次生題 → 存成 quizbank.json 死題庫」（553 題）。
- 死題庫的問題：會被做完、會重複、會 staleness，無法依小朋友程度客製，還多一個「要不要 commit 幾百道題」的維護包袱。
- 使用者洞察：**「抽取知識點再來 AI 動態生題就好了。下載死題目沒什麼意義。重點是題型框架。」** 真正有複利價值的是「知識點骨架 + 題型框架」，不是凍結的題目。
- 但事實科（自然/社會）不能像數學那樣機械驗證對錯，純動態生會把唯一的審核閘拆掉 → 需要分流處理。

## Original Requirement Wording (Baseline)

- 「我覺得抽取知識點再來 AI 動態生題就好了。下載死題目沒什麼意義。重點是題型框架。」
- 「（事實科）雖然是事實，但是選項可以變化不是嗎」

## Requirement Revision History

- 2026-06-19: 初版——把生題框架從 build 腳本升格成後端 runtime 引擎，國/數/英 動態生。
- 2026-06-19: 事實科處理由「靜態審過池」修正為「事實種子重包裝（釘答案、變選項）」，收斂成單一生成機制。

## Effective Requirement Description

1. 全科出題走 runtime 動態生，後端不存「機制科」死題。
2. 題型框架（各科策略、schema、prompt、viz 安全網、自驗、事實重包裝）為**單一真相源**，runtime 與 CLI 共用。
3. 機制科（國/數/英）：從 curriculum.json 知識點骨架即時生題；數學圖解經 viz 安全網把關（永不畫錯）。
4. 事實科（自然/社會）：從事實種子池取「已確認事實」重新包裝成新選擇題，**正解釘死等於種子答案**，只變選項與語句；重包裝失敗退回種子原題。
5. 端點：`GET /api/quiz?subject&grade&count`、`GET /api/quiz/meta`。

## Scope

### IN
- 後端 runtime 生題引擎（quizFramework + QuizGenProvider + QuizBankProvider 種子池）。
- 題型框架單一真相源化（從 scripts/gen-quizbank 的離線版抽出）。
- 知識點骨架 curriculum.json（全科全級 111 KP）+ 契約 curriculum.schema.json。
- 事實種子池 quizbank.json（120 條，自然/社會）。
- `/api/quiz`、`/api/quiz/meta` 路由。

### OUT
- 前端 QuizPage 出題畫面（屬 a1_quiz_overlay / a6_quiz-voice-answer）。
- 語音作答（屬 a6_quiz-voice-answer）。
- start_quiz 意圖分類（屬 a1 對話家教）。
- 事實種子的人工審核流程（列為後續；種子 reviewed:false）。

## Non-Goals

- 不做題目持久化/離線題庫（刻意不存機制科死題）。
- 不做事實科的自動事實查核（靠釘種子答案，不靠二次 AI 驗證）。

## Constraints

- Gemini 2.5 Flash 結構化輸出（responseSchema 大寫 dialect，對齊既有 geminiChatProvider）。
- viz 規格必須與題目算式完全一致（README 鐵律「數學圖解永不畫錯」）。
- 事實題機器驗不出對錯 → 正解只能信任「已審/已確認的種子答案」。

## What Changes

新增後端 provider 三件 + 路由；題型框架去重（runtime/CLI 共用一份）。

## Capabilities

### New Capabilities
- 全科 runtime 動態生題：無限變化、不重複。
- 事實科「同一事實、變化包裝、釘答案」的安全生成。

### Modified Capabilities
- `/api/quiz`：從「讀死題庫」改為「動態生」。
- `/api/quiz/meta`：範圍由 curriculum（機制科）+ 種子池（事實科）合併。

## Impact

- 後端：webapp/backend/src/providers/{quizFramework,quizGenProvider,quizBankProvider}.ts、server.ts 路由、data/{curriculum,quizbank,curriculum.schema}.json。
- 前端：無（API 形狀不變）。
