# Handoff

## Execution Contract

- Build agent must read implementation-spec.md first
- Build agent must read proposal.md / spec.md / design.md / tasks.md before coding
- Materialize tasks.md into runtime todos before coding
- 每完成一個 Phase 做一次 commit，不要等全部完成

## Required Reads

- implementation-spec.md — 執行合約、scope、validation
- proposal.md — 為什麼做、改了什麼
- spec.md — 行為規格、GIVEN/WHEN/THEN 場景
- design.md — 架構決策（DD-1~DD-6）、資料流、型別設計
- tasks.md — 執行清單（5 個 Phase、30 個 task）

## Current State

- vocabulary.json 已就緒（816 課、2,979 字）
- idioms.json 已就緒（1,662 成語、11,258 例句）
- HanziWriter quiz 已在 A1 驗證（hanziWriterAdapter.ts）
- ScoreContext + celebrate + confetti 已就緒
- MoeProvider（教育部辭典即時爬取）已就緒
- A2 的出題引擎（idiomQuizEngine）可作為參考實作
- plan.md（功能計畫）已存在，本 handoff 是實作層補充

## Stop Gates In Force

- HanziWriter quiz 在行動裝置觸控不正常 → 回報，考慮替代手寫方案
- speechSynthesis 在目標平台不可用 → 聽寫題型延後到後續 Phase
- 教育部辭典改版導致爬取失敗 → 例句題型改用 Gemini fallback（已有 pattern）

## Build Entry Recommendation

- 從 Phase 1（後端出題引擎）開始。這是純後端工作，不需觸碰前端
- Phase 1 完成後可用 curl 驗證，確保出題邏輯正確再做前端
- Phase 2 是最小可用前端（描寫練習），完成後即可給使用者試用
- Phase 3-5 可按需求優先順序調整

## Key Patterns to Follow

### 後端
- 參考 `idiomQuizEngine.ts` 的結構：constructor 載入 JSON、generate() 出題、shuffle/pickRandom 工具函式
- 路由參考 `server.ts` 的 `POST /api/a2/quiz` pattern
- 型別定義參考 `contracts/providers.ts` 的 A2 型別

### 前端
- 參考 `A2Page.tsx` 的狀態機 pattern：setup→loading→quiz→result→review
- 題型元件接口：`{ item: A5QuizItem, onComplete: (result: A5AnswerState) => void }`
- HanziWriter 使用參考 `hanziWriterAdapter.ts`（已有 quiz/animateCharacter）
- 計分：`useScore().addScore(points)`
- 煙火：`celebrate()`

### CSS
- 沿用 `feature-page`、`ui-panel`、`ui-button`、`toolbar-row` 等共用 class
- A5 專屬 class 用 `a5-` 前綴

## Execution-Ready Checklist

- [x] Implementation spec is complete
- [x] Companion artifacts are aligned
- [x] Validation plan is explicit（每 Phase 有 curl/瀏覽器驗證步驟）
- [x] Runtime todo seed is present in tasks.md（30 個 task）
- [x] 資料來源（vocabulary.json）已就緒
- [x] 核心依賴（HanziWriter、speechSynthesis、MoeProvider）已驗證
