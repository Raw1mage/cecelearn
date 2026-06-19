# Design: genbank-accumulation（統一 token 產物累積層）

## Context

cecelearn 透過 token（Gemini / Imagen / YouTube）產生大量內容，但再利用是半套：
- ✅ 影片庫 `videoBank.ts`（topic 分類、dedup、persist JSON）
- ✅ quiz icons `quizIconProvider.ts`（noun 分類、manifest + png）
- ❌ runtime 生題 `quizGenProvider.ts`：每次呼 Gemini 生新題，**用完即丟**
- ❌ A1 場景插畫 `/illustrate`（造句/故事/畫圖）：生成回 dataURI，**不入庫**

使用者要：結構化分類儲存「曾經透過 token 產生的東西」，讓資料能再利用。

## Goals

- 統一累積層（GenBank），四類 token 產物都結構化分類 + provenance + dedup
- 題庫 runtime 回存 + bank-first/rotation serve（最省 token）
- A1 場景插畫入庫，重複關鍵詞直接取庫圖
- 統一後台檢視：累積了什麼、各類幾筆、何時產生、可清理

## Non-Goals

- 不做人工審核 UI（reviewed 旗標保留，審核流程後話）
- 不做跨裝置同步 / 雲端備份
- 不改既有出題正確性契約（viz.count tile、答案釘死不變）

## Decisions

- **DD-1** 儲存用 **SQLite（`bun:sqlite` 內建）**。production 跑 `bun run src/server.ts`（webctl.sh:66），零 native dep。DB 落 `data/genbank.sqlite`。
- **DD-2** 單一 DB、多表分類，而非四個 DB。表：`gen_quiz`(題)、`gen_image`(圖：quiz-icon + scene 兩 kind)、`gen_video`(影片連結)。共用 provenance 欄（`source_model`、`prompt`、`created_at`、`reuse_count`）。
- **DD-3** 圖的 bytes **不入 DB**，續存檔案系統（`data/quiz-icons/`、新增 `data/scene-illust/`），DB 只存路徑 + 分類鍵 + provenance。理由：SQLite 存大 blob 不利、現有檔案模式已驗證、HTTP 靜態路由已有。
- **DD-4** 題庫 serve = **bank-first + rotation**：先查庫（依 subject/grade/kpId 抽、`reuse_count` 升冪+隨機），庫存量 < 門檻才呼 Gemini 補、validate 後 INSERT、bump `reuse_count`。tally/name 確定性題仍即時生（本就零 token），但也回存供後台檢視。
- **DD-5** 場景插畫 key = 正規化關鍵詞（targetWord 優先，無則 context hash）。`/illustrate` 先查 `gen_image(kind=scene)`，命中回庫圖 URL（新增 `imageUrl` 不再回 dataURI；或相容兩者），未命中才生、入庫。
- **DD-6** 影片庫 `videoBank.ts` 既有 JSON **遷移進 `gen_video` 表**（一次性 import），保留 `accumulate`/`get`/`summary` API 介面不變（內部換 SQLite）。
- **DD-7** 統一後台：新增 `GET /api/genbank/summary`（各表分類統計）、`GET /api/genbank/list?type=&category=`（分頁列表）、`DELETE /api/genbank/:type/:id`（清理）。前端加一個簡單管理頁。
- **DD-8** fail-fast：DB 開不了 → server 啟動報錯（不 silent 退回無庫模式，天條 #11）。但個別 serve 查庫失敗可 log + 走生成路徑（degraded 但功能在）。

## Risks

- **DB 與既有 JSON 雙寫期**：videoBank 遷移時需確保不丟資料 → 一次性 import + 保留舊 JSON 當備份。
- **scene 插畫 key 碰撞**：不同 context 正規化成同 key → 用 targetWord + context 短 hash 複合鍵降低。
- **題庫 rotation 退化**：若某 KP 庫存少，rotation 仍可能重複 → 庫存 < N 時混入新生。

## Critical Files

- `webapp/backend/src/providers/genbank.ts`（新）— SQLite 統一存取層
- `webapp/backend/src/providers/quizGenProvider.ts` — 接 bank-first/rotation + 回存
- `webapp/backend/src/providers/quizIconProvider.ts` — 改用 genbank 記錄（檔案續存）
- `webapp/backend/src/providers/videoBank.ts` — 內部換 SQLite，API 不變
- `webapp/backend/src/modules/a1.ts` + illustrate 路徑 — scene 插畫入庫
- `webapp/backend/src/server.ts` — genbank 路由 + 後台 API
- `webapp/frontend/src/features/admin/`（新）— 後台檢視頁

## Code anchors

- webctl.sh:66 — production `bun run src/server.ts`（決定 bun:sqlite 可用）
- videoBank.ts:95 — `accumulate` 既有 dedup 模式（遷移參考）
- quizGenProvider.ts:104 — 機制科 generate 入口（接 bank-first）
- quizIconProvider.ts — manifest 模式（併入 gen_image）
