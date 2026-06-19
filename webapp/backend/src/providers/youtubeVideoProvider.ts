import type {
  A1ErrorResponse,
  A1VideoItem,
  A1VideoSearchResponse,
  VideoSearchProvider,
} from '../contracts/providers.js'
import type { ChildChannelLibrary } from './childChannelLibrary.js'
import type { VideoBank } from './videoBank.js'
import type { YtDlpVideoProvider } from './ytDlpVideoProvider.js'
import type { Blocklist } from './blocklist.js'

/**
 * 找影片 provider —— 小朋友問知識，小雞老師找適齡影片，前端 inline 開成小播放窗。
 *
 * 搜尋來源：**yt-dlp 被動函式為主**（DD-32，取代熱 service Invidious）。yt-dlp 是
 * 「函式形狀」——呼叫才 spawn 去爬、回 metadata 就退出，無 daemon/docker/postgres；
 * cecelearn 的找影片本就是 query→清單 的被動需求。yt-dlp 不可用且有 YOUTUBE_API_KEY 時，
 * 退回 Data API search.list（safeSearch=strict）當後備。播放仍用真實 videoId 走 YouTube
 * iframe，只換「搜尋」這層。
 *
 * 兒童安全（精選優先＋黑名單硬擋）：
 *  - 精選優先：命中兒童知識型頻道庫（active）的結果標 curated 並穩定排到最前。
 *  - 黑名單硬擋：命中家長黑名單的 channelId 一律剔除（優先於白名單加權）。
 *  （yt-dlp 無 Invidious 的 isFamilyFriendly 欄位，故不做頻道層軟過濾；安全靠白名單+黑名單兩道閘。）
 *
 * 影片庫：先查庫（夠多就免搜），搜回的好結果寫回庫分門別類累積——常見主題漸漸免外部請求。
 *
 * fail-fast（DD-8）：搜不到回 kid-friendly ErrorResponse，不亂塞假結果。
 */

const SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search'
// 多抓一些（API 不分 maxResults 計費，固定 100 units），提高命中精選頻道的機會再加權排前。
// 也是「連續看相關影片」的來源：前端在這串 items 內前後切換，不再打 API。
const MAX_RESULTS = 12
const MAX_ATTEMPTS = 5
const RETRY_DELAY_MS = 200
// 影片庫門檻：某主題已累積 >= 這個數量的影片，就直接從庫內服務、不再打 YouTube API。
// 一次搜尋最多進 12 支 → 通常一個主題搜一次就跨過門檻，之後永遠免 API（漸漸不需要 API）。
const BANK_SERVE_MIN = 5

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * 是否為「值得重試」的暫態錯誤。
 * - 5xx：上游暫時不可用。
 * - 400 + key 尚未傳播（剛建好的 key 間歇回「API key expired / not valid」）。
 * 設定型錯誤（accessNotConfigured / forbidden / keyInvalid 永久）與 quotaExceeded 不重試。
 */
function isTransient(status: number, reason: string, message: string): boolean {
  if (status >= 500) return true
  if (status === 400) {
    const m = message.toLowerCase()
    return m.includes('expired') || m.includes('renew') || m.includes('not valid yet')
  }
  return false
}

type YtSearchResponse = {
  items?: {
    id?: { videoId?: string }
    snippet?: {
      title?: string
      channelId?: string
      channelTitle?: string
      thumbnails?: { medium?: { url?: string }; high?: { url?: string }; default?: { url?: string } }
    }
  }[]
  error?: { code?: number; message?: string; errors?: { reason?: string }[] }
}

function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...fields, ts: Date.now() }))
}

export class YoutubeVideoProvider implements VideoSearchProvider {
  private apiKey: string
  private library?: ChildChannelLibrary
  private bank?: VideoBank
  private ytdlp?: YtDlpVideoProvider
  private blocklist?: Blocklist

  constructor(
    apiKey = '',
    library?: ChildChannelLibrary,
    bank?: VideoBank,
    ytdlp?: YtDlpVideoProvider,
    blocklist?: Blocklist,
  ) {
    this.apiKey = apiKey.trim()
    this.library = library
    this.bank = bank
    this.ytdlp = ytdlp
    this.blocklist = blocklist
    const src = ytdlp ? 'yt-dlp' : this.apiKey ? 'youtube-api' : 'bank-only'
    const extras = [library && 'channel library', bank && 'video bank', blocklist && 'blocklist']
      .filter(Boolean)
      .join(' + ')
    console.log(`[YoutubeVideoProvider] source=${src}${extras ? ` (+${extras})` : ''}`)
  }

