import { useCallback, useRef, useState } from 'react'
import {
  apiClient,
  type A1ChatMessage,
  type A1ChatResponse,
  type A1VideoItem,
  type QuizMode,
  type QuizSummary,
} from '../../../shared/api/client'
import { speak } from '../../../shared/speech/tts'
import { buildTutorSpeech } from '../buildTutorSpeech'

/** 送後端的 history 上限（R5：避免 contents[] 無限膨脹）。只裁送出，不裁顯示。 */
const HISTORY_LIMIT = 16

/* ── 生圖成本閘（R8）：Nano Banana 每張付費，控制亂花費 ──
 * SESSION_AUTO_LIMIT：單一 session「自動」生圖上限；超過改 offer（手動按鈕，被動觀看不花錢）。
 * DAILY_LIMIT：每日「總」生圖（自動+手動+重畫）硬上限；超過 capped，完全停止。 */
const SESSION_AUTO_LIMIT = 8
const DAILY_LIMIT = 40
const DAILY_KEY = 'a1_illustrate_daily'

/* ── 找影片配額（YouTube Data API search 預設每日 ~100 次，留頭）：每日硬上限 ── */
const VIDEO_DAILY_LIMIT = 50
const VIDEO_DAILY_KEY = 'a1_video_daily'

function today(): string {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD
}

/** 讀今日某配額已用次數（跨日自動歸零）。 */
function readDailyKey(key: string): number {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return 0
    const parsed = JSON.parse(raw) as { date?: string; count?: number }
    if (parsed.date !== today()) return 0
    return typeof parsed.count === 'number' ? parsed.count : 0
  } catch {
    return 0
  }
}

/** 某配額今日次數 +1 並回傳新值。 */
function bumpDailyKey(key: string): number {
  const next = readDailyKey(key) + 1
  try {
    localStorage.setItem(key, JSON.stringify({ date: today(), count: next }))
  } catch {
    /* localStorage 不可用時略過，不擋功能 */
  }
  return next
}

/** 讀今日已生圖張數（跨日自動歸零）。 */
function readDailyCount(): number {
  return readDailyKey(DAILY_KEY)
}

/** 今日生圖張數 +1 並回傳新值。 */
function bumpDailyCount(): number {
  return bumpDailyKey(DAILY_KEY)
}

