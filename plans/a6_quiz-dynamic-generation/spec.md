# Spec: a6_quiz-dynamic-generation

## Purpose

定義「學科練習出題後端」的行為需求：全科 runtime 動態生題；機制科從知識點骨架即時生，事實科從事實種子重包裝且釘答案。後端不存機制科死題。

## Requirements

### Requirement: 機制科 runtime 動態生題

#### Scenario: 國/數/英 出題即時生成
- **GIVEN** `GET /api/quiz?subject=math&grade=2年級&count=N`
- **WHEN** QuizGenProvider 處理
- **THEN** 從 curriculum 該科級知識點 distribute count、即時叫 Gemini 生 N 題
- **AND** 後端不讀任何機制科死題庫

#### Scenario: 數學圖解永不畫錯
- **GIVEN** 生出的數學題附帶 viz
- **WHEN** sanitizeViz 驗算式不變式（count: result=total±operand；groups: result=groups×per）
- **THEN** 算式一致才保留 viz；不一致就剝掉 viz、保留題目
- **AND** 前端確定性 SVG 只會收到算式一致的 viz

### Requirement: 事實科種子重包裝且釘答案

#### Scenario: 同一事實、變化包裝
- **GIVEN** `subject=science|social`
- **WHEN** QuizGenProvider 取事實種子並 reposeFact
- **THEN** 重出的選擇題正解一字不差等於種子答案、選項含正解且互異
- **AND** 題幹語句與干擾選項每次可不同

#### Scenario: 重包裝失敗退回種子
- **GIVEN** reposeFact 的釘答案或選項驗證未通過
- **WHEN** 該題組裝
- **THEN** 退回種子原題（審過的題）
- **AND** 絕不輸出與種子答案不符的事實題

### Requirement: 出題範圍合併

#### Scenario: meta 涵蓋全科全級
- **GIVEN** `GET /api/quiz/meta`
- **WHEN** 合併範圍
- **THEN** 機制科範圍來自 curriculum（國/數/英 全級）、事實科來自種子池（自然/社會），合併回傳

## Acceptance Checks

- 機制科生題：`/api/quiz?subject=math` 回即時生成題；連抽兩次內容不同。
- viz 一致性：所有回傳的 groups viz 滿足 groups×per=result、count viz 滿足 result=total±operand。
- 事實釘答案：`/api/quiz?subject=science` 回傳題正解等於某條種子答案；連抽兩次選項/語句可變。
- meta：回傳 26 組科級（國/數/英×6 + 自然/社會×4）。
- 前端 API 形狀不變（QuizServeItem / QuizRange）。
