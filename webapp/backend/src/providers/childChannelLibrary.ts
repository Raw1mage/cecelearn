import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CuratedChannel } from '../contracts/providers.js'

/**
 * 兒童知識型頻道庫（curated channel registry）。
 *
 * 維護一份「經過挑選、適合 6-9 歲」的 YouTube 頻道清單（data/channels.json）。
 * 小雞老師找影片時，YoutubeVideoProvider 會用 activeIds() 把命中這些頻道的結果
 * 加權排到最前、標記精選——讓小朋友優先看到可信來源的內容。
 *
 * 也支援 runtime 新增（add，寫回 JSON 檔），方便「搜尋到好的就納入管理」。
 */

const DATA_REL = '../../data/channels.json'

type LibraryFile = {
  version: number
  note?: string
  channels: CuratedChannel[]
}

function dataPath(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), DATA_REL)
}

function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...fields, ts: Date.now() }))
}

export class ChildChannelLibrary {
  private channels: CuratedChannel[] = []
  private activeIdSet = new Set<string>()

  constructor() {
    this.reload()
  }

  reload(): void {
    try {
      const file = JSON.parse(readFileSync(dataPath(), 'utf-8')) as LibraryFile
      this.channels = Array.isArray(file.channels) ? file.channels : []
    } catch (error) {
      console.warn(
        '[ChannelLibrary] 載入失敗（找影片改回純 safeSearch，不加權）:',
        error instanceof Error ? error.message : error,
      )
      this.channels = []
    }
    this.activeIdSet = new Set(
      this.channels
        .filter((c) => c.status === 'active' && c.channelId)
        .map((c) => c.channelId as string),
    )
    log('a1.channels.loaded', { total: this.channels.length, active: this.activeIdSet.size })
  }

  /** 全部頻道（含 pending）——管理/檢索用。 */
  list(): CuratedChannel[] {
    return this.channels
  }

  /** 參與搜尋加權的 channelId 集合（status=active 且有 channelId）。 */
  activeIds(): Set<string> {
    return this.activeIdSet
  }

  isCurated(channelId: string): boolean {
    return this.activeIdSet.has(channelId)
  }

  /** 依主題關鍵詞找庫內頻道（topics 或標題含該詞）——檢索用。 */
  findByTopic(topic: string): CuratedChannel[] {
    const t = topic.trim()
    if (!t) return []
    return this.channels.filter(
      (c) => c.title.includes(t) || c.topics.some((x) => x.includes(t) || t.includes(x)),
    )
  }

  /**
   * 一段文字（通常是搜尋詞）命中哪些 active 頻道：頻道標題或任一 topic 關鍵詞
   * 出現在文字裡即算命中。回 active 且有 channelId 者，供鎖頻道精選搜尋。
   */
  matchActiveByText(text: string): CuratedChannel[] {
    const t = text.trim()
    if (!t) return []
    return this.channels.filter(
      (c) =>
        c.status === 'active' &&
        !!c.channelId &&
        (t.includes(c.title) || c.topics.some((x) => x && t.includes(x))),
    )
  }

  /**
   * 新增/更新一筆頻道並寫回 JSON 檔。以 channelId 去重（已存在則合併欄位）。
   * 寫檔失敗會 throw，呼叫端回 5xx。
   */
  add(input: {
    channelId: string
    title?: string
    handle?: string
    topics?: string[]
    note?: string
    addedAt: string
  }): CuratedChannel {
    const existing = this.channels.find((c) => c.channelId === input.channelId)
    const merged: CuratedChannel = {
      channelId: input.channelId,
      title: input.title ?? existing?.title ?? input.channelId,
      handle: input.handle ?? existing?.handle,
      topics: input.topics ?? existing?.topics ?? [],
      note: input.note ?? existing?.note,
      status: 'active',
      addedAt: existing?.addedAt ?? input.addedAt,
    }
    if (existing) {
      Object.assign(existing, merged)
    } else {
      this.channels.push(merged)
    }
    this.persist()
    this.activeIdSet = new Set(
      this.channels
        .filter((c) => c.status === 'active' && c.channelId)
        .map((c) => c.channelId as string),
    )
    log('a1.channels.added', { channelId: input.channelId, title: merged.title })
    return merged
  }

  private persist(): void {
    const file: LibraryFile = {
      version: 1,
      note:
        '兒童知識型 YouTube 頻道庫。小雞老師找影片時，命中這些頻道的結果會被加權排到最前面、標記為精選。新增請走 POST /api/a1/channels（或直接編此檔）。status=active 才會參與加權；pending=已知好頻道但尚未確認官方頻道 ID。',
      channels: this.channels,
    }
    writeFileSync(dataPath(), JSON.stringify(file, null, 2) + '\n', 'utf-8')
  }
}
