import type { A1VideoItem } from '../contracts/providers.js'

/**
 * Invidious 客戶端——自架 Invidious（開源 YouTube 抓取器）的精簡封裝。
 *
 * 借鏡 ytlite 的做法：找影片改打自架 Invidious 的 /api/v1 端點，**完全不用 YouTube
 * Data API、沒有每日配額**。播放仍用真實 videoId 走 YouTube iframe，所以只換「搜尋／
 * metadata」這一層。
 *
 * 兒童安全：Invidious 搜尋沒有 safeSearch=strict 參數，但每個頻道有 isFamilyFriendly
 * （YouTube familySafe microformat）。這裡提供頻道層級的 family-friendly 查詢（含快取），
 * 由上層 provider 搭配「精選頻道優先」一起把關。
 */

type RawSearchItem = {
  type?: string
  videoId?: string
  title?: string
  author?: string
  authorId?: string
}

function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...fields, ts: Date.now() }))
}

const FF_TTL_MS = 24 * 60 * 60 * 1000 // 頻道 family-friendly 快取 24h

export class InvidiousClient {
  private base: string
  /** channelId → { ff, at }：頻道 family-friendly 快取（避免每次搜尋都打 /channels）。 */
  private ffCache = new Map<string, { ff: boolean; at: number }>()

  constructor(baseUrl: string) {
    this.base = baseUrl.replace(/\/+$/, '')
    console.log(`[InvidiousClient] base=${this.base}`)
  }

  /** 取設定的 base URL（啟動 health probe / 診斷用）。 */
  baseUrl(): string {
    return this.base
  }

  /**
   * 啟動 health probe：打 /api/v1/stats 確認自架 Invidious 在線上。
   * 回 true=可用；false=連不到（呼叫端只 log warn、不崩——找影片會退 Data API / 影片庫）。
   * 明示化跨機依賴（cecelearn 借用同機 ytlite 的 Invidious）：連不到時讓 log 留下明確證據。
   */
  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.base}/api/v1/stats`, { signal: AbortSignal.timeout(5000) })
      return res.ok
    } catch {
      return false
    }
  }

  /** 影片搜尋。回 A1VideoItem[]（thumbnail 用 i.ytimg 直連，不走 Invidious 代理）；失敗回 null。 */
  async search(q: string): Promise<A1VideoItem[] | null> {
    const url =
      `${this.base}/api/v1/search?` +
      new URLSearchParams({ q, type: 'video', sort_by: 'relevance', region: 'TW' }).toString()
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) })
      if (!res.ok) {
        log('a1.video.invidious_error', { status: res.status })
        return null
      }
      const data = (await res.json()) as RawSearchItem[]
      if (!Array.isArray(data)) return null
      return data
        .filter((x) => x && x.videoId && x.title)
        .map((x) => ({
          videoId: x.videoId as string,
          title: x.title as string,
          channelId: x.authorId ?? '',
          channelTitle: x.author ?? '',
          thumbnail: `https://i.ytimg.com/vi/${x.videoId}/mqdefault.jpg`,
          curated: false,
        }))
    } catch (err) {
      log('a1.video.invidious_exception', { error: err instanceof Error ? err.message : String(err) })
      return null
    }
  }

  /**
   * 取某頻道的最新影片（feed 預熱用，借鏡 ytlite 的 latestVideos 聚合）。
   * 打 /api/v1/channels/{id} 取 latestVideos → A1VideoItem[]；失敗回 null。
   * curated 固定 false（上層 flagAndSort 會用頻道庫即時重算）。
   */
  async channelLatestVideos(channelId: string): Promise<A1VideoItem[] | null> {
    if (!channelId) return null
    try {
      const res = await fetch(`${this.base}/api/v1/channels/${channelId}`, {
        signal: AbortSignal.timeout(12000),
      })
      if (!res.ok) {
        log('a1.video.invidious_channel_error', { channelId, status: res.status })
        return null
      }
      const data = (await res.json()) as {
        author?: string
        authorId?: string
        latestVideos?: RawSearchItem[]
      }
      const list = Array.isArray(data.latestVideos) ? data.latestVideos : []
      return list
        .filter((x) => x && x.videoId && x.title)
        .map((x) => ({
          videoId: x.videoId as string,
          title: x.title as string,
          channelId: x.authorId ?? data.authorId ?? channelId,
          channelTitle: x.author ?? data.author ?? '',
          thumbnail: `https://i.ytimg.com/vi/${x.videoId}/mqdefault.jpg`,
          curated: false,
        }))
    } catch (err) {
      log('a1.video.invidious_channel_exception', {
        channelId,
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }

  /**
   * 頻道是否 family-friendly（含 24h 快取）。
   * true/false = 已知；null = 查不到（上層自行決定保守處理）。
   */
  async isChannelFamilyFriendly(channelId: string): Promise<boolean | null> {
    if (!channelId) return null
    const cached = this.ffCache.get(channelId)
    if (cached && Date.now() - cached.at < FF_TTL_MS) return cached.ff
    try {
      const res = await fetch(`${this.base}/api/v1/channels/${channelId}`, {
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) return null
      const data = (await res.json()) as { isFamilyFriendly?: boolean }
      if (typeof data.isFamilyFriendly === 'boolean') {
        this.ffCache.set(channelId, { ff: data.isFamilyFriendly, at: Date.now() })
        return data.isFamilyFriendly
      }
      return null
    } catch {
      return null
    }
  }
}
