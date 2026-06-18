import { useCallback, useEffect, useRef } from 'react'
import { type A1ChatMessage } from '../../../shared/api/client'
import { type IllustrationMap } from '../hooks/useConversation'
import { TurnContent } from './TurnContent'
import { StrokeBox } from './StrokeBox'
import { ArithmeticCard } from '../../a3/components/ArithmeticCard'

export type ConversationViewProps = {
  messages: A1ChatMessage[]
  busy: boolean
  /** msgId → 該則訊息的插畫狀態（歷史不被洗） */
  illustrations: IllustrationMap
  /** 重畫某則訊息的插畫 */
  onRedraw: (msgId: string) => void
}

const INTENT_LABEL: Record<string, string> = {
  lookup: '查字',
  make_words: '造詞',
  make_sentence: '造句',
  tell_story: '故事',
  draw: '畫圖',
  solve_arithmetic: '算術',
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
  return (
    <div className="a1-inline-illustration a1-inline-illustration--image">
      <img
        className="a1-illustration-img"
        src={state.imageDataUri}
        alt={state.altText ?? altText}
        onLoad={onImageLoad}
      />
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
export function ConversationView({ messages, busy, illustrations, onRedraw }: ConversationViewProps) {
  const endRef = useRef<HTMLDivElement | null>(null)

  const scrollToBottom = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [])

  // 追底：新訊息、busy 切換、以及「新圖文」非同步塞進來時（illustrations 轉態
  // 會產新物件 → 觸發）都把視窗帶到底。圖片 bitmap 解碼撐高另由 img onLoad 補追。
  useEffect(() => {
    scrollToBottom()
  }, [messages.length, busy, illustrations, scrollToBottom])

  return (
    <div className="a1-conversation-stream">
      {messages.length === 0 && !busy ? (
        <div className="a1-conv-empty">
          <p className="a1-reply-bubble">
            你好！我是小雞老師，可以說「用蘋果造句」、「用開心造三個句子」、「花可以組什麼詞」、「蘋果的蘋」、「3 乘 7 怎麼算」、「說一個故事」或「畫一隻貓」喔！
          </p>
        </div>
      ) : (
        messages.map((m) => {
          const key = m.id ?? `${m.role}-${m.text}`
          const strokeChar =
            m.role === 'tutor' && m.intent === 'lookup' ? m.lookup?.character ?? null : null
          return (
            <div key={key} className={`a1-conv-msg a1-conv-msg--${m.role}`}>
              <span className="a1-conv-role">
                {m.role === 'user' ? '我' : '小雞老師'}
                {m.intent && INTENT_LABEL[m.intent] ? `・${INTENT_LABEL[m.intent]}` : ''}
              </span>
              <div className="a1-conv-body">
                <p className="a1-conv-text">{m.text}</p>
                {m.role === 'tutor' && m.quizSummary && (
                  <div className={`a1-quiz-summary a1-quiz-summary--${m.quizSummary.mode}`}>
                    <span className="a1-quiz-summary__title">
                      {m.quizSummary.mode === 'dictation' ? '聽寫成績' : '成語成績'}
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
                    altText={m.draw?.subject ?? m.sentence?.targetWord ?? m.story?.topic ?? '情境插圖'}
                    state={illustrations[m.id]}
                    onRedraw={onRedraw}
                    onImageLoad={scrollToBottom}
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
            <p className="a1-conv-text a1-conv-text--thinking">小雞老師想一想…</p>
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  )
}
