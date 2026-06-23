# Proposal: a7_idiom_crossword

## Why

- cecelearn 現有成語模組（a2）只有「選擇題填空」單一玩法，互動性與遊戲感不足。
- 使用者提供一張「成語交叉填字遊戲」參考圖（水墨國風、十字交叉成語盤、底部備選字塊、金幣/提示經濟、關卡制），希望基於 cecelearn 打造遊戲模組，把學習包裝成闖關遊戲，提升 6–9 歲小朋友的學習動機。
- 後端已有 `idioms.json`（1662 條成語＋例句），是天然的關卡素材庫，足以演算法生成大量交叉填字盤。

## Original Requirement Wording (Baseline)

- 「開始基於 cecelearn 打造遊戲模組，融入成語教學題目」（附成語交叉填字遊戲截圖）

## Requirement Revision History

- 2026-06-21: initial draft created via plan-init.ts
- 2026-06-21: 經 5 題決策收斂範圍（模組落點、關卡生成、金幣經濟、教學深度、視覺風格）

## Effective Requirement Description

1. 新建獨立遊戲模組 a7「成語填字闖關」，與既有 a2（成語選擇題）並存、互不干擾。
2. 玩法為「成語交叉填字」：畫面呈現一個十字交叉的成語盤（多條成語共用交叉字），部分格子留空，底部提供備選字塊，小朋友把字填入正確空格完成所有成語。
3. 關卡由演算法自動從 `idioms.json` 生成：挑出有共用字的成語、排出可交叉的盤面、無限關卡。
4. 提供「簡單提示」：免費提示（揭示一個字／高亮一格），第一版不做完整金幣經濟（買提示/答案的錢包系統）。
5. 填對一條成語後，融入成語教學：顯示該成語的釋義＋例句，並可用既有 TTS（`shared/speech/tts`）朗讀。
6. 視覺沿用 cecelearn 現有設計系統（Panel/Button/主題變數），與其他模組一致。
7. 過關有正向回饋（沿用 `celebrate()` 灑花）並可累計既有 ScoreContext 分數。

## Scope

### IN

- 前端新模組 `webapp/frontend/src/features/a7/`（遊戲頁＋交叉盤渲染＋填字互動＋教學揭曉）。
- 後端交叉盤生成 provider（`webapp/backend/src/providers/`）＋ module（`webapp/backend/src/modules/a7.ts`）＋ API route（`/api/a7/*`）。
- 契約型別集中於 `webapp/backend/src/contracts/providers.ts`（A7CrosswordPuzzle 等）＋前端 `shared/api/client.ts` 對應型別與呼叫。
- 路由 `App.tsx` 掛 `/a7`。
- 交叉排盤演算法（從 idioms.json 選成語、找共用字、排出十字盤、生成空格與備選字）。
- 填字互動：點選備選字 → 點空格填入（或拖放）、可清除、即時校驗成語完成。
- 簡單提示：免費提示（揭一字／高亮目標格）。
- 教學揭曉：成語完成後顯示釋義＋例句＋TTS 朗讀。
- 過關回饋（celebrate + 分數）。

### OUT

- 完整金幣經濟（金幣餘額、賺幣、花幣買提示 60 金／答案 30 金的錢包系統）。
- 水墨國風新視覺樣式（封面、宣紙底、毛筆字體等）。
- 手工設計關卡 JSON（採演算法生成）。
- 從對話流（a1）由小雞老師語音觸發進入遊戲（後續可加 intent）。

## Non-Goals

- 不取代或改動既有 a2 成語選擇題模組。
- 不做多人對戰、排行榜、雲端存檔。
- 不引入新的後端常駐服務或資料庫（沿用既有檔案型資料）。

## Constraints

- 技術：前端 Vite+React+TS、後端 Bun+node:http 零框架；契約集中 `contracts/providers.ts`；遵守既有模組分層慣例（features/aN、providers/、modules/）。
- 成本：關卡生成純本地演算法，零 LLM／零後端 API 成本（對齊 cecelearn「零後端成本」原則）。
- 資料：成語素材以 `idioms.json` 為唯一來源（含釋義/例句；若釋義缺，由例句兜底）。
- 目標族群：6–9 歲，UI 需大字、可點、可朗讀、即時正向回饋。
- 不 silent fallback：演算法生不出合法盤面要顯式回報，不偷塞錯誤盤。

## What Changes

- 新增 a7 前端頁、後端 provider/module/route、契約型別、路由掛載。
- `idioms.json` 可能需補釋義欄位（目前結構為 `{idiom, examples[]}`，無釋義）；釋義來源待 design 階段確認（教育部辭典 moeProvider 或例句兜底）。
- README/CHANGELOG 增列 a7 模組（收尾時）。

## Capabilities

### New Capabilities

- 成語交叉填字盤生成（後端演算法）：從成語庫排出可交叉的十字盤＋空格＋備選字。
- 填字遊戲互動（前端）：選字、填格、校驗、提示、過關。
- 成語教學揭曉：完成成語後的釋義＋例句＋朗讀。

### Modified Capabilities

- ScoreContext 分數：新增 a7 過關加分來源（沿用既有 addScore）。

## Impact

- 影響檔案：新增 `features/a7/*`、`providers/idiomCrosswordProvider.ts`、`modules/a7.ts`、`contracts/providers.ts`（追加型別）、`shared/api/client.ts`（追加呼叫）、`App.tsx`（路由）、`server.ts`（route 註冊）。
- 可能調整 `idioms.json`（補釋義）。
- 對既有 a1–a6 模組無破壞性變更。
