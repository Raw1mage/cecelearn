import { execFile } from 'node:child_process'
import type { A1VideoItem } from '../contracts/providers.js'

/**
 * yt-dlp 客戶端——被動函式式 YouTube metadata 抓取（取代熱 service Invidious）。
 *
 * 為什麼用 yt-dlp 而非 Invidious：Invidious 是「伺服器形狀」（連線池 / 反爬 token /
 * postgres，需 3 容器常駐 daemon）；cecelearn 的找影片只是 `query → 清單` 的被動需求，
 * yt-dlp 是「函式形狀」——呼叫才 spawn 進程去爬、回 metadata 就退出，無 daemon / docker /
 * postgres。播放仍走真實 YouTube videoId 的 iframe，只換「搜尋 / metadata」這層。
 *
 * 兒童安全：yt-dlp 沒有 Invidious 的頻道 isFamilyFriendly 欄位，故不做頻道層軟過濾；
 * 安全全靠上層 YoutubeVideoProvider 的「精選頻道白名單（排前）+ 家長黑名單（硬擋）」兩道閘。
 *
 * 失敗策略：spawn 失敗 / 逾時 / 解析失敗一律回 null（上層保守處理，退 Data API 或影片庫）。
 */

type FlatEntry = {
  id?: string
  title?: string
  channel?: string
  channel_id?: string
  uploader?: string
  uploader_id?: string
}

function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...fields, ts: Date.now() }))
}

const EXEC_TIMEOUT_MS = 20000
const MAX_BUFFER = 16 * 1024 * 1024 // flat-playlist NDJSON 可能不小

export class YtDlpVideoProvider {
  private bin: string

  constructor(binPath: string) {
    this.bin = binPath.trim() || 'yt-dlp'
    console.log(`[YtDlpVideoProvider] bin=${this.bin}`)
  }

  /** 設定的 binary 路徑（啟動 probe / 診斷用）。 */
  binary(): string {
    return this.bin
  }

  /**
   * 啟動 probe：跑 `yt-dlp --version` 確認 binary 可用。
   * 回 true=可用；false=找不到 / 跑不起來（呼叫端只 log warn、不崩）。
   */
  async ping(): Promise<boolean> {
    try {
      const out = await this.run(['--version'], 8000)
      return out.trim().length > 0
    } catch {
      return false
    }
  }

  /**
   * 影片搜尋。打 `ytsearchN:<q>` 取 flat metadata（不下載）；失敗回 null。
   * thumbnail 用 i.ytimg 直連（穩定、不靠 yt-dlp 回的縮圖 URL）。
   */
  async search(q: string, limit = 12): Promise<A1VideoItem[] | null> {
    const query = q.trim()
    if (!query) return null
    try {
      const out = await this.run([
        `ytsearch${limit}:${query}`,
        '--flat-playlist',
        '--dump-json',
        '--no-warnings',
        '--ignore-errors',
      ])
      return this.parseEntries(out)
    } catch (err) {
      log('a1.video.ytdlp_search_exception', {
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }

  /** 把 yt-dlp 的 NDJSON（每行一支影片）解析成 A1VideoItem[]。 */
  private parseEntries(ndjson: string): A1VideoItem[] {
    const items: A1VideoItem[] = []
    for (const line of ndjson.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      let e: FlatEntry
      try {
        e = JSON.parse(trimmed) as FlatEntry
      } catch {
        continue
      }
      if (!e.id || !e.title) continue
      items.push({
        videoId: e.id,
        title: e.title,
        channelId: e.channel_id ?? e.uploader_id ?? '',
        channelTitle: e.channel ?? e.uploader ?? '',
        thumbnail: `https://i.ytimg.com/vi/${e.id}/mqdefault.jpg`,
        curated: false,
      })
    }
    return items
  }

  /** spawn yt-dlp，回 stdout（非零 exit 但有 stdout 仍回，靠 --ignore-errors 容錯）。 */
  private run(args: string[], timeoutMs = EXEC_TIMEOUT_MS): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        this.bin,
        args,
        { timeout: timeoutMs, maxBuffer: MAX_BUFFER },
        (err, stdout, stderr) => {
          // --ignore-errors 下個別影片失敗會非零 exit，但 stdout 仍有好資料 → 容忍。
          if (err && !stdout) {
            reject(new Error(stderr?.slice(0, 200) || err.message))
            return
          }
          resolve(stdout)
        },
      )
    })
  }
}
