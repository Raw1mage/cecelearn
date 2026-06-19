# Handoff: dialogue_chat-cascade

## Execution Contract

讓小雞老師對話可借 opencode daemon 的 bare session（Claude OAuth 訂閱）跑、Gemini 靜默備援，並吸收 claude-cli 軟性結構化。複用既有 `DialogueChatProvider` 介面，預設行為不變。**本案已實作、驗證、上線**（cecelearn main `d186390`）；本文件為交付紀錄。

## Required Reads

- `proposal.md` — 需求與範圍
- `design.md` — DD-1..DD-9 + Code Anchors
- `spec.md` — Purpose / Requirement / Scenario / Acceptance Checks
- `data-schema.json` — wire 契約（bare request / A1ChatResponse / 錯誤碼）
- `diagrams/` — IDEF0(A0) + GRAFCET（cascade 決策狀態機）
- opencode `specs/daemon/bare-chat-session`（living）— daemon 端 bare session、wire 契約、軟性結構化現實
- 關鍵檔（design.md Critical Files）

## Execution Order（已完成）

1. 共用模組 `a1ChatShared`（prompt + parse + normalize + validate + INTENT_JSON_SCHEMA）→ 重構 Gemini import。
2. `OpencodeBareChatProvider`（unix socket client）。
3. 軟性結構化吸收（prompt directive + extractStructuredJson 寬鬆修復 + buildA1Response 正規化/驗證）。
4. `CascadeChatProvider`（主→備，FALLTHROUGH 界線）。
5. env + server 接線（預設 gemini）。
6. 驗證（tsc + 直打 + 端到端 + UI）→ 上線（env cascade + restart）→ commit。

## Stop Gates In Force

- **天條 #11 不靜默降級**：掉接只在可用性失敗，BAD_REQUEST 不掉接，主備同形狀。
- **預設不退化**：`CHAT_PROVIDER` 未開時行為等價純 Gemini。
- **fail-fast 設定**：bare/cascade 缺 socket、cascade 缺 GEMINI_API_KEYS → loadEnv 報錯。

## Execution-Ready Checklist

- [x] proposal / design / spec 完成
- [x] IDEF0 + GRAFCET + sequence + data-schema 完成
- [x] 實作完成（3 provider + env + server 接線）
- [x] 驗證全綠（tsc / 直打 / 端到端 / UI）
- [x] 上線（env cascade + restart）+ commit `d186390`

## Validation Plan（已執行，全綠）

- tsc（backend）；直打 bare 各 intent；cascade broken-socket 掉接；tell_story 形狀 5/5；端到端 gateway log tier=claude-bare；UI 故事/查字渲染。詳見 spec.md Acceptance Checks + events。

## Notes

- 啟用：`BUILD/env/backend.env`（gitignored）設 `CHAT_PROVIDER=cascade` + `OPENCODE_CHAT_ACCOUNT=…` → `./webctl.sh restart backend`。
- 營運依賴：opencode daemon 在線；掛則自動回 Gemini。daemon 重啟若連帶殺 cecelearn backend（同 cgroup），`./webctl.sh restart backend`。
- 延後：每頁 bare session reuse（後端目前每輪渲染完整歷史）。
