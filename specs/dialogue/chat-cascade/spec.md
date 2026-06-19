# Spec: dialogue_chat-cascade

## Purpose

讓小雞老師（A1 對話）的 intent 分類與回覆可借同機 opencode daemon 的 bare session（Claude OAuth 訂閱）跑，Gemini 為靜默備援；客戶端吸收 claude-cli 軟性結構化，預設行為不變（env 切換）。

## Requirements

### Requirement: 對話 provider 可級聯切換

#### Scenario: env 開啟 cascade
- **GIVEN** `CHAT_PROVIDER=cascade`、bare 連線與 `GEMINI_API_KEYS` 齊備
- **WHEN** 後端啟動建 chat provider
- **THEN** A1 對話經 `CascadeChatProvider`（primary=claude-bare → secondary=gemini）

#### Scenario: 預設不退化
- **GIVEN** 未設 `CHAT_PROVIDER`（或 =gemini）
- **WHEN** chat
- **THEN** 行為與改動前一致（純 Gemini，輸出形狀不變）

#### Scenario: 設定 fail-fast
- **GIVEN** `CHAT_PROVIDER=bare|cascade` 但缺 socket，或 cascade 缺 `GEMINI_API_KEYS`
- **WHEN** loadEnv
- **THEN** 直接報錯，不默默變單 tier（天條 #11）

### Requirement: Claude bare session 借對話層

#### Scenario: 簡單 intent 走 Claude
- **GIVEN** `CHAT_PROVIDER=cascade`，小朋友說「我要練習聽寫」
- **WHEN** 後端 chat
- **THEN** 經 unix socket 開 `bare` agent session、釘 Claude 訂閱帳號，回 `intent=start_dictation` + reply，log `tier=claude-bare, outcome=ok`，不掉接

#### Scenario: rich payload 經吸收後完整
- **GIVEN** 小朋友說「蘋果的蘋」/「講一隻貓的故事」/「用蘋果造句」/「3 乘 7 怎麼算」
- **WHEN** Claude 軟性結構化回（可能含 fence / `StructuredOutput(...)` / story 字串形狀）
- **THEN** 經抽取＋形狀正規化＋完整性驗證後回正確 payload（lookup.words / story.story 物件 / sentence.sentences / arithmetic），前端正常渲染、無空泡泡

### Requirement: 級聯掉接界線（不靜默降級）

#### Scenario: Claude 不可用 → Gemini 備援
- **GIVEN** bare socket 連不上 / daemon 錯 / 結構化救不回（CHAT_BARE_*）
- **WHEN** cascade chat
- **THEN** log `outcome=fallthrough`，改由 Gemini（硬強制 responseSchema）回同形狀；主備皆失敗才回 typed error

#### Scenario: 使用者輸入問題不浪費備援
- **GIVEN** 空 messages（CHAT_BAD_REQUEST）
- **WHEN** cascade chat
- **THEN** 不掉接 Gemini，直接回 typed error

## Acceptance Checks

- [x] AC1 tsc（backend）通過
- [x] AC2 直打 bare：start_dictation / lookup(+payload) / make_sentence(+payload) / solve_arithmetic(+payload) 皆 ok
- [x] AC3 cascade 掉接邏輯：broken socket → 落到 secondary（log fallthrough）
- [x] AC4 形狀正規化：tell_story 連打 5 次皆 `story` 物件且文字非空
- [x] AC5 端到端（gateway → backend → cascade → Claude）：log `tier:"claude-bare", outcome:"ok"`
- [x] AC6 UI 實測：「講一隻貓的故事」渲染完整故事（無空泡泡）；「蘋果的蘋」查字泡泡正常
- [x] AC7 預設 gemini 不退化（buildA1Response 共用、輸出形狀不變）
