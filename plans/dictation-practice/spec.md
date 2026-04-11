# Spec

## Purpose

- 提供國小學童四種模式的國字聽寫練習，支援按教材進度篩選出題，計分遊戲化。

## Requirements

### Requirement: 出題範圍篩選

系統 SHALL 支援三種出題範圍：隨機、課綱篩選、家長自訂。

#### Scenario: 隨機出題

- **GIVEN** 使用者選擇「隨機出題」模式
- **WHEN** 按下「開始練習」
- **THEN** 後端從 vocabulary.json 全庫 2,979 字隨機選取指定題數的生字

#### Scenario: 課綱篩選

- **GIVEN** 使用者選擇出版社「康軒版」、年級「3年級」、勾選「第一課」「第二課」
- **WHEN** 按下「開始練習」
- **THEN** 後端只從康軒版 3 年級第 1、2 課的生字中選題

#### Scenario: 家長自訂

- **GIVEN** 使用者選擇「自訂」模式並輸入「學校花草」
- **WHEN** 按下「開始練習」
- **THEN** 後端從「學、校、花、草」四個字中出題

### Requirement: 描寫練習（題型 D）

系統 SHALL 提供看筆順 → 練習描寫的練習模式。

#### Scenario: 完成描寫

- **GIVEN** 使用者選擇描寫練習，系統顯示一個字及其筆順動畫
- **WHEN** 筆順動畫播完，進入 HanziWriter quiz 模式，使用者用觸控或滑鼠描寫
- **THEN** HanziWriter 逐筆判定，錯兩筆自動提示，寫完得 1 分，播放煙火（全對時）

### Requirement: 聽寫測驗（題型 C）

系統 SHALL 提供語音唸題 → 手寫作答的聽寫模式。

#### Scenario: 聽寫兩字詞

- **GIVEN** 系統選定詞語「學校」
- **WHEN** TTS 唸出「ㄒㄩㄝˊ ㄒㄧㄠˋ，學校」
- **THEN** 依序出現兩個 HanziWriter quiz 框，使用者逐字手寫，寫完第一字自動跳第二字

#### Scenario: 重聽

- **GIVEN** 使用者在手寫過程中忘記唸了什麼
- **WHEN** 按下喇叭圖示
- **THEN** TTS 重新唸出同一個詞語

### Requirement: 例句填空選擇題（題型 A）

系統 SHALL 提供例句挖空 + 4 選 1 的選擇題模式。

#### Scenario: 答對

- **GIVEN** 系統顯示「他在＿＿上寫了名字。」選項為「學校、雪花、下雨、上課」
- **WHEN** 使用者選擇「學校」
- **THEN** 顯示綠色 + 得 1 分 + combo 計數

#### Scenario: 答錯

- **GIVEN** 使用者選了錯誤選項
- **WHEN** 提交答案
- **THEN** 顯示紅色 + 正確答案 + combo 歸零

### Requirement: 例句填空手寫題（題型 B）

系統 SHALL 提供例句挖空 + HanziWriter 手寫作答的模式。

#### Scenario: 無提示寫對

- **GIVEN** 系統顯示「他在＿上寫了名字。」需要寫「校」
- **WHEN** 使用者在 HanziWriter quiz 中無提示完成
- **THEN** 得 3 分（高分）

#### Scenario: 有提示後完成

- **GIVEN** 使用者描寫錯誤超過 2 筆
- **WHEN** HanziWriter 顯示提示後使用者完成
- **THEN** 得 1 分（基本分）

### Requirement: 計分遊戲化

系統 SHALL 提供即時反饋和 combo 連擊機制。

#### Scenario: Combo 連擊

- **GIVEN** 使用者已連續答對 4 題
- **WHEN** 第 5 題答對
- **THEN** combo 計數顯示 5，分數乘以 1.5 倍，顯示火焰特效

#### Scenario: 全對煙火

- **GIVEN** 使用者完成所有題目
- **WHEN** 全部答對
- **THEN** 播放 canvas-confetti 煙火特效

## Acceptance Checks

- 三種出題範圍（隨機/課綱/自訂）各產出正確範圍的題目
- 四種題型各能完成一輪完整流程（設定 → 答題 → 結果 → 回顧）
- TTS 能唸出中文詞語和注音
- HanziWriter quiz 在桌面和行動裝置觸控正常
- combo 計數在連續答對時正確遞增，答錯時歸零
- 計分板分數在答題後正確累加
- 全對時播放煙火特效
