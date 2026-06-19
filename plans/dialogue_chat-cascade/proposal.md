# Proposal: dialogue_chat-cascade

## Why

- 小雞老師（A1 對話家教）的 intent 分類與回覆原本只走 Gemini（`GEMINI_API_KEYS`，AI Studio）。希望改借同機 opencode daemon 已建好的對話層——帳號池 + Claude OAuth **訂閱額度**——以降低文字推理成本，且不必自持 Claude 憑證。
- opencode 端已交付 `bare/passthrough session`（見 opencode `specs/daemon/bare-chat-session`，main `b69e7e6e9`）：reserved `bare` agent + buildStaticBlock layer-zeroing，讓外部同機 app 借對話層、system prompt 只含呼叫端自己的（無 opencode 人格污染）。本案是其**客戶端**（cecelearn 後端）。
- 風險已知：claude-cli（OAuth 訂閱）後端**不強制** `toolChoice:required`，結構化輸出是「軟性」的；需在客戶端吸收（解析 + 形狀正規化 + 掉接 Gemini）。

## Original Requirement Wording (Baseline)

- 「優先接claude說話」「cecelearn只是daemon上的一個session」（承 opencode bare_chat_session proposal）
- Provider 策略拍板：「Claude 為主, Gemini 靜默備援」
- 歷史模型拍板：「session對話熱累積，不落地。網頁重置就歸零。」
- 「cecelearn可以開始工作了？」→「1」（enable + test through UI）→「ok commit」

## Requirement Revision History

- 2026-06-18: 決議 cascade（Claude 主 / Gemini 備）+ 每頁 ephemeral session（不落地 cecelearn 端處理）。見 event `event_2026-06-18_decide-cecelearn-opencode-bare-session-claude-prim`。
- 2026-06-19: 實作 + 端到端驗證 + 上線（committed `d186390`）。見 events `…start-cecelearn-bare-session-client…`、`…built-cecelearn-bare-session-chat-cascade…`。

## Effective Requirement Description

1. 新增「對話 provider 級聯」：先打 Claude（經 opencode bare session 借訂閱），連線/結構化失敗才掉接 Gemini（硬強制 responseSchema）。
2. 同機 unix socket（免認證）開 bare session、釘死 Claude 訂閱帳號（不走 rotation）。
3. 客戶端吸收 claude-cli 軟性結構化：從回覆文字抽 JSON、正規化形狀偏差、驗 payload 完整；無法救回才掉接。
4. 不改既有行為：預設 `CHAT_PROVIDER=gemini`，cascade 經 env 顯式開啟。
5. 主/備兩條路徑回同一份 `A1ChatResponse` 形狀；不靜默降級輸出（天條 #11 之精神）。

## Scope

### IN
- `OpencodeBareChatProvider`（DialogueChatProvider over unix socket）。
- `CascadeChatProvider`（Claude 主 → Gemini 備，僅可用性失敗掉接）。
- `a1ChatShared`：共用 SYSTEM_PROMPT + parse + 形狀正規化 + payload 完整性驗證 + INTENT_JSON_SCHEMA。
- `GeminiChatProvider` 重構為 import 共用模組（保留 Gemini-dialect responseSchema）。
- env `CHAT_PROVIDER` + bare 連線/帳號設定 + server 接線。

### OUT
- opencode daemon 端 bare session 本體（另案，已交付）。
- 每頁 session 重用最佳化（後端目前每輪渲染完整歷史成單一 prompt；session reuse 延後）。
- 前端「網頁重置歸零」（每頁開新 session 屬前端責任；後端無狀態）。
- 修 claude-cli provider 的 tool_choice 行為（opencode Non-Goal，不碰 provider 內部）。

## Non-Goals

- 不為對話設計後端持久化歷史（呼叫端自管）。
- 不改畫圖 cascade（既有 `CascadeImageProvider`）。
- 不改 A2/A5/MOE 等其他 provider。

## Constraints

- **天條 #11 禁 silent fallback**：只在「可用性失敗」（連線/限流/結構化漏接）掉接，不在「有回應但形狀降級」掉接；兩路徑回同形狀。
- **同機信任邊界**：bare session 經 `/run/user/<uid>/opencode/daemon.sock`，不暴露非信任網路。
- **成本**：cascade 需 `GEMINI_API_KEYS`（備援）才啟用（fail-fast）。
- **營運依賴**：cascade 開啟後對話依賴 opencode daemon 在線；daemon 掛則自動回 Gemini。

## What Changes

- 後端新增 3 個 provider 檔（shared / bare / cascade）+ env 欄位 + server `buildChatProvider()`。
- `GeminiChatProvider` 抽出共用 prompt/parse；行為等價。

## Capabilities

### New Capabilities
- 小雞老師對話可借 opencode daemon 的 Claude OAuth 訂閱額度跑，Gemini 自動備援。

### Modified Capabilities
- A1 對話 provider 由單一 Gemini → 可選級聯（env 切換，預設不變）。
