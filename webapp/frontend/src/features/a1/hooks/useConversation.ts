import { useCallback, useRef, useState } from 'react'
import {
  apiClient,
  type A1ChatMessage,
  type A1ChatResponse,
  type QuizMode,
  type QuizSummary,
} from '../../../shared/api/client'
import { speak } from '../../../shared/speech/tts'

/** 送後端的 history 上限（R5：避免 contents[] 無限膨脹）。只裁送出，不裁顯示。 */
const HISTORY_LIMIT = 16

/* ── 生圖成本閘（R8）：Nano Banana 每張付費，控制亂花費 ──
 * SESSION_AUTO_LIMIT：單一 session「自動」生圖上限；超過改 offer（手動按鈕，被動觀看不花錢）。
 * DAILY_LIMIT：每日「總」生圖（自動+手動+重畫）硬上限；超過 capped，完全停止。 */
const SESSION_AUTO_LIMIT = 8
const DAILY_LIMIT = 40
const DAILY_KEY = 'a1_illustrate_daily'

function today(): string {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD
}

/** 讀今日已生圖張數（跨日自動歸零）。 */
function readDailyCount(): number {
  try {
    const raw = localStorage.getItem(DAILY_KEY)
    if (!raw) return 0
    const parsed = JSON.parse(raw) as { date?: string; count?: number }
    if (parsed.date !== today()) return 0
    return typeof parsed.count === 'number' ? parsed.count : 0
  } catch {
    return 0
  }
}

/** 今日生圖張數 +1 並回傳新值。 */
function bumpDailyCount(): number {
  const next = readDailyCount() + 1
  try {
    localStorage.setItem(DAILY_KEY, JSON.stringify({ date: today(), count: next }))
  } catch {
    /* localStorage 不可用時略過，不擋功能 */
  }
  return next
}

/** 單調遞增的訊息 id 產生器（前端唯一，供插畫掛在特定訊息、歷史不被洗）。 */
let msgSeq = 0
function nextMsgId(): string {
  msgSeq += 1
  return `m${msgSeq}_${Date.now()}`
}

/**
 * 組出要朗讀的文字：引導語 reply + 內容本體（造句逐句 / 故事）。
 * 造詞/查字/算術步驟不唸完整工具內容（太碎），只唸 reply。
 */
function buildSpeech(res: A1ChatResponse): string {
  const parts: string[] = [res.reply]
  if (res.intent === 'make_sentence' && res.sentence?.sentences?.length) {
    parts.push(...res.sentence.sentences)
  } else if (res.intent === 'tell_story' && res.story?.story) {
    parts.push(res.story.story)
  }
  return parts.filter(Boolean).join('。')
}

export type IllustrationState =
  | { mode: 'loading' }
  | { mode: 'illustration'; imageDataUri: string; altText?: string }
  | { mode: 'error'; message: string }
  /** session 自動上限已達：不自動畫，提供手動「畫給我看」按鈕（被動觀看不花錢） */
  | { mode: 'offer' }
  /** 每日硬上限已達：完全停止生圖 */
  | { mode: 'capped'; message: string }

/** 插畫歷史：每則 tutor 訊息 id → 該則的插畫狀態（不覆蓋、不被洗）。 */
export type IllustrationMap = Record<string, IllustrationState>

/** 新 intent → overlay 種類映射（DD-4）。非觸發 intent 回 null。 */
function overlayForIntent(intent: A1ChatResponse['intent']): QuizMode | null {
  if (intent === 'start_dictation') return 'dictation'
  if (intent === 'start_idiom') return 'idiom'
  return null
}

