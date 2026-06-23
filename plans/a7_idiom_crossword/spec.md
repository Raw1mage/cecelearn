# Spec: a7_idiom_crossword

## Purpose

定義成語交叉填字遊戲（a7）的可觀測行為：關卡生成、填字互動、校驗、提示、教學揭曉、過關回饋。所有需求以 GIVEN/WHEN/THEN 場景描述，作為實作與驗收的單一依據。

## Glossary（taxonomy，避免命名歧義）

- **Puzzle（關卡）**：一個交叉填字盤面，由多條成語在共用字交叉組成。
- **Slot（成語槽）**：盤面上一條完整成語佔的連續格子序列（橫或直），4 格（四字成語）。
- **Cell（格子）**：盤面最小單位，落在某 (row, col)。可為「給定字（givenChar，已填好）」「空格（blank，待填）」或「無格（盤面以外）」。
- **Intersection（交叉點）**：同時屬於兩個 Slot（一橫一直）的 Cell；其字必須同時滿足兩條成語。
- **Tray（備選字塊）**：底部待填的候選字集合，數量 = 所有 blank cell 數，內容 = 各 blank 的正解字打散（可加少量誘答字，見 DD）。
- **填入（place）**：把一個 tray 字放進一個 blank cell。
- **完成（solved）**：所有 blank cell 都被填入，且每條 Slot 拼出的字串都等於該 Slot 的目標成語。

## Requirements

### Requirement: 進入遊戲與生成關卡

#### Scenario: 首次進入 a7 自動生成第一關
- **GIVEN** 小朋友開啟 `/a7` 頁面
- **WHEN** 頁面載入
- **THEN** 前端向後端 `GET /api/a7/puzzle`（可帶難度/關號）請求一個關卡
- **AND** 後端回傳一個合法 Puzzle（至少 2 條成語、至少 1 個交叉點、所有 blank 都有解、tray 字數=blank 數）
- **AND** 前端渲染交叉盤（給定字直接顯示、blank 顯示空框）與底部 tray
- **AND** 顯示目前關號（如「第 1 關」）

#### Scenario: 後端無法生成合法關卡
- **GIVEN** 演算法在限定嘗試次數內排不出合法盤面
- **WHEN** 後端處理 `GET /api/a7/puzzle`
- **THEN** 回傳 `{ ok: false, error, message }`，不回傳殘缺或不可解盤面（不 silent fallback）
- **AND** 前端顯示友善錯誤並提供「再試一次」

### Requirement: 填字互動

#### Scenario: 選字並填入空格
- **GIVEN** 盤面有 blank cell、tray 有候選字
- **WHEN** 小朋友點一個 tray 字，再點一個 blank cell
- **THEN** 該字填入該 cell，tray 中該字塊標記為已用（或移除）
- **AND** 若該 cell 已有填入字，先退回原字到 tray 再填新字

#### Scenario: 清除已填的字
- **GIVEN** 某 blank cell 已被填入一個字
- **WHEN** 小朋友再次點該 cell（或點清除）
- **THEN** 該字退回 tray，cell 回到空格狀態

#### Scenario: 即時校驗單條成語完成
- **GIVEN** 某 Slot 的所有 cell（含 blank）都已有字
- **WHEN** 最後一格被填入
- **THEN** 若該 Slot 拼出的字串等於目標成語，標記該 Slot 為已完成（視覺高亮，如綠底）
- **AND** 觸發該成語的教學揭曉（見教學需求）
- **AND** 若不等於目標成語，不標完成（保持可改，不強制清空）

### Requirement: 提示（簡單版，無金幣）

#### Scenario: 免費提示揭一字
- **GIVEN** 盤面還有未正確填入的 blank cell
- **WHEN** 小朋友點「提示」
- **THEN** 系統挑一個尚未正確填入的 blank cell，自動填入其正解字並鎖定（標記為提示給定）
- **AND** 對應 tray 字塊標為已用
- **AND**（MVP）提示次數不扣金幣；可選擇限制每關提示次數（見 DD）

### Requirement: 成語教學揭曉

#### Scenario: 完成成語後顯示釋義與例句
- **GIVEN** 某 Slot 被正確完成
- **WHEN** 完成事件觸發
- **THEN** 顯示該成語的釋義（若資料有）與一句例句
- **AND** 提供 🔊 用既有 TTS（`shared/speech/tts`）朗讀該成語＋例句
- **AND** 若資料無釋義，至少顯示例句（兜底，不顯示空白）

### Requirement: 過關與回饋

#### Scenario: 完成整個盤面過關
- **GIVEN** 盤面所有 Slot 都正確完成
- **WHEN** 最後一條成語完成
- **THEN** 觸發 `celebrate()` 灑花
- **AND** 透過 ScoreContext `addScore` 加分
- **AND** 顯示過關卡片，提供「下一關」（請求新 Puzzle）與「回首頁」

#### Scenario: 重置本關
- **GIVEN** 遊戲進行中
- **WHEN** 小朋友點「重置本關」
- **THEN** 盤面所有非給定字的 blank 清空、tray 還原、已完成標記清除（同一關卡，不重新生成）

## Acceptance Checks

- [ ] `/a7` 路由可進入，自動生成並渲染一個合法交叉盤。
- [ ] 後端 `GET /api/a7/puzzle` 回傳的 Puzzle 一定可解（所有 blank 有唯一/合法解、tray 字數正確、交叉字一致）。
- [ ] 選字→填格→清除→改填 互動正確，tray 狀態同步。
- [ ] 單條成語填對即高亮並揭曉教學（釋義/例句/朗讀）。
- [ ] 提示可揭一字並鎖定。
- [ ] 全部填對觸發 celebrate + 加分 + 過關卡片，可進下一關。
- [ ] 重置本關可清空回初始（不換題）。
- [ ] 生不出盤面時顯式回報，不出殘缺盤。
- [ ] 視覺沿用 Panel/Button/主題變數，與其他模組一致。
- [ ] 全程零後端 API 成本（純本地演算法 + 本地 idioms.json）。
