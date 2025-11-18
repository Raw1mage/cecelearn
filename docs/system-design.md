# 系統設計稿

## 架構概覽
- Web 前端：React + TypeScript（建議 Next.js）作為單頁/PWA，提供家長與孩子分離的 UI，支援觸控手寫板（Canvas/Ink API）。
- API 服務：Node.js（NestJS/Express）或 Python（FastAPI）皆可；此稿以 TypeScript + NestJS 為預設，提供 REST + WebSocket，負責題庫、練習流程、評分調度與權限。
- AI/TTS 子服務：可插拔 TTS/STT/手寫比對管線，優先本地（Piper/Coqui TTS、Whisper.cpp 或自建 ASR、PaddleOCR/HWR）；雲端備援以 Google (Gemini / Speech / TTS) 為首選。透過 worker 服務非同步生成音檔與評分。
- 資料層：PostgreSQL（題庫、帳號、練習記錄）、Redis（session、節流、任務隊列）、物件儲存（MinIO 或雲端）用於音訊/墨跡檔案，以及掛載 volume 的配置與備份目錄。
- 部署：docker-compose 多容器；所有配置與資料掛載 volume，方便備份與持久化。

## 模組拆分
- 認證與角色：家長/孩子/管理員，JWT（短期）+ refresh token；家長面板可設定孩子專用 PIN。
- 題庫管理：CRUD、CSV 匯入/匯出、版本控制（word_list_revision），標籤分類。
- 練習引擎：
  - 題組生成：依家長設定抽取字/詞，混題序，建立 practice_set + practice_items。
  - 朗讀準備：TTS 任務（快取 audio_cache），支持多語速與重播。
  - 作答流程：WebSocket 推播題目狀態，手寫板上傳墨跡（SVG/JSON/PNG），可選鍵盤輸入。
  - 評分：比對文字/字形（未確認字形時保留人工/半自動核對）；錯題重練列表。
- 報表：查詢練習結果，統計正確率、耗時、錯題熱度，匯出 JSON/CSV。
- 系統設定：TTS/音訊參數、安全/家長鎖、備份/還原、日誌等。

## 資料與存儲
- PostgreSQL：user、word_entry、word_list、word_list_revision、practice_set、practice_item、attempt、audio_cache、config。
- MinIO/物件儲存：音訊檔（mp3/wav）、手寫墨跡/截圖、匯出檔案；透過 bucket 區隔環境。
- Volume 持久化：
  - `./volumes/db-data`：PostgreSQL 資料。
  - `./volumes/redis-data`：Redis。
  - `./volumes/storage`：音訊與墨跡（若使用 MinIO 則對應存放）。
  - `./config`：環境設定 `.env`、TTS/安全參數、家長策略。
  - `./logs`：應用與反向代理日誌。
  - `./config/keys`：家長自帶 API key 加密後存放（可選）。

## 介面與協定
- API：REST（題庫、練習 CRUD、報表），WebSocket（練習進度、音訊生成更新）。
- 音訊：預生成或請求時生成；URL 簽名存取（短期連結），或經 API 代理。
- 手寫資料：Canvas 產生的向量/點陣資料上傳，後端存檔並封裝為比對輸入。

## 安全、隱私與可用性
- HTTPS + 反向代理（Nginx/Traefik），CORS 鎖定來源。
- Rate limit、防重放（token 驗證）、最少化孩子可見資料。
- PWA +快取策略，弱網路時允許「下載題組後離線練習，稍後同步結果」。
- 可回收/備份：volume 內含設定與資料，支持 cron 備份。
- BYOK 安全：API key 只在後端保存並加密；前端僅顯示「已設定」狀態，需家長 PIN 才可重設；提供「連線測試」按鈕，避免日誌外洩。

## AI/模型策略
- 本地優先：GPU/CPU 版 Whisper.cpp（ASR）、Piper/Coqui (TTS)、PaddleOCR/HWR（手寫）；單機可離線運作。
- 雲端備援：Google Gemini (造句/講解)、Google Speech (ASR)、Google TTS；可由家長在設定頁填入 API key 以啟用。
- LLM 抽象：`LLMProvider` 介面，支援本地模型 (e.g. Llama-3.x, Mistral) 與 Gemini；可選模型名、溫度、max tokens。
- 任務隔離：生成題目、ASR、TTS 使用獨立工作隊列，避免互相阻塞；限流/配額守門，保護家長自帶 key。

## docker-compose 範例（草案）
```yaml
version: "3.9"
services:
  web:
    build: ./web
    env_file: ./config/web.env
    depends_on: [api]
  api:
    build: ./api
    env_file: ./config/api.env
    environment:
      DATABASE_URL: postgres://cece:pass@db:5432/cecelearn
      REDIS_URL: redis://redis:6379
      OBJECT_STORAGE: http://minio:9000
    volumes:
      - ./logs/api:/var/log/app
      - ./config:/app/config:ro
    depends_on: [db, redis]
  worker:
    build: ./worker
    env_file: ./config/api.env
    volumes:
      - ./volumes/storage:/app/storage
      - ./config:/app/config:ro
    depends_on: [api, redis]
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: cece
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: cecelearn
    volumes:
      - ./volumes/db-data:/var/lib/postgresql/data
  redis:
    image: redis:7
    volumes:
      - ./volumes/redis-data:/data
  minio:
    image: minio/minio
    command: server /data
    environment:
      MINIO_ROOT_USER: minio
      MINIO_ROOT_PASSWORD: minio123
    volumes:
      - ./volumes/storage:/data
  proxy:
    image: traefik:v3
    command:
      - "--providers.docker=true"
      - "--entrypoints.websecure.address=:443"
    ports: ["80:80", "443:443"]
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./config/traefik:/etc/traefik
      - ./logs/traefik:/var/log/traefik
```

## 測試與品質
- 單元測試：題庫、設定、API。
- 端對端：練習流程（播放、作答、提交、評分）。
- 性能：TTS 生成延遲、播放流暢度；資料庫索引與快取。
- 監控：基本存活檢測 + 應用日誌匯集（可加 OpenTelemetry）。
