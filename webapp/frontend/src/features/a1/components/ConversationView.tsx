import { useCallback, useEffect, useRef, useState } from 'react'
import { type A1ChatMessage } from '../../../shared/api/client'
import { type IllustrationMap, type VideoMap } from '../hooks/useConversation'
import { TurnContent } from './TurnContent'
import { VideoPlayer } from './VideoPlayer'
import { StrokeBox } from './StrokeBox'
import { Lightbox } from './Lightbox'
import { ArithmeticCard } from '../../a3/components/ArithmeticCard'
import { messageSpeech } from '../buildTutorSpeech'
import {
  speak,
  cancelSpeech,
  getPlayingSpeechId,
  subscribePlayingSpeech,
} from '../../../shared/speech/tts'

/** 單則 tutor bubble 的「重播 / 停止」鈕：正在播這則就顯示停止，否則顯示重播。 */
function BubbleSpeechButton({
  id,
  text,
  playingId,
}: {
  id: string
  text: string
  playingId: string | null
}) {
  const isPlaying = playingId === id
  return (
    <button
      type="button"
      className={`a1-bubble-speak${isPlaying ? ' a1-bubble-speak--playing' : ''}`}
      // 重播用 force：使用者明確點擊，即使全域朗讀關著也唸（比照英文跟讀的聆聽）。
      onClick={() => (isPlaying ? cancelSpeech() : speak(text, { id, force: true }))}
      aria-label={isPlaying ? '停止朗讀這段' : '重播這段'}
      title={isPlaying ? '停止' : '重播'}
    >
      {isPlaying ? '⏹' : '🔊'}
    </button>
  )
}

export type ConversationViewProps = {
  messages: A1ChatMessage[]
  busy: boolean
  /** msgId → 該則訊息的插畫狀態（歷史不被洗） */
  illustrations: IllustrationMap
  /** 重畫某則訊息的插畫 */
  onRedraw: (msgId: string) => void
  /** msgId → 該則訊息的找影片狀態（小播放窗） */
  videos: VideoMap
  /** 重新找某則訊息的影片 */
  onRetryVideos: (msgId: string) => void
  /** 影片播放/暫停狀態變化（外層據此暫停/恢復麥克風） */
  onVideoPlayingChange: (playing: boolean) => void
}

const INTENT_LABEL: Record<string, string> = {
  lookup: '查字',
  make_words: '造詞',
  make_sentence: '造句',
  tell_story: '故事',
  continue_story: '接龍',
  draw: '畫圖',
  solve_arithmetic: '算術',
  explain: '講解',
  find_video: '找影片',
  start_dictation: '聽寫',
  start_idiom: '成語',
  chat: '聊天',
  unclear: '？',
}

