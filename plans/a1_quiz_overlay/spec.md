# Spec: a1_quiz_overlay

## Purpose

定義「小雞老師對話喚起聽寫/成語測驗（全螢幕 overlay）並回流成績」的行為需求。對話是唯一入口與結果匯流點，測驗保有既有沉浸式 UI。

## Requirements

### Requirement: Portal 收斂為對話首頁

#### Scenario: 使用者開啟應用根路徑
- **GIVEN** 使用者瀏覽到 "/"
- **WHEN** 應用載入
- **THEN** 直接呈現 A1「小雞老師」對話界面（輸入列 + 對話串流）
- **AND** 不顯示原 Portal 的三張功能卡片

#### Scenario: 舊 route 仍可直達
- **GIVEN** 使用者手動輸入 /a2、/a3 或 /a5
- **WHEN** route 解析
- **THEN** 各自的獨立測驗頁面照常運作（debug/直達用途，行為不退化）

### Requirement: 對話喚起聽寫測驗

#### Scenario: 語音/打字意圖喚起聽寫
- **GIVEN** 使用者在對話說或輸入「我要練習聽寫」「考我聽寫」之類
- **WHEN** 後端判定 intent = `start_dictation`
- **THEN** 對話串流插入一則 tutor 引導語泡泡（例：「好呀！我們來練習聽寫～」）
- **AND** 拉起聽寫測驗的全螢幕 overlay
- **AND** A1 語音辨識在 overlay 期間暫停（避免與 A5 TTS 衝突）

#### Scenario: 快捷鈕喚起聽寫
- **GIVEN** 使用者點對話輸入列上的「聽寫」快捷鈕
- **WHEN** 觸發
- **THEN** 等同 `start_dictation` 意圖：插入引導語 + 拉起聽寫 overlay + 暫停辨識

### Requirement: 對話喚起成語測驗

#### Scenario: 語音/打字意圖喚起成語
- **GIVEN** 使用者說或輸入「來玩成語」「成語練習」之類
- **WHEN** 後端判定 intent = `start_idiom`
- **THEN** 對話串流插入 tutor 引導語泡泡
- **AND** 拉起成語測驗的全螢幕 overlay

#### Scenario: 快捷鈕喚起成語
- **GIVEN** 使用者點「成語」快捷鈕
- **WHEN** 觸發
- **THEN** 等同 `start_idiom` 意圖：插入引導語 + 拉起成語 overlay

### Requirement: 測驗 overlay 行為

#### Scenario: overlay 顯示既有測驗 UI
- **GIVEN** overlay 已開啟（聽寫或成語）
- **WHEN** 渲染
- **THEN** 顯示既有 A5Page / A2Page 完整測驗流程（出題設定→作答→結果）
- **AND** 提供關閉按鈕回到對話

#### Scenario: 使用者中途關閉 overlay
- **GIVEN** overlay 開啟中、測驗未完成
- **WHEN** 使用者點關閉
- **THEN** overlay 關閉，回到對話
- **AND** A1 語音辨識恢復（若先前為開啟狀態）
- **AND** 不插入成績總結卡（未完成）

### Requirement: 測驗成績回流對話

#### Scenario: 聽寫完成回流總結
- **GIVEN** 使用者在聽寫 overlay 完成全部題目（到達 result）
- **WHEN** overlay 觸發 onComplete
- **THEN** overlay 關閉，回到對話
- **AND** 對話串流插入一則 tutor 總結卡（答對數 / 總題數 / 最高連擊）
- **AND** A1 語音辨識恢復

#### Scenario: 成語完成回流總結
- **GIVEN** 使用者在成語 overlay 交卷（到達 result）
- **WHEN** overlay 觸發 onComplete
- **THEN** 對話串流插入 tutor 總結卡（答對 N / 總題數）

### Requirement: 新 intent 不破壞既有對話

#### Scenario: 既有意圖照常
- **GIVEN** 使用者說「用蘋果造句」「蘋果的蘋」「3 乘 7 怎麼算」
- **WHEN** 後端判定為既有 intent
- **THEN** 既有 inline 渲染（造句/查字/算術卡）行為完全不變

#### Scenario: 新 intent 缺對應動作不 silent fallback
- **GIVEN** 後端回 `start_dictation` / `start_idiom`
- **WHEN** 前端處理
- **THEN** 必有明確 overlay 開啟動作；若 intent 未知則走既有 unclear 引導，不靜默忽略

## Acceptance Checks

- [ ] "/" 顯示對話，無 Portal 卡片；/a2 /a3 /a5 仍可直達
- [ ] 說「我要練習聽寫」→ 引導語 + 聽寫 overlay 開啟
- [ ] 點「聽寫」chip → 同上
- [ ] 說「來玩成語」/ 點「成語」chip → 成語 overlay 開啟
- [ ] overlay 期間 A1 麥克風停止；關閉後恢復
- [ ] 聽寫/成語完成 → 對話出現成績總結卡
- [ ] 中途關閉 → 無總結卡，辨識恢復
- [ ] 既有 5 種意圖（lookup/make_words/make_sentence/tell_story/solve_arithmetic）渲染不退化
- [ ] frontend build (tsc + vite) 通過
