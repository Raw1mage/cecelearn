# Design: quiz_english-counting-viz

## Context

英文 quiz 出現「有幾枝鉛筆？」(三枝/四枝/五枝)，但畫面無任何鉛筆圖 → 題目無法作答。
RCA: 英文 KP 全 `vizKind:"none"`，AI(Gemini) 自由生出本質需配圖的「數數量」題，
但英文 quiz 鏈路無任何圖像機制（viz 只服務數學 count/groups SVG）。
額外問題：該題用中文出題、中文選項，根本沒在教英文。

## Goals

- 英文「數數量」題能正確顯示「要數的物件」，且**圖裡數量 = 正確答案**（100% 保證）。
- 順手把它變成真正教英文：英文題幹（How many ___s are there?）+ 英文數字選項（three/four/five）。

## Non-Goals

- 數學 count/groups viz（已正確，不動）。
- 英文其他題型（認單字、句型、跟讀）維持現有 AI 生題。
- runtime 生圖（Imagen 複合生圖）：本期不需要 —— 名詞庫 100% emoji 可表達。

## Decisions

- **DD-1 確定性模板生題（AI 不進正確性迴圈）**：英文數數量題不走 Gemini。程式選名詞+emoji、
  選 N、畫 N 個、答案釘死為 N 的英文數字詞。正確性由程式保證，不靠模型自律。
- **DD-2 emoji-first，名詞庫 100% emoji 可表達**：curated NOUN_BANK 每個名詞都有 emoji，
  因此 emoji tile 路徑覆蓋全部題；複合生圖(Imagen 生單元物件→tile N 份)列為未來 fallback，本期不實作（無 fallback 機制新增，符合天條 #11）。
- **DD-3 新 viz kind `tally`**：純粹平鋪 N 個 icon，**不顯示算式、不顯示答案**（與 count viz 會洩 equation/result 相反）。
- **DD-4 tally viz 在作答前顯示**：對數數量題，圖就是題目本身，必須在 submit 前可見；
  count/groups viz 維持批改後（submit 後）顯示。
- **DD-5 vizKind 驅動生題路徑**：curriculum KP `vizKind:"tally"` → quizGenProvider 走 deterministic template path，繞過 Gemini。

## Critical Files

- `backend/data/curriculum.json` — eng-g2-number / eng-g4-how-many 改 `vizKind:"tally"`
- `backend/src/providers/quizFramework.ts` — MathVizSpec/KpInfo 加 tally；NOUN_BANK + NUMBER_WORDS + genTallyItems()；sanitizeViz tally 分支
- `backend/src/providers/quizGenProvider.ts` — 機制科分支：vizKind==='tally' → genTallyItems
- `backend/src/contracts/providers.ts` + `frontend/src/shared/api/client.ts` — A1MathViz 加 'tally' + count 欄位
- `frontend/src/features/a1/components/MathDiagram.tsx` — TallyDiagram（平鋪 N icon、無算式）
- `frontend/src/features/a6/QuizPage.tsx` — tally viz 在 stem 區（作答前）渲染

## Risks

- tally viz 若沿用 count 的 equation 顯示會洩答案 → TallyDiagram 必須不畫算式。
- MAX_ICONS 上限：N 限制在 2–9（plural 自然、3 個 distinct distractor 可選）。
- validate(): templated item type=choice、answer∈choices、source 合法、kpId∈curriculum → 通過。
