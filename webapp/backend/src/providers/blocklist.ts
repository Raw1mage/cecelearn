import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BlockedChannel } from '../contracts/providers.js'

/**
 * 家長黑名單（反向硬擋）——借鏡 ytlite 的 blocklist，但全域、無登入。
 *
 * 維護一份「家長不想讓小孩看到」的頻道清單（data/blocklist.json）。
 * 小雞老師找影片時，YoutubeVideoProvider 在 search 結果、影片庫服務各環節，
 * 一律先剔除命中這些 channelId 的影片——硬擋，優先於精選白名單加權。
 *
 * 與 ytlite 差異：ytlite 是 per-user `{uid}_blocked.json`（多租戶）；cecelearn 服務
 * 單一家庭情境，採全域單一清單，不引入登入/per-user。
 */

const DATA_REL = '../../data/blocklist.json'

type BlocklistFile = {
  version: number
  note?: string
  channels: BlockedChannel[]
}

function dataPath(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), DATA_REL)
}

function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...fields, ts: Date.now() }))
}

export class Blocklist {
  private channels: BlockedChannel[] = []
  private blockedIdSet = new Set<string>()

  constructor() {
    this.reload()
  }

  reload(): void {
    try {
      const file = JSON.parse(readFileSync(dataPath(), 'utf-8')) as BlocklistFile
      this.channels = Array.isArray(file.channels) ? file.channels : []
    } catch (error) {
      console.warn(
        '[Blocklist] 載入失敗（找影片不套用家長黑名單硬擋）:',
        error instanceof Error ? error.message : error,
      )
      this.channels = []
    }
    this.rebuildSet()
    log('a1.blocklist.loaded', { total: this.blockedIdSet.size })
  }

  private rebuildSet(): void {
    this.blockedIdSet = new Set(
      this.channels.filter((c) => c.channelId).map((c) => c.channelId),
    )
  }

  /** 某 channelId 是否被家長封鎖。 */
  has(channelId: string): boolean {
    return !!channelId && this.blockedIdSet.has(channelId)
  }

  /** 全部封鎖頻道（檢索/管理用）。 */
  list(): BlockedChannel[] {
    return this.channels
  }

  /** 從一串影片剔除命中黑名單者（硬擋）。 */
  filter<T extends { channelId: string }>(items: T[]): T[] {
    if (this.blockedIdSet.size === 0) return items
    return items.filter((it) => !this.blockedIdSet.has(it.channelId))
  }

  /**
   * 封鎖一個頻道並寫回 JSON 檔。以 channelId 去重（已存在則更新名稱）。
   * 寫檔失敗會 throw，呼叫端回 5xx。
   */
  add(channelId: string, channelName = '', addedAt = today()): BlockedChannel {
    const cid = channelId.trim()
    const existing = this.channels.find((c) => c.channelId === cid)
    const entry: BlockedChannel = {
      channelId: cid,
      channelName: channelName.trim() || existing?.channelName || '',
      addedAt: existing?.addedAt ?? addedAt,
    }
    if (existing) {
      Object.assign(existing, entry)
    } else {
      this.channels.push(entry)
    }
    this.persist()
    this.rebuildSet()
    log('a1.blocklist.added', { channelId: cid, channelName: entry.channelName })
    return entry
  }

  /** 解除封鎖一個頻道並寫回 JSON 檔。回是否原本存在。 */
  remove(channelId: string): boolean {
    const cid = channelId.trim()
    const before = this.channels.length
    this.channels = this.channels.filter((c) => c.channelId !== cid)
    const removed = this.channels.length < before
    if (removed) {
      this.persist()
      this.rebuildSet()
      log('a1.blocklist.removed', { channelId: cid })
    }
    return removed
  }

  private persist(): void {
    const file: BlocklistFile = {
      version: 1,
      note: '家長黑名單：反向硬擋頻道。小雞老師找影片時，命中這些 channelId 的影片一律剔除（硬擋，優先於精選白名單加權與 isFamilyFriendly 軟過濾）。新增請走 POST /api/a1/block（action=block/unblock），或直接編此檔。資料由系統自動寫入。',
      channels: this.channels,
    }
    writeFileSync(dataPath(), JSON.stringify(file, null, 2) + '\n', 'utf-8')
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}
