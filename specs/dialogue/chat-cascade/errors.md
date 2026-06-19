# Errors: dialogue_chat-cascade

對話 chat 的錯誤碼與處置。所有錯誤回兒童友善 `message`，技術碼走 structured log。

## Error Catalogue

錯誤碼（A1ErrorResponse.error）：


| 碼 | 來源 | 掉接 Gemini? | 說明 |
|---|---|---|---|
| `CHAT_BAD_REQUEST` | 空 messages / JSON 壞 | **否** | 使用者輸入問題，掉接也沒用 |
| `CHAT_BARE_UNAVAILABLE` | socket 連不上 / 非 2xx / timeout / 例外 | 是 | bare 可用性失敗 |
| `CHAT_BARE_ERROR` | daemon 回 info.error（fail-fast / rate-limit / provider 錯） | 是 | daemon 端明確錯誤 |
| `CHAT_BARE_NO_JSON` | 抽不到合法 JSON / payload 不完整 | 是 | 軟性結構化救不回 |
| `CHAT_NOT_CONFIGURED` | provider 未配置 | 是 | 保險 |
| `CHAT_UPSTREAM_ERROR` / `CHAT_EMPTY_REPLY` / `CHAT_PARSE_ERROR` | Gemini 側泛用 | 是 | 保險（cascade 主用 bare 碼） |

`FALLTHROUGH_CODES` = 上表「是」者。`CHAT_BAD_REQUEST` 永不掉接。

## 處置原則

- **天條 #11 不靜默降級**：掉接只在「打不通 / 救不回」（可用性），不在「有回應但形狀降級」。主備回同 `A1ChatResponse` 形狀；小朋友不會靜默拿到降級輸出。
- **主備皆失敗**：回 secondary（Gemini）的 typed error，不捏造回覆。
- **形狀偏差先救再掉接**：story/sentence 字串→物件正規化、key 補引號、剝 StructuredOutput(...) 殼 —— 救得回就不掉接（省 Gemini 成本）；救不回才 CHAT_BARE_NO_JSON → 掉接。
- **設定錯誤 fail-fast**：bare/cascade 缺 socket、cascade 缺 GEMINI_API_KEYS → loadEnv 啟動即報錯，不默默單 tier。

## 已知限制

- claude-cli 軟性結構化非確定性：rich payload 偶爾形狀錯/漏 → 經 normalize/validate 吸收，救不回掉接 Gemini。
- 寬鬆 key-quoting 修復理論上可能誤傷含 `, key:` 樣式的字串值（兒童內容罕見）；失敗即掉接，不會回壞資料。
