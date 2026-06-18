# Spec: a1_dialogue_tutor

## Purpose

定義「A1 對話型小家教（小雞老師）」的行為合約：多輪語音/文字對話、intent 分流（查字/造詞/造句/講故事/閒聊/直接畫圖/四則運算教學）、單欄對話串流 inline 渲染、後端 Gemini text/image proxy 行為。本文件描述「做什麼」與「對外可觀察行為」，不描述實作細節（見 design.md）。

## Terminology

- **Turn（回合）**：一次「使用者輸入 → 家教回覆」的完整往返。
- **Message（訊息）**：對話 history 中的單筆紀錄，`role ∈ {user, tutor}`。
- **Intent（意圖）**：家教對使用者該輪輸入的語意分類，決定回覆形態與渲染方式。
- **Conversation Stream（對話串流）**：單欄全寬對話區，承載使用者訊息、家教回覆、造詞/造句/故事、筆順動畫、AI 插畫與四則運算工具卡。
- **Inline Rich Content（內嵌富內容）**：每則 tutor message 可附帶造詞卡、例句、故事、筆順、插畫或算術動畫；內容留在該訊息下方，不用常駐獨立圖框。
- **Conversation History（對話歷史）**：前端記憶體中的 `Message[]`，每輪送後端做 context。

### Intent 取值（封閉集合）

| intent | 觸發語意（例） | Conversation Stream 輸出 | Inline 視覺內容 |
|---|---|---|---|
| `lookup` | 「字怎麼寫」「○○的×」 | 造詞卡片 + 成語卡片（既有） | 筆順動畫（目標字） |
| `make_words` | 「用X造詞」「X可以組什麼詞」 | 造詞卡片 | 筆順動畫（X） |
| `make_sentence` | 「用X造句」「用X造三個句子」 | 例句陣列（預設 1 句，上限 5 句） | 自動情境插畫或成本閘後的「畫給我看」 |
| `tell_story` | 「講一個關於X的故事」 | 故事段落 | 自動故事插畫或成本閘後的「畫給我看」 |
| `draw` | 「畫一隻貓」「畫海邊」 | 簡短確認語 | 自動依描述生成插畫或成本閘後的「畫給我看」 |
| `solve_arithmetic` | 「3 乘 7 怎麼算」「24 除以 6」 | 簡短教學引導語 | 四則運算直式動畫卡（可重播） |
| `chat` | 其他自由對話 | 對話泡泡（家教回覆文字） | 無 |
| `unclear` | 無法分類 | 引導語（請小朋友換句話說） | 無 |

## Requirements

### Requirement: 多輪對話與上下文記憶

家教必須在單次頁面生命週期內記得對話前文。

#### Scenario: 連續兩輪相關對話
- **GIVEN** 小朋友先說「用『勇敢』造句」，家教回覆一個句子
- **WHEN** 小朋友接著說「再來一句」
- **THEN** 家教理解「再來一句」指的是「勇敢」造句，產生第二個不同的句子
- **AND** 兩輪都出現在 Conversation History

#### Scenario: 頁面重整清空記憶
- **GIVEN** 對話已有多輪 history
- **WHEN** 使用者重整頁面
- **THEN** Conversation History 清空，回到初始問候狀態（不持久化、不需登入）

### Requirement: Intent 分流

家教必須依使用者輸入判定 intent，並以對應形態回覆。

#### Scenario: 造句 intent
- **GIVEN** 家教就緒
- **WHEN** 小朋友說/輸入「用『開心』造句」
- **THEN** 後端回傳 `intent = make_sentence`，內容含一個適合兒童的例句與其注音
- **AND** Conversation Stream 在同一則 tutor message 內顯示句子卡片
- **AND** 若未達成本閘上限，前端自動呼叫插畫；達上限時顯示「畫給我看」按鈕

#### Scenario: 講故事 intent
- **WHEN** 小朋友說「講一個關於小狗的故事」
- **THEN** 後端回傳 `intent = tell_story`，內容為一段適齡短故事（長度上限見 data-schema）
- **AND** Conversation Stream 在同一則 tutor message 內顯示故事段落
- **AND** 若未達成本閘上限，前端自動呼叫插畫；達上限時顯示「畫給我看」按鈕

#### Scenario: 直接畫圖 intent
- **WHEN** 小朋友說「畫一隻貓」
- **THEN** 後端回傳 `intent = draw`，含 `draw.subject`
- **AND** Conversation Stream 顯示小雞的簡短確認語
- **AND** 前端依 `draw.subject` 自動生成插畫或顯示「畫給我看」按鈕

#### Scenario: 查字 intent 保留既有行為
- **WHEN** 小朋友說「『學』這個字怎麼寫」
- **THEN** 後端回傳 `intent = lookup`，含 character/bopomofo/words/idioms（既有 A1LookupResponse 欄位）
- **AND** Conversation Stream 在同一則 tutor message 內顯示 HanziWriter 筆順動畫
- **AND** Conversation Stream 顯示造詞與成語卡片

#### Scenario: 四則運算 intent
- **WHEN** 小朋友說「3 乘 7 怎麼算」或「24 除以 6」
- **THEN** 後端回傳 `intent = solve_arithmetic`，含 `arithmetic = { a, b, operation, expression }`
- **AND** Conversation Stream 在同一則 tutor message 內顯示四則運算直式動畫卡
- **AND** 算術執行由前端 deterministic engine 完成，不由 LLM 產生步驟