  /**
   * serve 時用頻道庫即時重算 curated 旗標，並穩定把精選排前。
   * 先硬擋家長黑名單（DD-26）：命中黑名單的頻道一律剔除，優先於白名單加權。
   */
  private flagAndSort(items: A1VideoItem[]): A1VideoItem[] {
    const safe = this.blocklist ? this.blocklist.filter(items) : items
    const curatedIds = this.library?.activeIds()
    const flagged = safe.map((it) => ({
      ...it,
      curated: curatedIds ? curatedIds.has(it.channelId) : false,
    }))
    flagged.sort((a, b) => Number(b.curated) - Number(a.curated))
    return flagged
  }

  async search(query: string, topic?: string): Promise<A1VideoSearchResponse | A1ErrorResponse> {
    const start = Date.now()
    const q = query.trim()
    const category = (topic?.trim() || q)
    log('a1.video.request', { query: q, topic: topic?.trim() || null })

    if (!q) {
      return { ok: false, error: 'VIDEO_BAD_REQUEST', message: '我還不知道要找什麼影片耶。' }
    }

    // 1) 先查影片庫：此主題已累積足夠 → 直接服務，不打 API（漸漸不需要 API）。
    if (this.bank && this.bank.size(category) >= BANK_SERVE_MIN) {
      const items = this.flagAndSort(this.bank.get(category) as A1VideoItem[])
      log('a1.video.bank_hit', { category, count: items.length, ms: Date.now() - start })
      return { ok: true, query: q, items }
    }

    // 2) 庫內不足 → 搜尋。來源：yt-dlp 為主（被動函式、零配額），不可用才退 Data API。
    let raw: A1VideoItem[] | null = null
    let usedSource = ''
    if (this.ytdlp) {
      raw = await this.ytdlp.search(q, MAX_RESULTS)
      if (raw) usedSource = 'yt-dlp'
    }
    if (!raw && this.apiKey) {
      const r = await this.runQuery(q) // Data API 後備（safeSearch=strict）
      if ('items' in r) {
        raw = r.items
        usedSource = 'youtube-api'
      }
    }

    // 都搜不到 → 退而求其次給庫內既有；再不行回 kid-friendly 錯誤。
    if (!raw || raw.length === 0) {
      if (this.bank && this.bank.size(category) > 0) {
        const items = this.flagAndSort(this.bank.get(category) as A1VideoItem[])
        log('a1.video.bank_only', { category, count: items.length })
        return { ok: true, query: q, items }
      }
      if (!this.ytdlp && !this.apiKey) {
        return { ok: false, error: 'VIDEO_NOT_CONFIGURED', message: '找影片功能還在準備中喔！' }
      }
      return { ok: false, error: 'VIDEO_UPSTREAM', message: '我現在找不到影片耶，等一下再試試看好嗎？' }
    }

    // 3) 精選旗標＋穩定排前（內含黑名單硬擋）。yt-dlp 無頻道層 family-friendly 欄位，
    //    兒童安全靠精選白名單（排前）+ 家長黑名單（硬擋）兩道閘；Data API 後備自帶 safeSearch=strict。
    const items = this.flagAndSort(raw)

    log('a1.video.search', {
      query: q,
      source: usedSource,
      raw: raw.length,
      kept: items.length,
      curated: items.filter((x) => x.curated).length,
      ms: Date.now() - start,
    })

    if (items.length === 0) {
      return { ok: false, error: 'VIDEO_EMPTY', message: '我找不到適合的影片耶，換個說法再問問看？' }
    }

    // 5) 寫回影片庫：分門別類累積（去重持久化）→ 下次同主題免搜尋。
    this.bank?.accumulate(category, topic?.trim() || q, q, items)

    return { ok: true, query: q, items }
  }

