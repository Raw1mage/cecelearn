import { existsSync, readFileSync, renameSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { A1VideoItem } from '../contracts/providers.js'
import type { GenBank } from './genbank.js'

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
  private bank: GenBank

  /**
   * @param genBank 統一累積層。影片資料改存 gen_video 表（取代 videobank.json）。
   * 公開 API（size/get/accumulate/summary）不變，呼叫端無感。
   */
  constructor(genBank: GenBank) {
    this.bank = genBank
    this.importLegacyJsonOnce()
    log('a1.videobank.ready', { source: 'genbank' })
  }

  /** 一次性遷移：若舊 videobank.json 還在，import 進 gen_video 後改名為 .imported（保留備份）。 */
  private importLegacyJsonOnce(): void {
    const p = dataPath()
    if (!existsSync(p)) return
    try {
      const file = JSON.parse(readFileSync(p, 'utf-8')) as BankFile
      let imported = 0
      for (const [key, t] of Object.entries(file.topics ?? {})) {
        const query = t.queries?.[0] ?? ''
        for (const v of t.videos) {
          const isNew = this.bank.insertVideo({
            topic: key,
            label: t.label || key,
            videoId: v.videoId,
            title: v.title,
            channelId: v.channelId,
            channelTitle: v.channelTitle,
            thumbnail: v.thumbnail,
            query,
          })
          if (isNew) imported += 1
        }
      }
      renameSync(p, `${p}.imported`)
      log('a1.videobank.migrated', { imported, from: 'videobank.json' })
    } catch (error) {
      console.warn('[VideoBank] 舊 JSON 遷移失敗（略過，不影響 SQLite 運作）:', error instanceof Error ? error.message : error)
    }
  }

  /** 某主題庫內影片數（沒有回 0）。 */
  size(topic: string): number {
    return this.bank.videoCount(keyOf(topic))
  }

  /** 取某主題庫內全部影片（原始順序＝累積順序）。 */
  get(topic: string): BankVideo[] {
    return this.bank.getVideos(keyOf(topic)).map((r) => ({
      videoId: r.video_id,
      title: r.title,
      channelId: r.channel_id,
      channelTitle: r.channel_title,
      thumbnail: r.thumbnail,
      addedAt: r.created_at.slice(0, 10),
    }))
  }

  /**
   * 把一次搜尋的好結果併入主題（以 videoId 去重）。
   * label：原始主題字（顯示用）；query：這次的搜尋詞（追溯用）。
   */
  accumulate(topic: string, label: string, query: string, items: A1VideoItem[]): void {
    const key = keyOf(topic)
    if (!key || items.length === 0) return
    let added = 0
    for (const it of items) {
      if (!it.videoId) continue
      const isNew = this.bank.insertVideo({
        topic: key,
        label: label.trim() || topic,
        videoId: it.videoId,
        title: it.title,
        channelId: it.channelId,
        channelTitle: it.channelTitle,
        thumbnail: it.thumbnail,
        query: query.trim(),
      })
      if (isNew) added += 1
    }
    log('a1.videobank.accumulate', { topic: key, added, total: this.bank.videoCount(key) })
  }

  /** 各主題摘要（管理/檢索用）。 */
  summary(): Array<{ topic: string; label: string; count: number; updatedAt: string }> {
    return this.bank.videoTopics()
  }
}
