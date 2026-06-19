import { Database } from 'bun:sqlite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * GenBank —— 統一「token 產物累積層」（SQLite, bun:sqlite 內建）。
 *
 * cecelearn 透過 token（Gemini / Imagen / YouTube）產生的東西，結構化分類儲存供再利用：
 *  - gen_quiz ：runtime 生成的練習題（bank-first/rotation serve，最省 token）
 *  - gen_image：插畫（kind=quiz-icon 單元物件 / kind=scene 場景插畫）；bytes 存檔案系統，DB 存路徑
 *  - gen_video：找過的兒童影片連結（取代 videobank.json）
 *
 * 共用 provenance：source_model / prompt / created_at / reuse_count。
 * fail-fast（天條 #11）：DB 開不了直接拋，server 啟動即報錯，不 silent 退無庫模式。
 *
 * 設計依據：production 跑 `bun run src/server.ts`（webctl.sh:66）→ bun:sqlite 內建，零 native dep。
 * 圖 bytes 不入 DB（DD-3）：SQLite 存大 blob 不利、檔案模式已驗證、HTTP 靜態路由已有。
 */

const DB_REL = '../../data/genbank.sqlite'

function dbPath(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), DB_REL)
}

function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...fields, ts: Date.now() }))
}

/* ---- 列型別（對應三表 row 形狀） ---------------------------------- */

export type QuizRow = {
  id: number
  q_id: string
  subject: string
  grade: string
  kp_id: string
  type: string
  stem: string
  answer: string
  acceptable_answers: string | null // JSON array
  choices: string | null // JSON array
  steps: string // JSON array
  viz: string | null // JSON object
  source_model: string
  reviewed: number
  created_at: string
  reuse_count: number
}

export type ImageRow = {
  id: number
  kind: string // 'quiz-icon' | 'scene'
  category_key: string // quiz-icon: noun; scene: 正規化關鍵詞
  file_path: string // 相對 data/ 的路徑
  alt_text: string | null
  source_model: string
  prompt: string | null
  created_at: string
  reuse_count: number
}

export type VideoRow = {
  id: number
  topic: string
  label: string
  video_id: string
  title: string
  channel_id: string
  channel_title: string
  thumbnail: string
  queries: string | null // JSON array
  source_model: string
  created_at: string
  reuse_count: number
}

export type GenTable = 'gen_quiz' | 'gen_image' | 'gen_video'

function nowIso(): string {
  return new Date().toISOString()
}

export class GenBank {
  private db: Database

