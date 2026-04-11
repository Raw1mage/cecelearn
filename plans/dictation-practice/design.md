# Design

## Context

- cecelearn 已有 A1（查字詞）、A2（成語練習）、A3（四則運算）三個功能
- A1 已驗證 HanziWriter quiz 模式（觸控/滑鼠描字）
- A2 已驗證出題引擎模式（idiomQuizEngine：載入 JSON → 算法出題）
- vocabulary.json 已就緒（816 課、2,979 字、按出版社/年級/課次分類）
- 教育部辭典即時爬取已就緒（MoeProvider：造詞 + 注音）

## Goals / Non-Goals

**Goals:**

- 複用現有基礎設施（HanziWriter、MoeProvider、ScoreContext、celebrate）
- 四種題型模組化，可獨立開發和測試
- 出題設定 UI 清晰直覺，家長可快速操作
- 手寫練習在行動裝置觸控流暢

**Non-Goals:**

- 不做自訂 canvas 手寫辨識（完全依賴 HanziWriter）
- 不做離線快取（每次出題即時查詢）
- 不做即時多人對戰

## Decisions

### DD-1: 題型模組化架構

每種題型實作為獨立的 React 元件，共用同一個 QuizSession 容器。容器管理題號導航和計分，題型元件只負責渲染和回報答題結果。

理由：四種題型的互動模式完全不同（選擇 vs 手寫 vs 語音），但外圍流程（設定→答題→結果→回顧）相同。

### DD-2: 後端出題 vs 前端出題

選擇題（題型 A/B）需要例句，必須由後端爬取教育部辭典。描寫和聽寫（題型 C/D）只需要字和注音，理論上前端可以直接用 vocabulary.json。但為了統一架構，全部由後端出題，前端只做渲染。

理由：統一資料流，避免前端載入 382KB 的 vocabulary.json。

### DD-3: TTS 實作方式

使用瀏覽器原生 speechSynthesis API，語言設為 zh-TW。注音用文字顯示不用 TTS 唸（注音的 TTS 品質不穩定）。

理由：免費、離線可用、無需 API key。缺點是各平台語音品質不一，但對學習用途足夠。

### DD-4: 聽寫多字串接

聽寫一個詞語（如「學校」）時，依序展示兩個 HanziWriter quiz 框。第一個字完成後，自動銷毀並建立下一個字的 HanziWriter instance。不做並排多框。

理由：行動裝置螢幕小，並排放兩個 200px 框會擠壓。逐字展示更聚焦。

### DD-5: 例句來源策略

1. 先嘗試從 vocabulary.json 的詞條解釋中提取含目標字的例句
2. 不夠則即時爬取教育部辭典（MoeProvider.fetchWords）
3. 仍不夠則用 Gemini 生成例句
4. 干擾選項：同年級其他生字（優先同音字/形近字）

理由：分層 fallback 確保任何字都能出題，同時減少外部 API 依賴。

### DD-6: Combo 狀態管理

Combo 狀態（連擊數、當前倍率）由 A5Page 的 local state 管理，不放入 ScoreContext。因為 combo 是單次練習的暫態，不跨頁面保留。

ScoreContext 的 addScore 在答題時呼叫，傳入已乘以 combo 倍率的分數。

## Data / State / Control Flow

### 出題資料流

```
使用者設定（範圍/題數/題型）
  → POST /api/a5/quiz
  → vocabQuizEngine.generate()
    → 篩選 vocabulary.json
    → 選取生字
    → [題型 A/B] 爬取教育部辭典例句
    → 組裝題目 JSON
  → 回傳 A5QuizResponse
  → 前端渲染
```

### A5QuizItem 型別設計

```typescript
// 後端回傳
type A5QuizItem = {
  id: string
  character: string      // 目標字
  bopomofo: string       // 注音
  word?: string          // 詞語（聽寫/描寫用）
  wordBopomofo?: string  // 詞語注音（聽寫用）
  prompt?: string        // 挖空例句（選擇/手寫用）
  options?: string[]     // 4 選項（選擇題用）
  correctAnswer?: number // 正確選項 index（選擇題用）
  explanation?: string   // 解說
}

// 前端答題狀態
type A5AnswerState = {
  completed: boolean
  correct: boolean
  hinted: boolean      // 手寫時是否用了提示
  score: number        // 本題得分（含 combo 倍率）
}
```

### 前端狀態機

```
setup ──[開始練習]──→ loading ──[API回傳]──→ quiz ──[答完]──→ result ──→ review
  ↑                                                              │
  └──────────────────────[再來一次]──────────────────────────────┘
```

## Risks / Trade-offs

- **TTS 語音品質**：不同平台差異大，Android Chrome 的中文 TTS 可能不自然 → 接受，提供「重聽」按鈕
- **HanziWriter 罕見字支援**：極少數字可能不在 HanziWriter 資料庫 → try-catch 跳過，顯示提示
- **教育部辭典爬取延遲**：例句題第一次出題可能需要 2-3 秒 → 顯示 loading 提示
- **Gemini API 配額**：free tier 限制每分鐘 5 次 → 例句優先用辭典爬取，Gemini 只作最後 fallback
- **vocabulary.json 學年更新**：資料綁定 114 學年度 → 每學年需重跑爬蟲更新

## Critical Files

- `webapp/backend/src/providers/vocabQuizEngine.ts`
- `webapp/backend/src/contracts/providers.ts`
- `webapp/backend/src/server.ts`
- `webapp/backend/data/vocabulary.json`
- `webapp/frontend/src/features/a5/A5Page.tsx`
- `webapp/frontend/src/features/a5/QuizSetup.tsx`
- `webapp/frontend/src/features/a5/modes/TraceMode.tsx`
- `webapp/frontend/src/features/a5/modes/DictationMode.tsx`
- `webapp/frontend/src/features/a5/modes/ChoiceMode.tsx`
- `webapp/frontend/src/features/a5/modes/HandwriteMode.tsx`
- `webapp/frontend/src/features/a5/QuizResult.tsx`
- `webapp/frontend/src/features/a5/QuizReview.tsx`
- `webapp/frontend/src/features/a1/hanziWriterAdapter.ts` — 複用
- `webapp/frontend/src/shared/api/client.ts`
- `webapp/frontend/src/shared/celebrate.ts` — 複用
- `webapp/frontend/src/shared/ScoreContext.tsx` — 複用