#### Scenario: 無法分類
- **WHEN** 小朋友的話無法判定 intent
- **THEN** 後端回傳 `intent = unclear`，附引導語
- **AND** 不清空既有顯示內容（維持上一狀態）

### Requirement: 對話串流富內容泛化

原「造詞 Panel」與常駐圖框必須收斂成單欄 Conversation Stream；各 intent 的文字與視覺輸出都內嵌在對應 tutor message 下方。

#### Scenario: 同一視窗切換形態
- **GIVEN** 上一輪 tutor message 顯示造詞卡片
- **WHEN** 新一輪 intent = make_sentence
- **THEN** 新 tutor message 顯示句子卡片，不覆蓋上一輪造詞卡片

#### Scenario: 形態與 intent 對齊
- **THEN** Conversation Stream 渲染形態必須由回合 `intent` 決定（lookup/make_words→卡片；make_sentence→句子；tell_story→段落；draw→插畫；solve_arithmetic→四則動畫；chat/unclear→泡泡/引導語）

### Requirement: Inline 筆順與插畫

原「筆畫框」不常駐；筆順動畫與 AI 情境插畫只在需要時內嵌到該回合訊息中。

#### Scenario: 筆順模式
- **WHEN** intent ∈ {lookup, make_words}
- **THEN** 該 tutor message 內顯示目標字筆順動畫，保留既有「重播 / 練習寫字」操作

#### Scenario: 插畫模式（自動 + 成本閘）
- **GIVEN** intent ∈ {make_sentence, tell_story, draw} 且該回合可插畫
- **WHEN** 自動生圖未達 session 上限與每日上限
- **THEN** 前端自動呼叫後端 `/api/a1/illustrate`，傳入當前句子/故事/畫圖描述
- **AND** 該 tutor message 內顯示生成中狀態，完成後顯示插畫
- **AND** 每張插畫保留於原訊息、可下載、可重畫

#### Scenario: 生圖成本閘
- **GIVEN** session 自動生圖已達上限
- **WHEN** 新回合仍可插畫
- **THEN** 不自動呼叫影像 API，改顯示「畫給我看」按鈕
- **AND** 使用者手動按鈕仍可補畫，但受每日硬上限保護

#### Scenario: 插畫生成失敗 fail-fast
- **WHEN** 影像生成失敗（API 錯誤/逾時）
- **THEN** 該 tutor message 內顯示明確錯誤訊息與「再試一次」
- **AND** 不得以佔位圖或空白冒充成功（符合架構 no-silent-fallback 規則）

### Requirement: 語音輸入與輸出

#### Scenario: 桌面自由語音對話
- **GIVEN** 桌面瀏覽器允許連續麥克風
- **WHEN** 麥克風開啟且收到 final transcript
- **THEN** 不需要「小雞小雞」喚醒詞，辨識結果直接送入對話迴圈
- **AND** TTS 播放中與播放後短暫尾窗的辨識結果會被丟棄，避免自我回饋迴圈
- **AND** Android Chrome full-duplex 不保證支援，Samsung manual mode 保留

#### Scenario: 語音播報家教回覆
- **GIVEN** 家教產生文字回覆（句子/故事/對話）
- **WHEN** 回覆顯示於 Conversation Stream
- **THEN** 使用瀏覽器 `SpeechSynthesis` 以中文朗讀回覆（可由使用者開關）

### Requirement: 後端 Gemini Proxy

#### Scenario: 對話走後端
- **WHEN** 前端送出一輪對話
- **THEN** 後端 `/api/a1/chat` 接收 `{ messages, ... }`，組成 Gemini `contents[]` 後呼叫 Gemini REST（用 `GEMINI_API_KEYS`），回傳結構化 `{ intent, ... }`
- **AND** 前端從不直接持有或呼叫 Gemini API key

#### Scenario: 影像走後端
- **WHEN** 前端自動或手動要求插畫
- **THEN** 後端 `/api/a1/illustrate` 接收情境文字，呼叫 Gemini 影像模型，回傳影像 data URI

#### Scenario: 兒童安全約束
- **THEN** 後端 prompt 必須含兒童語境與安全約束（正向、適齡、繁體中文台灣用語）

## Acceptance Checks

- [ ] 連續兩輪對話，第二輪能引用第一輪上下文。
- [ ] 「用X造句」回傳 make_sentence 並在 Conversation Stream 顯示句子卡片。
- [ ] 「講關於X的故事」回傳 tell_story 並顯示段落。
- [ ] 「畫一隻貓」回傳 draw 並可生成插畫。
- [ ] 「3 乘 7 怎麼算」回傳 solve_arithmetic 並 inline 顯示四則運算動畫卡。
- [ ] 查字仍回傳 lookup 並 inline 顯示筆順 + 造詞 + 成語（既有行為不退化）。
- [ ] 可插畫回合自動或手動觸發後端影像生成並顯示插畫；失敗時顯式報錯不給佔位圖。
- [ ] 插畫保留於各自訊息，可回顧、下載、重畫，不被新回合覆蓋。
- [ ] 自動生圖達 session 上限後改顯示「畫給我看」；每日上限達成後顯示 capped。
- [ ] 語音輸入辨識結果進入對話迴圈；桌面不需喚醒詞，TTS echo guard 阻止自我回饋。
- [ ] 家教回覆可語音播報，可開關。
- [ ] 前端不含 Gemini API key；所有 Gemini 呼叫經後端。
- [ ] 頁面重整後 history 清空。
