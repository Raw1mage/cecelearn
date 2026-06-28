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
   * serve 時做兩件事，但**不重排序**：
   *  1. 黑名單硬擋（DD-26）：命中家長黑名單的頻道一律剔除。
   *  2. curated 旗標：命中精選頻道庫的標記 curated=true（前端用來標精選徽章）。
   * 刻意保留 yt-dlp 回來的相關度原序——之前把 curated 無條件 sort 到最前，會讓任何
   * 搜尋的第一支永遠是訂閱頻道（前端播放窗顯示最前面那支）→「不管搜什麼都只有佳佳老師」。
   * 精選只是徽章提示，不該凌駕搜尋相關度。安全靠黑名單硬擋這一道閘。
   */
  private flagAndSort(items: A1VideoItem[]): A1VideoItem[] {
    const safe = this.blocklist ? this.blocklist.filter(items) : items
    const curatedIds = this.library?.activeIds()
    return safe.map((it) => ({
      ...it,
      curated: curatedIds ? curatedIds.has(it.channelId) : false,
    }))
  }

  /**
   * 白名單頻道信任閘（家長決策）：信任邊界在「頻道」這層——只要結果來自精選頻道庫
   * （active）就免逐片審、直接給孩子看。策略＝**白名單優先、空時才補**：
   *  - 這次搜尋結果裡若有任何信任頻道的片 → 只留那些（其餘濾掉）。
   *  - 一支信任頻道都沒命中 → 整批照原樣回（safeSearch+黑名單仍在），不開天窗。
   * 注意：這是對「已按相關度排好的結果」做**過濾**，不是把訂閱頻道硬塞到頂——
   * 信任頻道的片本來就因相關才出現在結果裡，故不重蹈「不管搜什麼都只有某頻道」。
   * 無頻道庫（activeIds 空）時不過濾，退化成原行為。
   */
  private preferTrusted(items: A1VideoItem[]): A1VideoItem[] {
    const ids = this.library?.activeIds()
    if (!ids || ids.size === 0) return items
    const trusted = items.filter((it) => ids.has(it.channelId))
    return trusted.length > 0 ? trusted : items
  }

  async search(
    query: string,
    topic?: string,
    limit = MAX_RESULTS,
  ): Promise<A1VideoSearchResponse | A1ErrorResponse> {
    const start = Date.now()
    const q = query.trim()
    const category = (topic?.trim() || q)
    // 取回上限：載入更多時 fetchLimit 會超過 MAX_RESULTS（重搜更大 N，前端去重後 append）。
    const fetchLimit = Math.max(MAX_RESULTS, Math.floor(limit) || MAX_RESULTS)
    log('a1.video.request', { query: q, topic: topic?.trim() || null, limit: fetchLimit })

    if (!q) {
      return { ok: false, error: 'VIDEO_BAD_REQUEST', message: '我還不知道要找什麼影片耶。' }
    }

    // 1) serve 路徑一律先搜新鮮網路結果——yt-dlp 是零配額被動函式，沒有「省額度」的
    //    理由去吐庫內舊資料。影片庫不再參與 serve 短路，只在「網路整個搜失敗」時當
    //    離線安全網（見步驟 3）。這樣每次都忠實反映當下的搜尋詞，不會固化污染、不會「庫滿」。
    //    來源：yt-dlp 為主（被動函式、零配額），不可用才退 Data API（safeSearch=strict）。
    let raw: A1VideoItem[] | null = null
    let usedSource = ''
    if (this.ytdlp) {
      raw = await this.ytdlp.search(q, fetchLimit)
      if (raw) usedSource = 'yt-dlp'
    }
    if (!raw && this.apiKey) {
      const r = await this.runQuery(q, undefined, fetchLimit) // Data API 後備（safeSearch=strict）
      if ('items' in r) {
        raw = r.items
        usedSource = 'youtube-api'
      }
    }

    // 離線安全網：只有當網路整個搜失敗（yt-dlp 與 Data API 都拿不到任何結果）時，
    // 才退而求其次吐庫內既有，讓對話不至於開天窗；正常情況永遠走上面的新鮮搜尋。
    if (!raw || raw.length === 0) {
      if (this.bank && this.bank.size(category) > 0) {
        const items = this.preferTrusted(this.flagAndSort(this.bank.get(category) as A1VideoItem[]))
        log('a1.video.bank_fallback', { category, count: items.length })
        return { ok: true, query: q, items }
      }
      if (!this.ytdlp && !this.apiKey) {
        return { ok: false, error: 'VIDEO_NOT_CONFIGURED', message: '找影片功能還在準備中喔！' }
      }
      return { ok: false, error: 'VIDEO_UPSTREAM', message: '我現在找不到影片耶，等一下再試試看好嗎？' }
    }

    // 3) 精選旗標（內含黑名單硬擋）＋白名單頻道信任閘。yt-dlp 無頻道層 family-friendly
    //    欄位，兒童安全靠：精選頻道白名單過濾（preferTrusted，白名單優先空時才補）
    //    + 家長黑名單硬擋 + Data API 後備自帶 safeSearch=strict。
    const flagged = this.flagAndSort(raw)
    const items = this.preferTrusted(flagged)

    log('a1.video.search', {
      query: q,
      source: usedSource,
      raw: raw.length,
      flagged: flagged.length,
      kept: items.length,
      trustedOnly: items.length > 0 && items.length < flagged.length,
      curated: items.filter((x) => x.curated).length,
      ms: Date.now() - start,
    })

    if (items.length === 0) {
      return { ok: false, error: 'VIDEO_EMPTY', message: '我找不到適合的影片耶，換個說法再問問看？' }
    }

    // 5) 寫回影片庫：分門別類累積（去重持久化）→ 下次同主題免搜尋。
    //    存「服務出去的集合」（已套白名單閘），庫保持乾淨、離線後備也一致。
    this.bank?.accumulate(category, topic?.trim() || q, q, items)

    return { ok: true, query: q, items }
  }

  /**
   * 跑一支 search.list（含暫態重試、結果整形、curated 標記）。
   * channelId 給定時鎖定該頻道（精選頻道內搜尋）。
   * 回 {items} 或 {error}（呼叫端決定如何合併/傳遞）。
   */
  private async runQuery(
    q: string,
    channelId?: string,
    limit = MAX_RESULTS,
  ): Promise<{ items: A1VideoItem[] } | { error: A1ErrorResponse }> {
    // Data API maxResults 硬上限 50；載入更多時上抬至 fetchLimit（仍受 50 約束）。
    const maxResults = Math.min(50, Math.max(MAX_RESULTS, Math.floor(limit) || MAX_RESULTS))
    const params = new URLSearchParams({
      key: this.apiKey,
      part: 'snippet',
      q,
      type: 'video',
      safeSearch: 'strict',
      videoEmbeddable: 'true',
      maxResults: String(maxResults),
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