export function useConversation() {
  const [messages, setMessages] = useState<A1ChatMessage[]>([])
  const [currentTurn, setCurrentTurn] = useState<A1ChatResponse | null>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [illustrations, setIllustrations] = useState<IllustrationMap>({})
  /** 全螢幕測驗 overlay 開啟狀態（DD-4）；null = 正常對話。 */
  const [activeOverlay, setActiveOverlay] = useState<QuizMode | null>(null)
  /** 正在生圖的訊息 id 集合（避免同一則重複觸發） */
  const illustrateBusyRef = useRef<Set<string>>(new Set())
  /** msgId → 該則 turn payload（供手動重畫沿用情境） */
  const turnByMsgIdRef = useRef<Record<string, A1ChatResponse>>({})
  /** 本 session 已「自動」生圖張數（成本閘：超過 SESSION_AUTO_LIMIT 改 offer） */
  const sessionAutoCountRef = useRef(0)
  const fetchIllustrationRef = useRef<(msgId: string, turn: A1ChatResponse, manual?: boolean) => void>(
    () => {},
  )

  const sendTurn = useCallback(
    async (text: string, hint?: 'lookup') => {
      const normalized = text.trim()
      if (!normalized) {
        setStatus('請先說或輸入一句話。')
        return
      }

      const userMsg: A1ChatMessage = { id: nextMsgId(), role: 'user', text: normalized }
      // 顯示保留全部訊息（不裁）；只在送後端時裁 history。
      setMessages((cur) => [...cur, userMsg])
      setBusy(true)
      setStatus('小雞老師想一想…')

      try {
        const outgoing = [...messages, userMsg].slice(-HISTORY_LIMIT)
        const res = await apiClient.chat(outgoing, hint)
        if (!res.ok) {
          setStatus(res.message)
          setBusy(false)
          return
        }
        setCurrentTurn(res)
        const tutorId = nextMsgId()
        const tutorMsg: A1ChatMessage = {
          id: tutorId,
          role: 'tutor',
          text: res.reply,
          intent: res.intent,
        }
        if (res.lookup) tutorMsg.lookup = res.lookup
        if (res.sentence) tutorMsg.sentence = res.sentence
        if (res.story) tutorMsg.story = res.story
        if (res.draw) tutorMsg.draw = res.draw
        if (res.arithmetic) tutorMsg.arithmetic = res.arithmetic
        setMessages((cur) => [...cur, tutorMsg])
        setStatus('')
        speak(buildSpeech(res))
        // 測驗觸發意圖（DD-3/DD-4）：插入引導語 tutor 泡泡後開全螢幕 overlay。
        // 不 silent fallback（DD-8）：只有明確 start_dictation/start_idiom 才開。
        const overlay = overlayForIntent(res.intent)
        if (overlay) setActiveOverlay(overlay)
        // 自動生圖：illustratable 回合（造句/故事/直接畫圖）掛在該則 tutor 訊息上
        turnByMsgIdRef.current[tutorId] = res
        if (res.illustratable) fetchIllustrationRef.current(tutorId, res)
      } catch (error) {
        setStatus(error instanceof Error ? error.message : '小雞老師剛剛打瞌睡了，請再說一次。')
      } finally {
        setBusy(false)
      }
    },
    [messages],
  )

  /**
   * 依 turn payload 生圖，結果掛在 msgId 上（不覆蓋其他訊息的圖）。
   * 成本閘（R8）：
   *  - manual=false（自動觸發）：先檢查每日硬上限 → capped；再檢查 session 自動上限 → offer（不畫，給按鈕）。
   *  - manual=true（手動「畫給我看」/重畫）：略過 session 自動上限，但仍受每日硬上限約束。
   *  - 真正送出 API 前才 bump 計數（offer/capped 不計費、不計數）。
   */
  const fetchIllustration = useCallback(
    async (msgId: string, turn: A1ChatResponse, manual = false) => {
      if (illustrateBusyRef.current.has(msgId)) return
      if (!turn.illustratable) return

      // 每日硬上限：自動與手動都擋
      if (readDailyCount() >= DAILY_LIMIT) {
        setIllustrations((cur) => ({
          ...cur,
          [msgId]: { mode: 'capped', message: '今天的畫圖次數用完囉，明天再來畫！' },
        }))
        return
      }
      // session 自動上限：只擋自動觸發，手動仍可畫
      if (!manual && sessionAutoCountRef.current >= SESSION_AUTO_LIMIT) {
        setIllustrations((cur) => ({ ...cur, [msgId]: { mode: 'offer' } }))
        return
      }

      const context =
        turn.sentence?.sentences?.[0] ??
        turn.story?.story ??
        turn.draw?.subject ??
        turn.reply
      const targetWord =
        turn.sentence?.targetWord ?? turn.story?.topic ?? turn.draw?.subject

      illustrateBusyRef.current.add(msgId)
      setIllustrations((cur) => ({ ...cur, [msgId]: { mode: 'loading' } }))
      // 計入配額（真正要送 API 才計）：每日 +1；自動觸發另計 session 自動數
      bumpDailyCount()
      if (!manual) sessionAutoCountRef.current += 1
      try {
        const res = await apiClient.illustrate(context, targetWord)
        if (!res.ok) {
          setIllustrations((cur) => ({ ...cur, [msgId]: { mode: 'error', message: res.message } }))
          return
        }
        setIllustrations((cur) => ({
          ...cur,
          [msgId]: { mode: 'illustration', imageDataUri: res.imageDataUri, altText: res.altText },
        }))
      } catch (error) {
        setIllustrations((cur) => ({
          ...cur,
          [msgId]: {
            mode: 'error',
            message: error instanceof Error ? error.message : '畫圖失敗了，要不要再試一次？',
          },
        }))
      } finally {
        illustrateBusyRef.current.delete(msgId)
      }
    },
    [],
  )

  fetchIllustrationRef.current = (msgId: string, turn: A1ChatResponse, manual = false) =>
    void fetchIllustration(msgId, turn, manual)

  /**
   * 手動重畫 / 從 offer 觸發生圖（沿用該則 turn 的情境）。
   * manual=true：略過 session 自動上限（使用者主動要求），但仍受每日硬上限約束。
   */
  const redrawIllustration = useCallback(
    (msgId: string) => {
      const turn = turnByMsgIdRef.current[msgId]
      if (turn) void fetchIllustration(msgId, turn, true)
    },
    [fetchIllustration],
  )

  /** 直接開 overlay（快捷 chip 用，不經 Gemini intent；DD-3 雙路徑）。 */
  const openOverlay = useCallback((mode: QuizMode) => {
    setActiveOverlay(mode)
  }, [])

  /** 使用者中途關閉 overlay（不回流成績）。 */
  const closeOverlay = useCallback(() => {
    setActiveOverlay(null)
  }, [])

  /**
   * 測驗完成回流：插入一則 tutor 總結卡訊息（DD-6），並關閉 overlay。
   * 文字描述成績，quizSummary 供 ConversationView 渲染總結卡。
   */
  const onQuizComplete = useCallback((summary: QuizSummary) => {
    const label = summary.mode === 'dictation' ? '聽寫' : '成語'
    const text = `你完成了${label}練習！答對 ${summary.correct} / ${summary.total} 題。`
    const tutorMsg: A1ChatMessage = {
      id: nextMsgId(),
      role: 'tutor',
      text,
      quizSummary: summary,
    }
    setMessages((cur) => [...cur, tutorMsg])
    setActiveOverlay(null)
    speak(text)
  }, [])

  return {
    messages,
    currentTurn,
    status,
    busy,
    illustrations,
    activeOverlay,
    sendTurn,
    redrawIllustration,
    openOverlay,
    closeOverlay,
    onQuizComplete,
  }
}
