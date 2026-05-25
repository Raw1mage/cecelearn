# Event - 2026-05-17 - Web service autostart investigation

## 需求
- 排查 cecelearn web service 為什麼不能自動啟動。

## 範圍(IN/OUT)
### IN
- 檢查既有架構文件與 runtime 入口。
- 檢查 Docker compose、`webctl.sh`、systemd、user systemd、crontab 與本機 HTTP 狀態。
- 提供 root cause 與修復建議。

### OUT
- 不直接啟動、停止或重啟服務。
- 不建立 systemd unit 或修改 Docker compose，除非使用者後續批准。

## 任務清單
- [x] 讀取 `specs/architecture.md` 與既有 event logs。
- [x] 檢查 `BUILD/compose/docker-compose.yml`、`BUILD/README.md`、`webctl.sh`。
- [x] 蒐集 Docker compose、systemd、user systemd、crontab 與 `7014` HTTP 狀態。
- [x] 定位自動啟動失敗原因。
- [x] 依使用者指示採簡略做法，為 compose services 加入 `restart: unless-stopped`。

## Debug checkpoints
- Checkpoint 1: `specs/architecture.md` 與 `BUILD/README.md` 確認正式 runtime 入口是 Docker compose stack，gateway 對外 port 為 `7014`。
- Checkpoint 2: `BUILD/compose/docker-compose.yml` 未設定任何 `restart` policy，也未包含 host boot integration。
- Checkpoint 3: `docker compose -f BUILD/compose/docker-compose.yml ps --all` 沒有列出本專案容器；`docker ps -a --filter name=cecelearn` 也沒有列出容器。
- Checkpoint 4: `systemctl list-unit-files 'cecelearn*'` 與 `systemctl --user list-unit-files 'cecelearn*'` 都沒有已安裝 unit。
- Checkpoint 5: `crontab -l` 沒有 cecelearn 啟動項；`curl -I http://127.0.0.1:7014/` 無法連線。
- Checkpoint 6: `./webctl.sh status` 只顯示 local backend process 正在 `3014`，frontend stopped，且 `webctl.sh` 本身不是開機自動啟動機制，也不管理 gateway `7014`。

## Key decisions
- 目前先不修改 runtime 檔案，避免未經批准新增開機啟動行為。
- 建議修復方向應選擇單一權威啟動機制：systemd 管理 Docker compose，或 compose 服務加 restart policy 並由 Docker daemon 管理。
- 使用者批准採簡略做法後，直接在 `frontend`、`backend`、`gateway` 三個 compose service 設定 `restart: unless-stopped`。

## Verification
- Root cause: 目前 repo 只有手動啟動定義，沒有可在開機時啟動 cecelearn web service 的 boot manager；compose 也沒有 restart policy，因此主機/daemon 重啟後不會自動恢復 `7014` gateway。
- Fix applied: `BUILD/compose/docker-compose.yml` 已為三個服務加入 `restart: unless-stopped`；這會在容器已建立且 Docker daemon 開機啟動時自動恢復容器。
- Architecture Sync: Verified (No doc changes)。本次是 runtime 啟動配置排查，未改變 `webapp` / `BUILD` 模組邊界或資料流。

## Remaining
- 需要至少執行一次 `docker compose -f BUILD/compose/docker-compose.yml up -d --build` 建立容器，且主機需啟用 Docker daemon 開機自啟。
