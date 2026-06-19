# cecelearn・小雞老師

給 6–9 歲小朋友的中文 / 英文 / 數學 AI 家教 web app。核心是「**小雞老師**」——一位語音為主、會被唸出來、親切耐心的台灣小學老師。小朋友用說的或打的，就能查字、造詞、造句、聽故事、算數學、學英文，還能**把考卷題目唸給它聽、拍照給它看**，由小家教一步步講解並圖解。

> 對應的規格在 [`specs/a1_dialogue_tutor/`](specs/a1_dialogue_tutor/)；變更歷史見 [CHANGELOG.md](CHANGELOG.md)。

---

## 功能總覽

小雞老師每一輪會判斷小朋友的**意圖**，產生對應內容（封閉意圖集合 + 兜底）：

| 能力 | 觸發例 | 呈現 |
|------|--------|------|
| 查字 / 造詞 | 「蘋果的蘋」「花可以組什麼詞」 | 注音 + 詞卡 + 筆順（HanziWriter） |
| 造句 | 「用蘋果造句」「造三個句子」 | 句子卡（純中文，禁中英夾雜） |
| 說故事 | 「說一個小兔子的故事」 | 故事段落 + 情境插圖 |
| 畫圖 | 「畫一隻貓」 | AI 情境插圖（Imagen 4） |
| 算術 | 「3 乘 7 怎麼算」 | 直式動畫教學 |
| **小家教講解** | 「This is a cat 是什麼意思」「小明有 5 顆糖給弟弟 2 顆…」 | 題目→步驟→答案；英文題附跟讀、數學題附 SVG 圖解 |
| **找影片** | 「我想看恐龍的影片」「放一段太陽系的影片」 | YouTube 找適齡知識影片 → 對話串流內嵌小播放窗 |
| **拍照讀題** | 對考卷拍照 | Gemini 視覺辨識題目 → 餵進講解 |
| **英文跟讀** | 英文題附帶單字 | 🔊 聽 + 🎤 跟讀比對、過了灑花計分 |
| 聽寫 / 成語 | 「我要練聽寫」「來玩成語」 | 全螢幕測驗 overlay |
| 閒聊 / 聽不懂 | 打招呼、含糊 | 溫柔回應、引導回學習 |

語音輸入（STT，中文 `cmn-Hant-TW`）、朗讀（TTS，中文 + 英文跟讀用 `en-US`）全程零後端成本，可開關。

---

## 圖像策略（雙軌）

生圖模型不可靠（多模態會「回文字不出圖」、Imagen 中文理解差），因此分流：

- **情境圖**（畫貓、故事場景）→ **Imagen 4**（`imagen-4.0-fast-generate-001`，專門 T2I，每次都出圖）。中文 context 先用 Gemini flash **翻成英文**再畫；空回/5xx 同層重試一次。
- **數學圖解** → **確定性 SVG**（前端照 `explain.viz` 規格畫，100% 正確）。LLM 只負責把題目對應到 `count`（加減數東西、打紅叉/標綠底）或 `groups`（乘除分組）規格，畫圖完全由前端決定，**永不畫錯**。

---

## 架構

```
瀏覽器 ──► gateway (nginx, :7014) ──► frontend (Vite/React, :5173 dev)
                                  └─► backend  (Bun + node:http, :3014)
                                            ├─ 對話 cascade：Claude 訂閱（opencode bare session, 同機 unix socket）→ Gemini 2.5 Flash
                                            ├─ 生圖 cascade：免費 apikey（Gemini 多模態）→ Imagen 4（Vertex 福利點數）
                                            ├─ 拍照讀題：Gemini 2.5 Flash 多模態（OCR）
                                            └─ 查字 / 聽寫 / 成語：本地教育部辭典 + 課綱題庫
```

- **前端**：`webapp/frontend`（Vite + React + TypeScript）。功能模組在 `src/features/`（a1 對話家教、a2 成語、a3 數學、a5 聽寫）。
- **後端**：`webapp/backend`（Bun 跑 `src/server.ts`，零框架 `node:http`）。provider/cascade 在 `src/providers/`，契約在 `src/contracts/providers.ts`。
- **成本分層皆「使用者授權的主→備」，不 silent fallback**：每一跳都落結構化 log（`a1.chat.cascade`、`a1.illustrate.cascade` 等）。

### 對話借 Claude 訂閱

後端不直接呼叫 Anthropic API，而是經同機 `opencode` daemon 的 unix socket 開一個一次性 `bare` session，**借 Claude OAuth 訂閱**跑意圖分類（model 釘 `claude-opus-4-8`）。失敗才掉接 Gemini（硬強制 responseSchema）。

### 找影片＋兒童知識型頻道庫

找影片走 YouTube Data API v3（`safeSearch=strict` + `videoEmbeddable`，6-9 歲安全鐵則）。後端維護一份「經挑選、適齡」的頻道庫（`data/channels.json`，如樂樂TV、十萬個為什麼、成語任務）：小朋友的問題命中庫內頻道主題時，**先在該精選頻道內搜尋**（命中即用，省 API 配額），否則退一般搜尋；精選結果標 ⭐ 排最前。需在 GEMINI key 同一 GCP 專案啟用 YouTube Data API v3，或設 `YOUTUBE_API_KEY`。

- 列出頻道庫（檢索）：`GET /api/a1/channels`
- 新增頻道入庫（管理，channelId 去重、寫回 JSON）：`POST /api/a1/channels {"channelId","title?","topics?","note?"}`

---

## 開發

```bash
./webctl.sh start         # 起 backend(:3014) + frontend(:5173)
./webctl.sh status        # 看狀態
./webctl.sh logs backend  # 看 log（開發期 append 長久留存）
./webctl.sh restart backend
./webctl.sh stop
```

dev 前端網址：`http://localhost:5173/cecelearn/`（base path = `PUBLIC_BASE_PATH`）。

### 環境變數（`BUILD/env/backend.env`）

| 變數 | 說明 |
|------|------|
| `CHAT_PROVIDER` | `gemini` / `bare` / `cascade`（預設 cascade：Claude→Gemini） |
| `OPENCODE_DAEMON_SOCKET` `OPENCODE_CHAT_MODEL` `OPENCODE_CHAT_ACCOUNT` | bare session 的 socket / 模型 / 訂閱帳號 |
| `IMAGE_PROVIDER` | `apikey` / `vertex` / `cascade`（預設 cascade：apikey→Imagen 4） |
| `GEMINI_API_KEYS` | 逗號分隔，429 自動輪替 |
| `VERTEX_PROJECT` `VERTEX_LOCATION` `VERTEX_KEY_FILE` | Vertex 認證（service account） |
| `VERTEX_IMAGEN_MODEL` | 預設 `imagen-4.0-fast-generate-001` |

---

## 部署

統一產品經 `BUILD/` 的 Docker compose 對外（gateway port `7014`）：

```bash
docker compose -f BUILD/compose/docker-compose.yml up -d --build
```

詳見 [`BUILD/README.md`](BUILD/README.md)。
