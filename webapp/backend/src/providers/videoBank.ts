import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { A1VideoItem } from '../contracts/providers.js'

/**
 * 影片庫（persistent video bank）——依主題分門別類，累積「可給小孩看」的影片連結。
 *
 * 目的：減少對 YouTube API 的依賴。小雞老師找影片時：
 *  1. 先查本庫；某主題已累積夠多（>= serveMin）就直接服務，不打 API。
 *  2. 不足才搜尋 YouTube，並把結果 accumulate 回本庫（去重）。
 * 隨使用累積，常見主題漸漸不再需要 API（多半一個主題只搜一次）。
 *
 * 存 data/videobank.json，runtime 自動寫入（與 channels.json 同套讀寫模式）。
 */

const DATA_REL = '../../data/videobank.json'

/** 庫內單支影片（不存 curated 旗標——serve 時用頻道庫即時重算，避免過時）。 */
export type BankVideo = {
  videoId: string
  title: string
  channelId: string
  channelTitle: string
  thumbnail: string
  addedAt: string
}

type BankTopic = {
  label: string // 第一次見到的原始主題字（顯示用）
  videos: BankVideo[]
  queries: string[] // 餵過這個主題的搜尋詞（追溯用）
  updatedAt: string
}

type BankFile = {
  version: number
  note?: string
  topics: Record<string, BankTopic>
}

function dataPath(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), DATA_REL)
}

function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...fields, ts: Date.now() }))
}

/** 主題正規化成庫的 key：去頭尾、收合空白、小寫。 */
function keyOf(topic: string): string {
  return topic.trim().replace(/\s+/g, ' ').toLowerCase()
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export class VideoBank {
  private topics: Record<string, BankTopic> = {}

  constructor() {
    this.reload()
  }

  reload(): void {
    try {
      const file = JSON.parse(readFileSync(dataPath(), 'utf-8')) as BankFile
      this.topics = file.topics ?? {}
    } catch (error) {
      console.warn(
        '[VideoBank] 載入失敗（找影片改回每次都搜 YouTube）:',
        error instanceof Error ? error.message : error,
      )
      this.topics = {}
    }
    const count = Object.values(this.topics).reduce((n, t) => n + t.videos.length, 0)
    log('a1.videobank.loaded', { topics: Object.keys(this.topics).length, videos: count })
  }

  /** 某主題庫內影片數（沒有回 0）。 */
  size(topic: string): number {
    return this.topics[keyOf(topic)]?.videos.length ?? 0
  }

  /** 取某主題庫內全部影片（原始順序＝累積順序）。 */
  get(topic: string): BankVideo[] {
    return this.topics[keyOf(topic)]?.videos ?? []
  }

  /**
   * 把一次搜尋的好結果併入主題（以 videoId 去重，新影片附 addedAt），並寫回檔案。
   * label：原始主題字（顯示用）；query：這次的搜尋詞（追溯用）。
   */
  accumulate(topic: string, label: string, query: string, items: A1VideoItem[]): void {
    const key = keyOf(topic)
    if (!key || items.length === 0) return
    const t: BankTopic =
      this.topics[key] ?? { label: label.trim() || topic, videos: [], queries: [], updatedAt: today() }
    const seen = new Set(t.videos.map((v) => v.videoId))
    let added = 0
    for (const it of items) {
      if (!it.videoId || seen.has(it.videoId)) continue
      seen.add(it.videoId)
      t.videos.push({
        videoId: it.videoId,
        title: it.title,
        channelId: it.channelId,
        channelTitle: it.channelTitle,
        thumbnail: it.thumbnail,
        addedAt: today(),
      })
      added += 1
    }
    const q = query.trim()
    if (q && !t.queries.includes(q)) t.queries.push(q)
    t.updatedAt = today()
    this.topics[key] = t
    if (added > 0) this.persist()
    log('a1.videobank.accumulate', { topic: key, added, total: t.videos.length })
  }

  /** 各主題摘要（管理/檢索用）。 */
  summary(): Array<{ topic: string; label: string; count: number; updatedAt: string }> {
    return Object.entries(this.topics)
      .map(([topic, t]) => ({ topic, label: t.label, count: t.videos.length, updatedAt: t.updatedAt }))
      .sort((a, b) => b.count - a.count)
  }

  private persist(): void {
    const file: BankFile = {
      version: 1,
      note: '影片庫：依主題分門別類，累積『可給小孩看』的 YouTube 影片連結。小雞老師找影片時先查這裡，主題已累積足夠就直接服務、不打 YouTube API；不足才搜尋並把好結果寫回此庫。資料由系統自動寫入。',
      topics: this.topics,
    }
    writeFileSync(dataPath(), JSON.stringify(file, null, 2) + '\n', 'utf-8')
  }
}