  /**
   * Feed 預熱（yt-dlp channelLatestVideos 聚合，DD-32；原 Invidious 版見 DD-27）：
   * 遍歷頻道庫 active 頻道 → yt-dlp 抓該頻道 /videos 最新片 → 黑名單硬擋 → 依該頻道的
   * topics 寫回 VideoBank。讓常見主題在小朋友還沒問之前就先備好「精選頻道的最新片」。
   *
   * 手動觸發（無排程）：POST /api/a1/prewarm。回各主題新增數摘要。
   * 精選頻道本身已人工核可，預熱只硬擋黑名單。
   * 某頻道抓不到（私人/刪除/yt-dlp 失敗）自然略過，不崩、不亂塞。
   */
  async prewarm(): Promise<{
    ok: boolean
    channels: number
    topics: Array<{ topic: string; added: number }>
    error?: string
  }> {
    if (!this.ytdlp) {
      return { ok: false, channels: 0, topics: [], error: 'PREWARM_NO_YTDLP' }
    }
    if (!this.library || !this.bank) {
      return { ok: false, channels: 0, topics: [], error: 'PREWARM_NOT_CONFIGURED' }
    }
    const start = Date.now()
    const active = this.library.list().filter((c) => c.status === 'active' && c.channelId)
    // 累計各主題新增數（一個頻道可掛多個 topic，逐 topic 寫回庫）。
    const addedByTopic = new Map<string, number>()
    let channelsHit = 0

    await Promise.all(
      active.map(async (ch) => {
        const vids = await this.ytdlp!.channelLatestVideos(ch.channelId as string)
        if (!vids || vids.length === 0) return
        channelsHit += 1
        const safe = this.blocklist ? this.blocklist.filter(vids) : vids
        if (safe.length === 0) return
        // 沒掛 topic 的頻道，用標題當主題，至少進得了庫。
        const topics = ch.topics.length > 0 ? ch.topics : [ch.title]
        for (const topic of topics) {
          const before = this.bank!.size(topic)
          this.bank!.accumulate(topic, topic, `prewarm:${ch.title}`, safe)
          const delta = this.bank!.size(topic) - before
          if (delta > 0) addedByTopic.set(topic, (addedByTopic.get(topic) ?? 0) + delta)
        }
      }),
    )

    const topics = [...addedByTopic.entries()]
      .map(([topic, added]) => ({ topic, added }))
      .sort((a, b) => b.added - a.added)
    log('a1.video.prewarm', {
      mode: 'ytdlp-channel-latest',
      channels: channelsHit,
      topics: topics.length,
      added: topics.reduce((n, t) => n + t.added, 0),
      ms: Date.now() - start,
    })
    return { ok: true, channels: channelsHit, topics }
  }

  /**
   * 跑一支 search.list（含暫態重試、結果整形、curated 標記）。
   * channelId 給定時鎖定該頻道（精選頻道內搜尋）。
   * 回 {items} 或 {error}（呼叫端決定如何合併/傳遞）。
   */
  private async runQuery(
    q: string,
    channelId?: string,
  ): Promise<{ items: A1VideoItem[] } | { error: A1ErrorResponse }> {
    const params = new URLSearchParams({
      key: this.apiKey,
      part: 'snippet',
      q,
      type: 'video',
      safeSearch: 'strict',
      videoEmbeddable: 'true',
      maxResults: String(MAX_RESULTS),
      regionCode: 'TW',
      relevanceLanguage: 'zh-Hant',
      order: 'relevance',
    })
    if (channelId) params.set('channelId', channelId)
    const curatedIds = this.library?.activeIds()

    // 同層重試（比照生圖暫態 5xx 重試一次）：剛建好的 API key 在 Google edge 尚未
    // 全面傳播時，會間歇回 400「API key expired」；5xx / 連線中斷亦屬暫態。
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(`${SEARCH_URL}?${params}`)
        const data = (await res.json()) as YtSearchResponse

        if (!res.ok || data.error) {
          const reason = data.error?.errors?.[0]?.reason ?? ''
          const message = data.error?.message ?? ''
          const transient = isTransient(res.status, reason, message)
          log('a1.video.error', { status: res.status, reason, message, channelId, attempt, transient })
          if (transient && attempt < MAX_ATTEMPTS) {
            await sleep(RETRY_DELAY_MS * attempt)
            continue
          }
          return {
            error: {
              ok: false,
              error: 'VIDEO_UPSTREAM',
              message: '我現在找不到影片耶，等一下再試試看好嗎？',
            },
          }
        }

        const items: A1VideoItem[] = (data.items ?? [])
          .map((it) => {
            const videoId = it.id?.videoId
            const sn = it.snippet
            if (!videoId || !sn) return null
            const thumb =
              sn.thumbnails?.medium?.url ??
              sn.thumbnails?.high?.url ??
              sn.thumbnails?.default?.url ??
              `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
            const cid = sn.channelId ?? channelId ?? ''
            return {
              videoId,
              title: sn.title ?? '',
              channelId: cid,
              channelTitle: sn.channelTitle ?? '',
              thumbnail: thumb,
              curated: curatedIds ? curatedIds.has(cid) : false,
            } satisfies A1VideoItem
          })
          .filter((x): x is NonNullable<typeof x> => x !== null)

        return { items }
      } catch (err) {
        log('a1.video.exception', {
          error: err instanceof Error ? err.message : String(err),
          channelId,
          attempt,
        })
        if (attempt < MAX_ATTEMPTS) {
          await sleep(RETRY_DELAY_MS * attempt)
          continue
        }
      }
    }

    return {
      error: { ok: false, error: 'VIDEO_UPSTREAM', message: '我現在找不到影片耶，等一下再試試看好嗎？' },
    }
  }
}
