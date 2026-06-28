import { useEffect, useRef } from 'react'

/**
 * 獎勵影片播放器（YouTube IFrame Player API）。
 *
 * 為什麼不用純 <iframe src="/embed/{id}">：很多 YouTube 影片的擁有者「禁止站外嵌入」
 * （error 101/150），純 iframe 只會顯示「影片擁有者已禁止在其他網站上播放」，無法偵測、
 * 無法換片。改用 IFrame Player API 監聽 onError——遇到禁止嵌入(101/150)/已移除(100)/
 * 參數錯(2)就**自動換下一支候選**，全部試完都不行才回報 onExhausted（父層收掉、露回插圖）。
 *
 * 候選來自後端找影片（已套白名單頻道信任閘）的前 N 支 videoId，依序試到一支能嵌為止。
 */

interface Props {
  ids: string[]
  /** 所有候選都無法嵌入時呼叫（父層通常收掉影片、露回插圖）。 */
  onExhausted?: () => void
}

// IFrame API 全域載入只做一次；ready 後 resolve。
let ytApiPromise: Promise<void> | null = null
function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  const w = window as unknown as { YT?: { Player: unknown }; onYouTubeIframeAPIReady?: () => void }
  if (w.YT && w.YT.Player) return Promise.resolve()
  if (ytApiPromise) return ytApiPromise
  ytApiPromise = new Promise<void>((resolve) => {
    const prev = w.onYouTubeIframeAPIReady
    w.onYouTubeIframeAPIReady = () => {
      prev?.()
      resolve()
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
  })
  return ytApiPromise
}

export function RewardVideo({ ids, onExhausted }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null)
  const idxRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    idxRef.current = 0

    loadYouTubeIframeApi().then(() => {
      if (cancelled || !hostRef.current || ids.length === 0) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const YT = (window as any).YT
      playerRef.current = new YT.Player(hostRef.current, {
        videoId: ids[0],
        width: '100%',
        height: '100%',
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onError: () => {
            // 禁止嵌入(101/150)/已移除(100)/參數錯(2)：換下一支候選。
            idxRef.current += 1
            if (idxRef.current < ids.length) {
              playerRef.current?.loadVideoById(ids[idxRef.current])
            } else {
              onExhausted?.()
            }
          },
        },
      })
    })

    return () => {
      cancelled = true
      try {
        playerRef.current?.destroy?.()
      } catch {
        /* 已卸載，忽略 */
      }
      playerRef.current = null
    }
    // ids 變了（換單字）就重建播放器；onExhausted 以 ref 穩定，毋須入依賴
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids])

  // YT.Player 會把內層 div「替換」成它自己的 iframe（會丟失 class），故用外層 .a6-reward-iframe
  // 維持「填滿插圖框」的定位，內層 target 只負責被替換成 iframe。
  return (
    <div className="a6-reward-iframe">
      <div ref={hostRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