  constructor() {
    // fail-fast：開不了直接拋（天條 #11）
    this.db = new Database(dbPath(), { create: true })
    this.db.exec('PRAGMA journal_mode = WAL;')
    this.db.exec('PRAGMA foreign_keys = ON;')
    this.migrate()
    const counts = this.summary()
    log('genbank.ready', { ...counts, path: dbPath() })
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS gen_quiz (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        q_id TEXT NOT NULL UNIQUE,
        subject TEXT NOT NULL,
        grade TEXT NOT NULL,
        kp_id TEXT NOT NULL,
        type TEXT NOT NULL,
        stem TEXT NOT NULL,
        answer TEXT NOT NULL,
        acceptable_answers TEXT,
        choices TEXT,
        steps TEXT NOT NULL,
        viz TEXT,
        source_model TEXT NOT NULL DEFAULT '',
        reviewed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        reuse_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS ix_quiz_cat ON gen_quiz (subject, grade, kp_id);
      CREATE INDEX IF NOT EXISTS ix_quiz_dedupe ON gen_quiz (subject, grade, kp_id, stem);

      CREATE TABLE IF NOT EXISTS gen_image (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        category_key TEXT NOT NULL,
        file_path TEXT NOT NULL,
        alt_text TEXT,
        source_model TEXT NOT NULL DEFAULT '',
        prompt TEXT,
        created_at TEXT NOT NULL,
        reuse_count INTEGER NOT NULL DEFAULT 0,
        UNIQUE (kind, category_key)
      );
      CREATE INDEX IF NOT EXISTS ix_image_kind ON gen_image (kind);

      CREATE TABLE IF NOT EXISTS gen_video (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        topic TEXT NOT NULL,
        label TEXT NOT NULL,
        video_id TEXT NOT NULL,
        title TEXT NOT NULL,
        channel_id TEXT NOT NULL DEFAULT '',
        channel_title TEXT NOT NULL DEFAULT '',
        thumbnail TEXT NOT NULL DEFAULT '',
        queries TEXT,
        source_model TEXT NOT NULL DEFAULT 'youtube',
        created_at TEXT NOT NULL,
        reuse_count INTEGER NOT NULL DEFAULT 0,
        UNIQUE (topic, video_id)
      );
      CREATE INDEX IF NOT EXISTS ix_video_topic ON gen_video (topic);
    `)
  }

  /* ---- gen_quiz ---------------------------------------------------- */

  /** 插入一題（q_id 衝突＝已存在，忽略）。回 true=新插入、false=已存在。 */
  insertQuiz(row: {
    qId: string
    subject: string
    grade: string
    kpId: string
    type: string
    stem: string
    answer: string
    acceptableAnswers?: string[]
    choices?: string[]
    steps: string[]
    viz?: unknown
    sourceModel?: string
    reviewed?: boolean
  }): boolean {
    // 同 (subject,grade,kpId,stem) 視為重複題，不重存
    const dup = this.db
      .query('SELECT 1 FROM gen_quiz WHERE subject=? AND grade=? AND kp_id=? AND stem=? LIMIT 1')
      .get(row.subject, row.grade, row.kpId, row.stem)
    if (dup) return false
    try {
      this.db
        .query(
          `INSERT INTO gen_quiz
            (q_id, subject, grade, kp_id, type, stem, answer, acceptable_answers, choices, steps, viz, source_model, reviewed, created_at, reuse_count)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`,
        )
        .run(
          row.qId,
          row.subject,
          row.grade,
          row.kpId,
          row.type,
          row.stem,
          row.answer,
          row.acceptableAnswers?.length ? JSON.stringify(row.acceptableAnswers) : null,
          row.choices?.length ? JSON.stringify(row.choices) : null,
          JSON.stringify(row.steps),
          row.viz != null ? JSON.stringify(row.viz) : null,
          row.sourceModel ?? '',
          row.reviewed ? 1 : 0,
          nowIso(),
        )
      return true
    } catch (e) {
      // q_id UNIQUE 衝突等 → 視為已存在
      log('genbank.quiz.insert.skip', { qId: row.qId, err: e instanceof Error ? e.message : String(e) })
      return false
    }
  }

  /** bank-first 抽題：依 subject/grade 抽 count 題，rotation = reuse_count 升冪 + 隨機。 */
  drawQuiz(subject: string, grade: string, count: number): QuizRow[] {
    const rows = this.db
      .query(
        `SELECT * FROM gen_quiz WHERE subject=? AND grade=?
         ORDER BY reuse_count ASC, RANDOM() LIMIT ?`,
      )
      .all(subject, grade, Math.max(1, count)) as QuizRow[]
    return rows
  }

  /** 庫存量（某 subject/grade）。 */
  quizCount(subject: string, grade: string): number {
    const r = this.db
      .query('SELECT COUNT(*) AS n FROM gen_quiz WHERE subject=? AND grade=?')
      .get(subject, grade) as { n: number }
    return r?.n ?? 0
  }

  /** 抽中的題 bump reuse_count（讓 rotation 下次優先給沒看過的）。 */
  bumpQuizReuse(ids: number[]): void {
    if (ids.length === 0) return
    const stmt = this.db.query('UPDATE gen_quiz SET reuse_count = reuse_count + 1 WHERE id = ?')
    const tx = this.db.transaction((list: number[]) => {
      for (const id of list) stmt.run(id)
    })
    tx(ids)
  }

  /* ---- gen_image -------------------------------------------------- */

  /** upsert 一張圖記錄（kind+category_key 唯一）；回該記錄 file_path。 */
  upsertImage(row: {
    kind: string
    categoryKey: string
    filePath: string
    altText?: string
    sourceModel?: string
    prompt?: string
  }): void {
    this.db
      .query(
        `INSERT INTO gen_image (kind, category_key, file_path, alt_text, source_model, prompt, created_at, reuse_count)
         VALUES (?,?,?,?,?,?,?,0)
         ON CONFLICT(kind, category_key) DO UPDATE SET
           file_path=excluded.file_path, alt_text=excluded.alt_text,
           source_model=excluded.source_model, prompt=excluded.prompt`,
      )
      .run(
        row.kind,
        row.categoryKey,
        row.filePath,
        row.altText ?? null,
        row.sourceModel ?? '',
        row.prompt ?? null,
        nowIso(),
      )
  }

  /** 取一張圖（kind+category_key）；無則 null。命中時 bump reuse_count。 */
  getImage(kind: string, categoryKey: string): ImageRow | null {
    const row = this.db
      .query('SELECT * FROM gen_image WHERE kind=? AND category_key=? LIMIT 1')
      .get(kind, categoryKey) as ImageRow | null
    if (row) this.db.query('UPDATE gen_image SET reuse_count = reuse_count + 1 WHERE id=?').run(row.id)
    return row
  }

  /* ---- gen_video -------------------------------------------------- */

  /** 併入一支影片（topic+video_id 唯一，重複忽略）。回 true=新增。 */
  insertVideo(row: {
    topic: string
    label: string
    videoId: string
    title: string
    channelId?: string
    channelTitle?: string
    thumbnail?: string
    query?: string
  }): boolean {
    const existing = this.db
      .query('SELECT id, queries FROM gen_video WHERE topic=? AND video_id=? LIMIT 1')
      .get(row.topic, row.videoId) as { id: number; queries: string | null } | null
    if (existing) {
      // 已存在：把新 query 併進 queries（追溯用）
      if (row.query) {
        const qs: string[] = existing.queries ? JSON.parse(existing.queries) : []
        if (!qs.includes(row.query)) {
          qs.push(row.query)
          this.db.query('UPDATE gen_video SET queries=? WHERE id=?').run(JSON.stringify(qs), existing.id)
        }
      }
      return false
    }
    this.db
      .query(
        `INSERT INTO gen_video (topic, label, video_id, title, channel_id, channel_title, thumbnail, queries, source_model, created_at, reuse_count)
         VALUES (?,?,?,?,?,?,?,?,?,?,0)`,
      )
      .run(
        row.topic,
        row.label,
        row.videoId,
        row.title,
        row.channelId ?? '',
        row.channelTitle ?? '',
        row.thumbnail ?? '',
        row.query ? JSON.stringify([row.query]) : null,
        'youtube',
        nowIso(),
      )
    return true
  }

  /** 取某 topic 全部影片（累積順序）。 */
  getVideos(topic: string): VideoRow[] {
    return this.db
      .query('SELECT * FROM gen_video WHERE topic=? ORDER BY id ASC')
      .all(topic) as VideoRow[]
  }

  /** 某 topic 影片數。 */
  videoCount(topic: string): number {
    const r = this.db.query('SELECT COUNT(*) AS n FROM gen_video WHERE topic=?').get(topic) as { n: number }
    return r?.n ?? 0
  }

  /** 各 topic 摘要（管理用）。 */
  videoTopics(): Array<{ topic: string; label: string; count: number; updatedAt: string }> {
    return this.db
      .query(
        `SELECT topic, label, COUNT(*) AS count, MAX(created_at) AS updatedAt
         FROM gen_video GROUP BY topic ORDER BY count DESC`,
      )
      .all() as Array<{ topic: string; label: string; count: number; updatedAt: string }>
  }

  /* ---- 後台統一 API ---------------------------------------------- */

  /** 各表分類統計（後台首頁）。 */
  summary(): { quiz: number; image: number; video: number } {
    const q = this.db.query('SELECT COUNT(*) AS n FROM gen_quiz').get() as { n: number }
    const i = this.db.query('SELECT COUNT(*) AS n FROM gen_image').get() as { n: number }
    const v = this.db.query('SELECT COUNT(*) AS n FROM gen_video').get() as { n: number }
    return { quiz: q?.n ?? 0, image: i?.n ?? 0, video: v?.n ?? 0 }
  }

  /** 分頁列表（後台檢視）。type=表名；category 選填過濾。 */
  list(table: GenTable, opts: { category?: string; page?: number; pageSize?: number }): {
    rows: unknown[]
    total: number
    page: number
    pageSize: number
  } {
    const pageSize = Math.min(200, Math.max(1, opts.pageSize ?? 50))
    const page = Math.max(0, opts.page ?? 0)
    const offset = page * pageSize
    let where = ''
    const params: unknown[] = []
    if (opts.category) {
      if (table === 'gen_quiz') { where = 'WHERE kp_id = ?'; params.push(opts.category) }
      else if (table === 'gen_image') { where = 'WHERE kind = ?'; params.push(opts.category) }
      else { where = 'WHERE topic = ?'; params.push(opts.category) }
    }
    const total = (this.db.query(`SELECT COUNT(*) AS n FROM ${table} ${where}`).get(...params) as { n: number })?.n ?? 0
    const rows = this.db
      .query(`SELECT * FROM ${table} ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...params, pageSize, offset)
    return { rows, total, page, pageSize }
  }

  /** 刪一筆（後台清理）。回 true=刪到。 */
  remove(table: GenTable, id: number): boolean {
    const r = this.db.query(`DELETE FROM ${table} WHERE id = ?`).run(id)
    return r.changes > 0
  }

  /** 取一筆 image row（給靜態路由依 id 找檔）。 */
  imageById(id: number): ImageRow | null {
    return this.db.query('SELECT * FROM gen_image WHERE id=? LIMIT 1').get(id) as ImageRow | null
  }
}