/** 下載 data URI 圖片（情境插畫存檔，不被洗掉） */
function downloadImage(dataUri: string, name: string) {
  const a = document.createElement('a')
  a.href = dataUri
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

/** 單則 tutor 訊息的插畫區塊（inline 在 stream 中，要顯示時才出現） */
function MessageIllustration({
  msgId,
  altText,
  state,
  onRedraw,
  onImageLoad,
}: {
  msgId: string
  altText: string
  state: IllustrationMap[string] | undefined
  onRedraw: (msgId: string) => void
  /** 圖片 bitmap 解碼完撐高容器後，通知外層追底 */
  onImageLoad: () => void
}) {
  const [zoomed, setZoomed] = useState(false)
  if (!state) return null
  if (state.mode === 'loading') {
    return (
      <div className="a1-inline-illustration a1-inline-illustration--loading">
        <div className="a1-illustration-spinner" />
        <p className="muted">小雞老師正在畫圖…</p>
      </div>
    )
  }
  if (state.mode === 'error') {
    return (
      <div className="a1-inline-illustration a1-inline-illustration--error">
        <p className="muted">{state.message}</p>
        <button className="a1-action-btn" onClick={() => onRedraw(msgId)}>
          再試一次
        </button>
      </div>
    )
  }
  if (state.mode === 'offer') {
    // session 自動上限已達：不自動畫，提供手動按鈕（被動觀看不花錢）
    return (
      <div className="a1-inline-illustration a1-inline-illustration--offer">
        <p className="muted">要小雞老師畫一張圖嗎？</p>
        <button className="a1-action-btn" onClick={() => onRedraw(msgId)}>
          畫給我看
        </button>
      </div>
    )
  }
  if (state.mode === 'capped') {
    // 每日硬上限已達：完全停止生圖
    return (
      <div className="a1-inline-illustration a1-inline-illustration--capped">
        <p className="muted">{state.message}</p>
      </div>
    )
  }
  // illustration
  const imgAlt = state.altText ?? altText
  return (
    <div className="a1-inline-illustration a1-inline-illustration--image">
      <button
        type="button"
        className="a1-zoomable"
        onClick={() => setZoomed(true)}
        aria-label={`放大看「${imgAlt}」`}
        title="點一下放大"
      >
        <img
          className="a1-illustration-img"
          src={state.imageDataUri}
          alt={imgAlt}
          onLoad={onImageLoad}
        />
      </button>
      <Lightbox open={zoomed} onClose={() => setZoomed(false)} label={imgAlt}>
        <img className="a1-lightbox__img" src={state.imageDataUri} alt={imgAlt} />
      </Lightbox>
      <div className="a1-inline-illustration-actions">
        <button
          className="a1-action-btn"
          onClick={() => downloadImage(state.imageDataUri, `小雞老師的圖_${msgId}.png`)}
          title="下載這張圖"
        >
          下載
        </button>
        <button className="a1-action-btn" onClick={() => onRedraw(msgId)} title="再畫一張">
          再畫一張
        </button>
      </div>
    </div>
  )
}

/**
 * 單一全寬對話串流（造詞泛化視窗 + 對話歷史融合）。
 * 每則 tutor 訊息：文字泡泡 reply + inline 富內容（造詞 / 造句 / 故事）
 *                 + inline 筆順(lookup) + inline 情境插畫(造句/故事/畫圖，歷史保留)。
 */
export function ConversationView({ messages, busy, illustrations, onRedraw, videos, onRetryVideos, onVideoPlayingChange }: ConversationViewProps) {
  const endRef = useRef<HTMLDivElement | null>(null)
  // 正在朗讀的 tutor 訊息 id（驅動各 bubble 鈕的 重播/停止 樣態）。
  const [playingId, setPlayingId] = useState<string | null>(getPlayingSpeechId())
  useEffect(() => subscribePlayingSpeech(setPlayingId), [])

  const scrollToBottom = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [])

  // 追底：新訊息、busy 切換、以及「新圖文」非同步塞進來時（illustrations 轉態
  // 會產新物件 → 觸發）都把視窗帶到底。圖片 bitmap 解碼撐高另由 img onLoad 補追。
  useEffect(() => {
    scrollToBottom()
  }, [messages.length, busy, illustrations, videos, scrollToBottom])

  return (
    <div className="a1-conversation-stream">
      {messages.length === 0 && !busy ? (
        <div className="a1-conv-empty">
          <p className="a1-reply-bubble">
            你好！我是小雞老師，可以說「用蘋果造句」、「花可以組什麼詞」、「蘋果的蘋」、「3 乘 7 怎麼算」、「說一個故事」或「畫一隻貓」。也可以把考卷上的題目唸給我聽，像「This is a cat 是什麼意思」或「小明有 5 顆糖給了弟弟 2 顆還剩幾顆」，我會一步一步講解給你聽喔！想看影片認識新東西也可以說「我想看恐龍的影片」，我幫你找一段來看！
          </p>
        </div>
      ) : (
        messages.map((m) => {
          const key = m.id ?? `${m.role}-${m.text}`
          const strokeChar =
            m.role === 'tutor' && m.intent === 'lookup' ? m.lookup?.character ?? null : null
          // 小雞老師講的內容可重播：用與自動朗讀相同的文字（reply + 造句/故事/講解步驟）。
          const speakText = m.role === 'tutor' ? messageSpeech(m) : ''
          return (
            <div
              key={key}
              className={`a1-conv-msg a1-conv-msg--${m.role}${m.video ? ' a1-conv-msg--media' : ''}`}
            >
              <div className="a1-conv-head">
                <span className="a1-conv-role">
                  {m.role === 'user' ? '我' : '小雞老師'}
                  {m.intent && INTENT_LABEL[m.intent] ? `・${INTENT_LABEL[m.intent]}` : ''}
                </span>
                {m.role === 'tutor' && m.id && speakText && (
                  <BubbleSpeechButton id={m.id} text={speakText} playingId={playingId} />
                )}
              </div>
              <div className="a1-conv-body">
                <p className="a1-conv-text">{m.text}</p>
                {m.role === 'tutor' && m.quizSummary && (
                  <div className={`a1-quiz-summary a1-quiz-summary--${m.quizSummary.mode}`}>
                    <span className="a1-quiz-summary__title">
                      {m.quizSummary.mode === 'dictation'
                        ? '聽寫成績'
                        : m.quizSummary.mode === 'idiom'
                          ? '成語成績'
                          : '學科成績'}
                    </span>
                    <div className="a1-quiz-summary__stats">
                      <span className="a1-quiz-summary__stat">
                        <strong>{m.quizSummary.correct}</strong>
                        <small>答對</small>
                      </span>
                      <span className="a1-quiz-summary__stat">
                        <strong>{m.quizSummary.total}</strong>
                        <small>總題數</small>
                      </span>
                      {m.quizSummary.maxCombo != null && (
                        <span className="a1-quiz-summary__stat">
                          <strong>{m.quizSummary.maxCombo}</strong>
                          <small>最高連擊</small>
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {m.role === 'tutor' && <TurnContent message={m} />}
                {m.role === 'tutor' && m.arithmetic && (
                  <div className="a1-arithmetic-surface" data-surface-mode="inline">
                    <ArithmeticCard
                      a={m.arithmetic.a}
                      b={m.arithmetic.b}
                      operation={m.arithmetic.operation}
                      compact
                      autoStart
                    />
                  </div>
                )}
                {strokeChar && <StrokeBox char={strokeChar} />}
                {m.role === 'tutor' && m.id && (
                  <MessageIllustration
                    msgId={m.id}
                    altText={m.draw?.subject ?? m.sentence?.targetWord ?? m.story?.topic ?? m.explain?.question ?? '情境插圖'}
                    state={illustrations[m.id]}
                    onRedraw={onRedraw}
                    onImageLoad={scrollToBottom}
                  />
                )}
                {m.role === 'tutor' && m.id && (
                  <VideoPlayer
                    msgId={m.id}
                    state={videos[m.id]}
                    onRetry={onRetryVideos}
                    onPlayingChange={onVideoPlayingChange}
                  />
                )}
              </div>
            </div>
          )
        })
      )}
      {busy && (
        <div className="a1-conv-msg a1-conv-msg--tutor">
          <span className="a1-conv-role">小雞老師</span>
          <div className="a1-conv-body">
            <div
              className="a1-thinking-spinner"
              role="status"
              aria-label="小雞老師思考中"
            />
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  )
}
