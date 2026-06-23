# Spec: game_launch_framework

## Purpose

定義「通用語音啟動遊戲機制」的可觀測行為：小雞老師（a1）如何把小朋友的語音/文字意圖轉成遊戲啟動，以及所有遊戲（含日後新增）如何透過單一 registry 一致接入。本 spec 描述**啟動契約**，不描述任何具體遊戲的玩法。

## Terminology

- **Game registry**：前後端共用的單一資料來源，列出所有可語音啟動的遊戲 entry。
- **Game entry**：一筆遊戲定義，至少含 `id`、`intent`（啟動意圖名）、`overlayKind`、`label`（入口鈕文字）、`emoji`、`triggerExamples`（prompt 觸發詞範例）。
- **Launch intent**：後端 intent 分類器可吐出的、對應某個 game entry 的意圖名（如 `start_idiom`、`start_crossword`）。
- **Overlay**：全螢幕遊戲容器，掛在 A1Page 內，接 `onClose`/`onComplete`。

## Requirements

### Requirement: 語音啟動既有遊戲（迴歸不變）

#### Scenario: 說「來玩成語」開成語測驗
- **GIVEN** 小朋友在小雞老師對話畫面
- **WHEN** 小朋友說或輸入「來玩成語」
- **THEN** 後端回 `intent=start_idiom` + 一句引導語 reply
- **AND** 前端插入引導語 tutor 泡泡後，開啟 idiom overlay（A2Page）
- **AND** 行為與本框架導入前等價（迴歸）

#### Scenario: 說「我要練習聽寫」開聽寫
- **GIVEN** 小朋友在對話畫面
- **WHEN** 輸入「我要練習聽寫」
- **THEN** `intent=start_dictation` → 開 dictation overlay（A5Page）

#### Scenario: 說「出一題數學」開練習
- **GIVEN** 小朋友在對話畫面
- **WHEN** 輸入「出一題數學給我算」
- **THEN** `intent=start_quiz` → 開 quiz overlay（QuizPage）

### Requirement: 語音啟動 a7 成語填字（新增能力）

#### Scenario: 說「玩成語填字」開 a7
- **GIVEN** 小朋友在對話畫面
- **WHEN** 小朋友說或輸入「玩成語填字」「來填字」「成語闖關」
- **THEN** 後端回 `intent=start_crossword` + 引導語 reply
- **AND** 前端開啟 crossword overlay（A7Page，overlay 模式）
- **AND** A7Page 在 overlay 模式下可由右上角 ✕ 關閉，回到對話

#### Scenario: a7 過關後回到對話
- **GIVEN** a7 overlay 已開啟且小朋友完成一關
- **WHEN** 過關流程結束（沿用 celebrate + addScore）
- **THEN** 可呼叫 `onComplete`，在對話串流插入結算摘要（對齊既有 quizSummary 慣例）
- **AND** 關閉 overlay 後恢復原本麥克風狀態（沿用既有互斥 DD-5）

### Requirement: registry 為單一真實來源

#### Scenario: 後端 intent enum 由 registry 衍生
- **GIVEN** registry 含 N 筆 game entry
- **WHEN** 後端建構 intent JSON schema 的 enum
- **THEN** 兩個 chat provider（opencodeBareChat / geminiChat）的 enum 都包含 registry 所有 launch intent
- **AND** 非啟動 intent（lookup / make_sentence / chat …）照舊保留
- **AND** 不存在「某 provider enum 有、另一 provider 沒有」的不一致

#### Scenario: prompt 觸發詞由 registry 衍生
- **GIVEN** 每筆 game entry 有 `triggerExamples`
- **WHEN** 組 a1 system prompt 的 intent 範例段
- **THEN** 每個 launch intent 都帶對應觸發詞範例
- **AND** 模型能據此把口語對應到正確 launch intent

#### Scenario: 前端 intent→overlay 由 registry 查表
- **GIVEN** registry 含 entry `{intent, overlayKind}`
- **WHEN** 前端收到某 launch intent
- **THEN** 透過 registry 查得 overlayKind 並開對應 overlay
- **AND** registry 查無此 intent → 不開任何 overlay（不 silent fallback）

#### Scenario: 首頁入口鈕由 registry 渲染
- **GIVEN** registry 含 N 筆 entry（各帶 emoji + label）
- **WHEN** 渲染首頁 quick-chips
- **THEN** 每筆 entry 產生一顆入口鈕，點擊開對應 overlay
- **AND** 鈕數量與 registry 一致（不多不少）

### Requirement: 新遊戲一致接入

#### Scenario: 加一筆 entry 即具備完整啟動能力
- **GIVEN** 開發者新增一筆 game entry + 提供 overlay 元件
- **WHEN** 不修改 intent enum / prompt / overlayForIntent / quick-chips 任何 hardcode
- **THEN** 新遊戲自動具備：語音 intent 可被分類、首頁入口鈕、overlay 掛載
- **AND** 不需散改原本的 6 處

### Requirement: 未知意圖不誤啟動

#### Scenario: 含糊輸入不開遊戲
- **GIVEN** 小朋友輸入「嗯嗯那個」
- **WHEN** 後端回 `intent=unclear`
- **THEN** registry 查無對應 entry → 不開任何 overlay
- **AND** 顯示溫柔引導語（既有 unclear 行為）

## Acceptance Checks

- [ ] 說「來玩成語 / 練習聽寫 / 出一題數學」分別開 idiom / dictation / quiz overlay（迴歸）
- [ ] 說「玩成語填字 / 來填字 / 成語闖關」開 a7 overlay（新增）
- [ ] a7 overlay 可 ✕ 關閉、過關可回對話、關閉後麥克風狀態恢復
- [ ] 兩個 chat provider 的 intent enum 都含全部 launch intent（含 start_crossword）且一致
- [ ] 首頁 quick-chips 數量 == registry entry 數，點擊各開正確 overlay
- [ ] 移除某 entry 後，對應語音 intent、入口鈕、overlay 同時消失（單一來源驗證）
- [ ] 含糊輸入（unclear）不開任何 overlay
- [ ] 前後端 tsc --noEmit 無錯；webctl restart 後手動驗收全場景
