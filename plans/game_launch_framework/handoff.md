# Handoff: game_launch_framework

## Execution Contract

執行者要把 cecelearn 的「語音啟動遊戲」從逐遊戲 hardcode 收斂成單一 game registry 驅動，並把 a7 成語填字接進此機制（改 overlay + start_crossword intent）。既有三遊戲（dictation/idiom/quiz）遷移後行為必須等價。

## Required Reads

- `proposal.md` — 範圍、3 項使用者決策、IN/OUT
- `spec.md` — 7 條行為需求 + Acceptance Checks
- `design.md` — registry 契約 taxonomy、DD-1..10、INV-1..5、Critical Files、Trade-offs
- `data-schema.json` — GameEntry/LaunchIntent/OverlayKind/GameChip 型別與衍生器
- 現有程式（改造基準）：
  - `webapp/backend/src/contracts/providers.ts`（A1Intent union）
  - `webapp/backend/src/providers/a1ChatShared.ts`（prompt + INTENT_SCHEMA enum）
  - `webapp/backend/src/providers/opencodeBareChatProvider.ts` / `geminiChatProvider.ts`（schema enum）
  - `webapp/frontend/src/features/a1/hooks/useConversation.ts`（overlayForIntent / QuizMode / activeOverlay）
  - `webapp/frontend/src/features/a1/A1Page.tsx`（overlay render switch + quick-chips）
  - `webapp/frontend/src/features/a1/components/ConversationView.tsx`（intent 中文 label）
  - `webapp/frontend/src/features/a7/A7Page.tsx`（待加 onClose/onComplete）
  - `webapp/frontend/src/features/a2/A2Page.tsx` / `a5`（overlay 模式 props 的既有範例 R1）

## Stop Gates In Force

- **DD-1 落點驗證（架構 gate）**：Task 1.3 必須先確認前後端 tsconfig 能否跨頂層 import `webapp/shared/`。若不行，採 fallback（後端為主、前端鏡像型別）前**先報告**，不要 silent 改走 `/api/a1/games` 執行期下發（那是最終手段）。
- **迴歸 gate**：既有三遊戲行為若無法等價，停下報告，不要為了套 registry 而改變既有玩法。
- **不 silent fallback（天條 #11）**：overlayForIntent 查無回 null；enum 不一致視為 bug 必修，不可用「補一個預設遊戲」掩蓋。

## Execution-Ready Checklist

- [ ] 已讀 design.md，理解 registry 為純資料、overlay 元件在前端第二張表（DD-2/DD-3）
- [ ] 已確認 base intent 不進 registry（DD-7），只收 start_* 啟動 intent
- [ ] 兩 provider enum 同源（INV-1）的實作方式已想清楚
- [ ] a7 overlay 模式對齊 A2Page/A5Page 既有 onClose/onComplete 慣例（DD-4）
- [ ] 驗證計畫：前後端 tsc + webctl restart 手動驗收 + 移除一筆 entry 驗 INV-5

## Validation Plan

1. 前後端 `bun node_modules/.bin/tsc --noEmit` EXIT=0
2. `./webctl.sh restart` 後手動驗收 spec.md 全 Acceptance Checks
3. 語音開四遊戲（含新 start_crossword）、unclear 不開、a7 ✕ 關閉 + 過關回對話 + 麥克風恢復
4. 入口鈕數 == registry entry 數；移除一筆 entry → intent/鈕/overlay 同步消失（INV-5），驗畢還原
5. 迴歸：dictation/idiom/quiz 對相同輸入分類與開啟 overlay 與改造前一致
