import type {
  A1ErrorResponse,
  A1VideoItem,
  A1VideoSearchResponse,
  VideoSearchProvider,
} from '../contracts/providers.js'
import type { ChildChannelLibrary } from './childChannelLibrary.js'
import type { VideoBank } from './videoBank.js'

/**
 * 找影片 provider —— 小朋友問知識，小雞老師到 YouTube 找適齡影片，
 * 前端 inline 開成小播放窗。
 *
 * 用 YouTube Data API v3 的 search.list；針對 6-9 歲小朋友，安全鐵則：
 *  - safeSearch=strict（過濾不適齡內容）
 *  - videoEmbeddable=true（只回可內嵌的影片，前端 iframe 才放得出來）
 *  - type=video、regionCode=TW、relevanceLanguage=zh-Hant（在地、繁中優先）
 *
 * 兒童知識型頻道庫（選填）：命中庫內 active 頻道的結果標記 curated 並穩定排到最前——
 * 讓小朋友優先看到可信來源（前端只播第一支，等於優先播精選頻道）。
 *
 * fail-fast（DD-8 no-silent-fallback）：沒 key、API 沒開、或搜不到，
 * 都回 ErrorResponse 帶 kid-friendly 訊息，不亂塞假結果。
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

  constructor(apiKey = '', library?: ChildChannelLibrary, bank?: VideoBank) {
    this.apiKey = apiKey.trim()
    this.library = library
    this.bank = bank
    const extras = [library && 'channel library', bank && 'video bank'].filter(Boolean).join(' + ')
    if (this.apiKey) {
      console.log(`[YoutubeVideoProvider] enabled${extras ? ` (+${extras})` : ''}`)
    } else {
      console.log(`[YoutubeVideoProvider] no API key${bank ? ' (video bank only)' : ' (disabled)'}`)
    }
  }

  /** serve 時用頻道庫即時重算 curated 旗標，並穩定把精選排前。 */
  private flagAndSort(items: A1VideoItem[]): A1VideoItem[] {
    const curatedIds = this.library?.activeIds()
    const flagged = items.map((it) => ({
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

    // 2) 庫內不足 → 打 YouTube API 搜尋（沒 key 時退而求其次：庫內有多少給多少）。
    if (!this.apiKey) {
      if (this.bank && this.bank.size(category) > 0) {
        const items = this.flagAndSort(this.bank.get(category) as A1VideoItem[])
        log('a1.video.bank_only', { category, count: items.length })
        return { ok: true, query: q, items }
      }
      return { ok: false, error: 'VIDEO_NOT_CONFIGURED', message: '找影片功能還在準備中喔！' }
    }

    // 頻道庫加權（quota 友善：前端只播第一支，故精選命中就不必再打一般搜尋）：
    //  1) query 命中庫內 active 頻道主題 → 先對「最佳精選頻道」做鎖頻道搜尋。有結果就用它
    //     （第一支即精選頻道內容），只花 1 次配額。
    //  2) 沒命中、或精選頻道對這題沒料 → 退一般 safeSearch 搜尋。
    // 一般結果裡本身屬精選頻道者，runQuery 已標 curated，最後穩定排前。
    const matched = this.library?.matchActiveByText(q) ?? []
    const topChannelId = matched[0]?.channelId

    let curated: A1VideoItem[] = []
    if (topChannelId) {
      const r = await this.runQuery(q, topChannelId)
      if ('items' in r) curated = r.items
    }

    let generalItems: A1VideoItem[] = []
    let generalError: A1ErrorResponse | null = null
    if (curated.length === 0) {
      const general = await this.runQuery(q)
      if ('items' in general) generalItems = general.items
      else generalError = general.error
    }

    if (curated.length === 0 && generalError) return generalError

    const seen = new Set<string>()
    const merged: A1VideoItem[] = []
    for (const it of [...curated, ...generalItems]) {
      if (seen.has(it.videoId)) continue
      seen.add(it.videoId)
      merged.push(it)
    }
    merged.sort((a, b) => Number(b.curated) - Number(a.curated)) // 精選穩定排前

    log('a1.video.merged', {
      query: q,
      total: merged.length,
      curated: merged.filter((x) => x.curated).length,
      viaChannel: topChannelId ?? null,
      ms: Date.now() - start,
    })

    if (merged.length === 0) {
      return { ok: false, error: 'VIDEO_EMPTY', message: '我找不到適合的影片耶，換個說法再問問看？' }
    }

    // 寫回影片庫：把這次的好結果分門別類累積進該主題（去重持久化）。
    // 下次同主題就能直接從庫服務、不再打 API。
    this.bank?.accumulate(category, topic?.trim() || q, q, merged)

    return { ok: true, query: q, items: merged }
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
