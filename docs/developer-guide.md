# Developer Guide — 平台與 AI 支援環境

本指南說明在 GTX 3090 環境準備本地 AI 能力（Whisper、TTS、手寫辨識）與 docker 基礎設置，便於離線優先、雲端補充（Google Gemini/Speech/TTS）。

## 基本工具與依賴
- OS：Linux（Ubuntu 20.04+/22.04+ 建議）。
- Driver/CUDA：安裝對應 3090 的 NVIDIA 驅動與 CUDA（11.8/12.x 均可）；`nvidia-smi` 可正常運作。
- Docker：Docker Engine + docker-compose v2。
- GPU 支援容器：安裝 NVIDIA Container Toolkit，確認 `docker run --rm --gpus all nvidia/cuda:12.2.0-base-ubuntu22.04 nvidia-smi` 正常。
- Node 18+/npm（或 pnpm/yarn）；Python 3.10+（若需本地推理腳本）；Git。

## 目錄與 volume 規劃（相對專案根目錄）
- `./config/`：環境變數與金鑰（不進版控）；內含 `web.env`, `api.env`, `worker.env`，可選 `keys/` 加密後存放 BYOK。
- `./volumes/db-data`：PostgreSQL 資料。
- `./volumes/redis-data`：Redis 資料。
- `./volumes/storage`：音訊、墨跡、匯出檔；亦可作為 MinIO 後端。
- `./logs/`：應用/反向代理日誌。

## AI 元件準備（本地優先）
### 語音辨識（ASR）
- 選項 A：whisper.cpp + ggml/gguf 模型（建議 large-v3 Q5_0 量化）；優點：低部署成本，可 CPU/GPU。
  - 編譯：`git clone https://github.com/ggerganov/whisper.cpp`；`make -j`；`./models` 放置模型檔。
  - 測試：`./main -m models/ggml-large-v3-q5_0.bin -f samples/jfk.wav -l zh`.
- 選項 B：PyTorch 版 Whisper（openai/whisper 或 CTranslate2 推理）；適合用到 GPU FP16。
- 雲端備援：Google Speech-to-Text（需在設定頁填入 API key）。

### 語音合成（TTS）
- 本地：Piper 或 Coqui TTS；下載中文/英語語音模型，放入 `./volumes/storage/tts-models`。
- 雲端備援：Google TTS（AI Studio）；配置於 `api.env` 或家長設定頁 BYOK。

### 手寫辨識（HWR）
- 本地：PaddleOCR/PaddleHWR（中英混合可用）；部署為獨立服務或 worker。
- 簡易比對：前端軌跡+後端模板/筆畫比對作為低成本 fallback。

### LLM（造句/講解）
- 預設：本地模型（如 Llama-3.x 8B/14B，或 Mistral）透過 `LLMProvider` 抽象。
- 雲端：Google Gemini 1.5 (flash/pro)；家長設定頁可輸入 API key。封裝 REST 客戶端，支持模型名/溫度/max tokens。

## docker-compose 基本骨架（與 system-design 相符）
> 可在專案根建立 `docker-compose.yml`，並確保 `runtime: nvidia` 或 `deploy.resources.reservations.devices` 以啟用 GPU（依 Docker 版本而定）。

```yaml
services:
  api:
    build: ./api
    env_file: ./config/api.env
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              capabilities: [gpu]
    volumes:
      - ./config:/app/config:ro
      - ./volumes/storage:/app/storage
      - ./logs/api:/var/log/app
    depends_on: [db, redis]
  worker:
    build: ./worker
    env_file: ./config/worker.env
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              capabilities: [gpu]
    volumes:
      - ./config:/app/config:ro
      - ./volumes/storage:/app/storage
    depends_on: [api, redis]
  web:
    build: ./web
    env_file: ./config/web.env
    depends_on: [api]
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
```

## 環境變數建議（範例）
- `api.env`
  - `DATABASE_URL=postgres://cece:pass@db:5432/cecelearn`
  - `REDIS_URL=redis://redis:6379`
  - `OBJECT_STORAGE_ENDPOINT=http://minio:9000`
  - `ASR_PROVIDER=whisper_cpp`（可選 `google`）
  - `TTS_PROVIDER=piper`（可選 `google`）
  - `LLM_PROVIDER=local`（可選 `gemini`）
  - `GOOGLE_API_KEY=`（可空；若填則啟用雲端）
  - `GEMINI_MODEL=gemini-1.5-flash`（如啟用）
- `web.env`：API base URL、PWA 設定、娃娃模式鎖。
- `worker.env`：與 `api.env` 類似，加入隊列設定、模型路徑。

## 開發流程建議
1) 安裝驅動/CUDA、Docker、NVIDIA Toolkit，驗證 GPU 容器可運行。  
2) 下載/量化 Whisper 模型、Piper/Coqui TTS 模型、PaddleOCR 模型至 `./volumes/storage`。  
3) 建立 `config/*.env`，先以本地 provider（whisper_cpp/piper/local LLM）運作；如需 Google 功能再填 key。  
4) 起動 `docker-compose up -d db redis minio` 做基礎服務，再啟 `api/worker/web`。  
5) 開發迭代：API/worker 使用本地掛載卷載入模型；更新程式後重建對應服務。  
6) 測試：撥放/轉寫小音檔驗證 ASR/TTS，手寫板送樣本驗證 HWR，造句 API 測試 LLMProvider 切換本地/雲端。  
7) 備份：定期備份 `./volumes/db-data`, `./volumes/storage`, `./config`（注意密鑰加密）。  

## FAQ/常見問題
- GPU 未被使用？檢查 Docker runtime 是否為 `nvidia`、容器內 `nvidia-smi` 是否可用，並確認 `LD_LIBRARY_PATH` 與 CUDA 版本相容。  
- Whisper 速度不足？改用 gguf 量化或 CTranslate2、減少 beam size、分段處理長音檔。  
- 雲端 Key 保護？Key 僅存後端加密檔（在 `config/keys` volume），不寫日誌，前端不回顯。  
