import { useEffect, useRef } from 'react'
import { type VideoState } from '../hooks/useConversation'

/**
 * 對話串流中的小播放窗（find_video intent）。
 *
 * - 主播放窗用 YouTube IFrame Player API（不是裸 iframe）——這樣才拿得到「開始播放／
 *   播完」事件，好在播放時暫停麥克風、播完再自動開回（不然影片聲音會被小雞老師聽到、
 *   亂觸發辨識）。
 * - 自適應容器寬度（不再鎖死 480px）。
 * - 不顯示候選／相關影片連結，避免分散小朋友注意力。
 *
 * 安全：影片本身已由後端 safeSearch=strict + videoEmbeddable 過濾過；用 nocookie host。
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type YTNamespace = any

/** 單例載入 IFrame API；resolve 出 window.YT。重複呼叫共用同一個 promise。 */
let ytApiPromise: Promise<YTNamespace> | null = null
function loadYouTubeApi(): Promise<YTNamespace> {
  const w = window as any
  if (w.YT && w.YT.Player) return Promise.resolve(w.YT)
  if (ytApiPromise) return ytApiPromise
  ytApiPromise = new Promise<YTNamespace>((resolve) => {
    const prev = w.onYouTubeIframeAPIReady
    w.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') {
        try {
          prev()
        } catch {
          /* 別人的 handler 出錯不影響我們 */
        }
      }
      resolve(w.YT)
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
  })
  return ytApiPromise
}

export function VideoPlayer({
  msgId,
  state,
  onRetry,
  onPlayingChange,
}: {
  msgId: string
  state: VideoState | undefined
  onRetry: (msgId: string) => void
  /** 影片開始播放 → true（外層據此暫停麥克風）；暫停/播完 → false（外層恢復麥克風）。 */
  onPlayingChange?: (playing: boolean) => void
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  // onPlayingChange 放 ref，effect 只依 videoId，避免父層重渲染害 player 一直重建。
  const cbRef = useRef(onPlayingChange)
  cbRef.current = onPlayingChange

  const videoId = state?.mode === 'results' ? state.items[0]?.videoId : undefined

  useEffect(() => {
    if (!videoId || !hostRef.current) return
    let cancelled = false
    let player: any = null
    let lastPlaying: boolean | null = null
    const notify = (playing: boolean) => {
      if (lastPlaying === playing) return
      lastPlaying = playing
      cbRef.current?.(playing)
    }

    loadYouTubeApi().then((YT) => {
      if (cancelled || !hostRef.current) return
      // YT.Player 會把這個 mount 節點「換成」iframe；放一個子節點供它替換。
      const mount = document.createElement('div')
      hostRef.current.appendChild(mount)
      player = new YT.Player(mount, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        host: 'https://www.youtube-nocookie.com',
        events: {
          onStateChange: (e: any) => {
            const S = YT.PlayerState
            if (e.data === S.PLAYING) notify(true)
            else if (e.data === S.PAUSED || e.data === S.ENDED) notify(false)
          },
        },
      })
    })

    return () => {
      cancelled = true
      // 卸載／換片：確保把麥克風還回去（不然停在「播放中→麥克風關」狀態）
      notify(false)
      try {
        player?.destroy?.()
      } catch {
        /* ok */
      }
      if (hostRef.current) hostRef.current.innerHTML = ''
    }
  }, [videoId])

  if (!state) return null

  if (state.mode === 'loading') {
    return (
      <div className="a1-inline-video a1-inline-video--loading">
        <div className="a1-illustration-spinner" />
        <p className="muted">小雞老師正在找影片…</p>
      </div>
    )
  }
  if (state.mode === 'error') {
    return (
      <div className="a1-inline-video a1-inline-video--error">
        <p className="muted">{state.message}</p>
        <button className="a1-action-btn" onClick={() => onRetry(msgId)}>
          再找一次
        </button>
      </div>
    )
  }
  if (state.mode === 'capped') {
    return (
      <div className="a1-inline-video a1-inline-video--capped">
        <p className="muted">{state.message}</p>
      </div>
    )
  }

  // results
  const items = state.items
  if (items.length === 0) return null
  const active = items[0]

  return (
    <div className="a1-inline-video a1-inline-video--player">
      <div className="a1-video-frame" ref={hostRef} />
      <p className="a1-video-title">
        {active.curated && (
          <span className="a1-video-badge" title={`精選頻道：${active.channelTitle}`}>
            ⭐ 精選頻道
          </span>
        )}
        {active.title}
      </p>
    </div>
  )
}
