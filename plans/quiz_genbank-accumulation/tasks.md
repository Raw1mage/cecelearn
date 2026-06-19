# Tasks: genbank-accumulation

## 1. 統一存取層（SQLite, bun:sqlite）
- [ ] 1.1 新建 `genbank.ts`：開 `data/genbank.sqlite`、建表（gen_quiz / gen_image / gen_video）、fail-fast 開不了即拋
- [ ] 1.2 schema：共用 provenance（source_model, prompt, created_at, reuse_count）+ 各表分類鍵（quiz: subject/grade/kpId; image: kind/key/path; video: topic/videoId）
- [ ] 1.3 通用 API：insert/dedupe、queryByCategory、bumpReuse、summary、list(分頁)、delete

## 2. 題庫回存 + bank-first/rotation
- [ ] 2.1 quizGenProvider 注入 genbank；機制科 serve 改 bank-first（庫存>門檻直接抽、rotation by reuse_count+random）
- [ ] 2.2 庫存不足才呼 Gemini 補、validate 後 INSERT；tally/name 確定性題也回存（供後台）
- [ ] 2.3 抽中的題 bumpReuse

## 3. 場景插畫入庫
- [ ] 3.1 illustrate 路徑（a1.ts / server）：先查 gen_image(kind=scene, key=正規化詞)，命中回庫圖 URL
- [ ] 3.2 未命中才生、寫檔 `data/scene-illust/`、INSERT gen_image；新增 `GET /api/a1/scene-img/<id>` 靜態路由
- [ ] 3.3 quizIconProvider 併入 gen_image(kind=quiz-icon)（檔案續存，DB 記錄）

## 4. 影片庫遷移
- [ ] 4.1 videoBank 內部換 SQLite（gen_video 表），accumulate/get/size/summary API 不變
- [ ] 4.2 一次性 import 既有 videobank.json → gen_video（保留舊 JSON 當備份）

## 5. 統一後台
- [ ] 5.1 server：`GET /api/genbank/summary`、`GET /api/genbank/list?type=&category=&page=`、`DELETE /api/genbank/:type/:id`
- [ ] 5.2 前端 admin 頁：分類統計 + 列表 + 清理

## 6. 驗證收尾
- [ ] 6.1 backend typecheck EXIT=0
- [ ] 6.2 runtime 測：建表、insert/dedupe、bank-first 抽題、scene 命中、video 遷移
- [ ] 6.3 architecture.md 同步 + event log 收尾