/** 單調遞增的訊息 id 產生器（前端唯一，供插畫掛在特定訊息、歷史不被洗）。 */
let msgSeq = 0
function nextMsgId(): string {
  msgSeq += 1
  return `m${msgSeq}_${Date.now()}`
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

/** 找影片狀態：每則 find_video tutor 訊息掛一個小播放窗。 */
export type VideoState =
  | { mode: 'loading' }
  | { mode: 'results'; topic?: string; items: A1VideoItem[] }
  | { mode: 'error'; message: string }
  /** 每日搜尋上限已達：完全停止找影片 */
  | { mode: 'capped'; message: string }

/** 影片歷史：每則 tutor 訊息 id → 該則的影片狀態。 */
export type VideoMap = Record<string, VideoState>

/**
 * 把要送給模型的歷史「補上富內容」：tutor 訊息的 text 只有引導語（reply），
 * 故事段落存在 m.story 裡、不在 text。送歷史時後端只看 m.text，模型就看不到自己
 * 上一句編的故事 → 失去接龍連續性、每輪重開新故事。這裡把故事段落＋交棒語併進
 * tutor text，讓模型看得到正在進行的故事，能接著往下編。（只影響送出的副本，不動顯示。）
 */
function enrichForModel(m: A1ChatMessage): A1ChatMessage {
  if (
    m.role === 'tutor' &&
    (m.intent === 'tell_story' || m.intent === 'continue_story') &&
    m.story?.story
  ) {
    const handback = m.story.prompt ? `（${m.story.prompt}）` : ''
    return { ...m, text: `${m.text}\n［故事進行中］${m.story.story}${handback}` }
  }
  return m
}

/** 新 intent → overlay 種類映射（DD-4）。非觸發 intent 回 null。 */
function overlayForIntent(intent: A1ChatResponse['intent']): QuizMode | null {
  if (intent === 'start_dictation') return 'dictation'
  if (intent === 'start_idiom') return 'idiom'
  if (intent === 'start_quiz') return 'quiz'
  return null
}

export function useConversation() {
  const [messages, setMessages] = useState<A1ChatMessage[]>([])
  const [currentTurn, setCurrentTurn] = useState<A1ChatResponse | null>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [illustrations, setIllustrations] = useState<IllustrationMap>({})
  const [videos, setVideos] = useState<VideoMap>({})
  /** 正在找影片的訊息 id 集合（避免同一則重複觸發） */
  const videoBusyRef = useRef<Set<string>>(new Set())
  /** 全螢幕測驗 overlay 開啟狀態（DD-4）；null = 正常對話。 */
  const [activeOverlay, setActiveOverlay] = useState<QuizMode | null>(null)
  /**
   * 故事接龍進行中（最近一則是 tell_story/continue_story 且尚未收尾）。
   * state 給 UI 顯示「接龍中」提示；ref 給 sendTurn 即時判斷要不要送 hint=story。
   */
  const [storyActive, setStoryActive] = useState(false)
  const storyActiveRef = useRef(false)
  const setStory = useCallback((on: boolean) => {
    storyActiveRef.current = on
    setStoryActive(on)
  }, [])
  /** 正在生圖的訊息 id 集合（避免同一則重複觸發） */
  const illustrateBusyRef = useRef<Set<string>>(new Set())
  /** msgId → 該則 turn payload（供手動重畫沿用情境） */
  const turnByMsgIdRef = useRef<Record<string, A1ChatResponse>>({})
  /** 本 session 已「自動」生圖張數（成本閘：超過 SESSION_AUTO_LIMIT 改 offer） */
  const sessionAutoCountRef = useRef(0)
  const fetchIllustrationRef = useRef<(msgId: string, turn: A1ChatResponse, manual?: boolean) => void>(
    () => {},
  )
  const fetchVideosRef = useRef<(msgId: string, query: string, topic?: string) => void>(() => {})

  const sendTurn = useCallback(
    async (text: string, hint?: 'lookup' | 'story') => {
      const normalized = text.trim()
      if (!normalized) {
        setStatus('請先說或輸入一句話。')
        return
      }
      // 接龍進行中：小朋友這句多半是接劇情，沒有更明確的 lookup hint 時就送 story hint，
      // 讓後端傾向 continue_story（後端仍可在小朋友明顯改要別的事時切換）。
      const effHint: 'lookup' | 'story' | undefined =
        hint ?? (storyActiveRef.current ? 'story' : undefined)

      const userMsg: A1ChatMessage = { id: nextMsgId(), role: 'user', text: normalized }
      // 顯示保留全部訊息（不裁）；只在送後端時裁 history。
      setMessages((cur) => [...cur, userMsg])
      setBusy(true)
      setStatus('小雞老師想一想…')

      try {
        const outgoing = [...messages, userMsg].slice(-HISTORY_LIMIT).map(enrichForModel)
        const res = await apiClient.chat(outgoing, effHint)
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
        if (res.explain) tutorMsg.explain = res.explain
        if (res.video) tutorMsg.video = res.video
        setMessages((cur) => [...cur, tutorMsg])
        setStatus('')
        speak(
          buildTutorSpeech({
            reply: res.reply,
            intent: res.intent,
            sentence: res.sentence,
            story: res.story,
            explain: res.explain,
          }),
          { id: tutorId },
        )
        // 測驗觸發意圖（DD-3/DD-4）：插入引導語 tutor 泡泡後開全螢幕 overlay。
        // 不 silent fallback（DD-8）：只有明確 start_dictation/start_idiom 才開。
        const overlay = overlayForIntent(res.intent)
        if (overlay) setActiveOverlay(overlay)
        // 故事接龍狀態：開場/接龍且未收尾 → 進入接龍；其餘 intent 或已收尾 → 退出接龍。
        const inStory =
          (res.intent === 'tell_story' || res.intent === 'continue_story') &&
          res.story?.done !== true
        setStory(inStory)
        // 自動生圖：illustratable 回合（造句/故事/直接畫圖）掛在該則 tutor 訊息上
        turnByMsgIdRef.current[tutorId] = res
        if (res.illustratable) fetchIllustrationRef.current(tutorId, res)
        // 找影片：find_video 回合到 YouTube 搜尋，結果掛在該則訊息上開成小播放窗
        if (res.intent === 'find_video' && res.video?.query) {
          fetchVideosRef.current(tutorId, res.video.query, res.video.topic)
        }
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
      // 故事接龍：每回合都當成長繪本配圖，不受 session 自動上限約束（只受每日硬上限）。
      const isStory = turn.intent === 'tell_story' || turn.intent === 'continue_story'
      const skipSessionCap = manual || isStory

      // session 自動上限：只擋一般自動觸發；手動與故事接龍不受此限
      if (!skipSessionCap && sessionAutoCountRef.current >= SESSION_AUTO_LIMIT) {
        setIllustrations((cur) => ({ ...cur, [msgId]: { mode: 'offer' } }))
        return
      }

      // 情境插畫（造句/故事/畫圖）；explain 不在此（英文走跟讀、數學走 SVG 圖解）
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
      if (!skipSessionCap) sessionAutoCountRef.current += 1
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

  /**
   * 找影片：到後端搜 YouTube，結果掛在 msgId 上開成小播放窗。
   * 每日硬上限（YouTube quota 防護）：超過 capped，不再送請求。
   */
  const fetchVideos = useCallback(async (msgId: string, query: string, topic?: string) => {
    if (videoBusyRef.current.has(msgId)) return

    if (readDailyKey(VIDEO_DAILY_KEY) >= VIDEO_DAILY_LIMIT) {
      setVideos((cur) => ({
        ...cur,
        [msgId]: { mode: 'capped', message: '今天找影片的次數用完囉，明天再來看！' },
      }))
      return
    }

    videoBusyRef.current.add(msgId)
    setVideos((cur) => ({ ...cur, [msgId]: { mode: 'loading' } }))
    bumpDailyKey(VIDEO_DAILY_KEY)
    try {
      const res = await apiClient.searchVideos(query, topic)
      if (!res.ok) {
        setVideos((cur) => ({ ...cur, [msgId]: { mode: 'error', message: res.message } }))
        return
      }
      setVideos((cur) => ({ ...cur, [msgId]: { mode: 'results', topic, items: res.items } }))
    } catch (error) {
      setVideos((cur) => ({
        ...cur,
        [msgId]: {
          mode: 'error',
          message: error instanceof Error ? error.message : '找影片失敗了，要不要再試一次？',
        },
      }))
    } finally {
      videoBusyRef.current.delete(msgId)
    }
  }, [])

  fetchVideosRef.current = (msgId, query, topic) => void fetchVideos(msgId, query, topic)

  /** 找影片失敗時手動重試（沿用該則 turn 的 query）。 */
  const retryVideos = useCallback(
    (msgId: string) => {
      const turn = turnByMsgIdRef.current[msgId]
      if (turn?.video?.query) void fetchVideos(msgId, turn.video.query, turn.video.topic)
    },
    [fetchVideos],
  )

  /** 直接開 overlay（快捷 chip 用，不經 Gemini intent；DD-3 雙路徑）。 */
  const openOverlay = useCallback((mode: QuizMode) => {
    setActiveOverlay(mode)
  }, [])

  /** 結束故事接龍：請小雞老師收尾（後端會回 continue_story done=true）。 */
  const endStory = useCallback(() => {
    if (!storyActiveRef.current) return
    void sendTurn('我們把故事結束吧，幫我收一個溫暖的結尾。', 'story')
  }, [sendTurn])

  /** 使用者中途關閉 overlay（不回流成績）。 */
  const closeOverlay = useCallback(() => {
    setActiveOverlay(null)
  }, [])

  /**
   * 測驗完成回流：插入一則 tutor 總結卡訊息（DD-6），並關閉 overlay。
   * 文字描述成績，quizSummary 供 ConversationView 渲染總結卡。
   */
  const onQuizComplete = useCallback((summary: QuizSummary) => {
    const label =
      summary.mode === 'dictation' ? '聽寫練習' : summary.mode === 'idiom' ? '成語練習' : '學科練習'
    const text = `你完成了${label}！答對 ${summary.correct} / ${summary.total} 題。`
    const summaryId = nextMsgId()
    const tutorMsg: A1ChatMessage = {
      id: summaryId,
      role: 'tutor',
      text,
      quizSummary: summary,
    }
    setMessages((cur) => [...cur, tutorMsg])
    setActiveOverlay(null)
    speak(text, { id: summaryId })
  }, [])

  return {
    messages,
    currentTurn,
    status,
    busy,
    illustrations,
    videos,
    activeOverlay,
    storyActive,
    sendTurn,
    endStory,
    redrawIllustration,
    retryVideos,
    openOverlay,
    closeOverlay,
    onQuizComplete,
  }
}
