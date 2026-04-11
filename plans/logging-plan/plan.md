# Logging Plan — CeceLearn Access Log & 行為統計

## 目標

建立類似 Web Server access log 的完整記錄系統，涵蓋所有 API 請求和使用者行為。

## 階段

### Phase 1: 出題 Log（已部分完成）

- [x] A5 出題記錄 `[A5出題] char → word（來源）`
- [ ] 統一 log 格式：`timestamp | module | action | detail`
- [ ] 寫入檔案（目前只有 console.log）
- [ ] Log 路徑：`~/.local/state/cecelearn/logs/access.log`

### Phase 2: API Access Log

仿 nginx/apache access log 格式，每個 HTTP request 記錄：

```
timestamp | method | path | status | duration_ms | user_agent | payload_summary
```

- [ ] 在 server.ts 加 middleware，所有請求進出都記錄
- [ ] 記錄 request body 摘要（不記完整 payload，避免過大）
- [ ] 記錄 response status + latency

### Phase 3: 使用者行為統計

前端發送事件到後端收集：

| 事件 | 資料 |
|------|------|
| quiz_start | mode, publisher, grade, questionCount, wordType |
| question_answer | word, hinted, points, gradeScore, timeSpent |
| hint_quiz_complete | word, totalMistakes, totalStrokes |
| quiz_complete | totalCorrect, totalQuestions, maxCombo, totalScore |

- [ ] 前端 `apiClient.logEvent(event, data)` 方法
- [ ] 後端 `POST /api/log` 端點
- [ ] 寫入 `~/.local/state/cecelearn/logs/events.jsonl`（每行一個 JSON）

### Phase 4: 統計報表

- [ ] CLI 工具或 admin 頁面查看統計
- [ ] 每日/每週答題量、正確率、常錯字
- [ ] 按使用者（未來多用戶時）分組

## 技術決策

- Log 格式：access log 用純文字，行為事件用 JSONL
- 儲存：本機檔案，不引入資料庫
- Rotation：按日期分檔（`access-2026-04-11.log`）
- 保留期：預設 90 天
