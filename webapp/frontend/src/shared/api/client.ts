import { env } from '../config/env'

export type HealthResponse = {
  ok: boolean
  service: string
  port: number
}

export type A1LookupWord = {
  term: string
  bopomofo: string
}

export type A1LookupResponse = {
  ok: boolean
  query: string
  character: string
  bopomofo: string
  words: A1LookupWord[]
  idioms: A1LookupWord[]
  note?: string
}

export type A2QuizItem = {
  id: string
  prompt: string
  options: string[]
  correctAnswer: number
  explanation: string
}

export type A2QuizResponse = {
  ok: boolean
  quizId: string
  items: A2QuizItem[]
}

/* A7 — Idiom Crossword（鏡像 backend contracts） */

export type A7Cell = {
  r: number
  c: number
  given: boolean
  char: string | null
  slotIdxs: number[]
}

export type A7Slot = {
  idx: number
  dir: 'H' | 'V'
  cells: { r: number; c: number }[]
  idiom: string
  example: string
  meaning: string | null
}

export type A7GridBounds = {
  minRow: number
  maxRow: number
  minCol: number
  maxCol: number
}

export type A7CrosswordPuzzle = {
  puzzleId: string
  level: number
  cells: A7Cell[]
  slots: A7Slot[]
  tray: string[]
  gridBounds: A7GridBounds
}

export type A7PuzzleResponse =
  | { ok: true; puzzle: A7CrosswordPuzzle }
  | { ok: false; error: string; message: string }

export type A7ExplainResponse =
  | { ok: true; idiom: string; meaning: string }
  | { ok: false; error: string; message: string }

/* A6 — English Vocabulary Practice */
export type A6EnglishVocabItem = {
  id: string
  word: string
  translation: string
  altText?: string
}

export type A6EnglishVocabResponse = {
  ok: boolean
  items: A6EnglishVocabItem[]
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    throw new Error(`請求失敗：${response.status}`)
  }

  return (await response.json()) as T
}

export type A5QuizItem = {
  id: string
  word: string
  bopomofo: string
  characters: string[]
  sentence: string
}

export type A5QuizResponse = {
  ok: boolean
  quizId: string
  items: A5QuizItem[]
}

/* A1 — Dialogue Tutor (鏡像 backend contracts) */

export type A1Intent =
  | 'lookup'
  | 'make_words'
  | 'make_sentence'
  | 'tell_story'
  | 'continue_story'
  | 'draw'
  | 'solve_arithmetic'
  | 'explain'
  | 'find_video'
  | 'start_dictation'
  | 'start_idiom'
  | 'start_quiz'
  | 'chat'
  | 'unclear'

export type A1DrawPayload = {
  subject: string
}

/** 找影片：小雞老師把好奇正規化成的搜尋詞 */
export type A1VideoPayload = {
  query: string
  topic?: string
}

/** YouTube 搜尋結果單則（前端 inline 嵌入播放窗） */
export type A1VideoItem = {
  videoId: string
  title: string
  channelId: string
  channelTitle: string
  thumbnail: string
  curated?: boolean   // 來自兒童知識型頻道庫（精選）
  durationSec?: number // 影片長度（秒）；yt-dlp 搜尋有，Data API 後備無
}

export type A1VideoSearchResponse = {
  ok: true
  query: string
  items: A1VideoItem[]
}

/** 影片庫各主題摘要（前端可點主題索引用，DD-28） */
export type A1VideoBankTopic = {
  topic: string
  label: string
  count: number
  updatedAt: string
}

export type A1VideoBankSummaryResponse = {
  ok: true
  topics: A1VideoBankTopic[]
}

/** 英文跟讀練習單字（subject=english 時附帶） */
export type A1EnglishWord = {
  word: string
  meaning: string
}

/** 數學圖解的確定性視覺規格（前端用 SVG 照畫） */
export type A1MathViz = {
  kind: 'count' | 'groups' | 'tally'
  icon?: string
  total?: number
  operation?: 'add' | 'sub'
  operand?: number
  groups?: number
  per?: number
  result?: number
  equation?: string
  count?: number   // tally：平鋪幾個 icon（數數量題，圖即題目，不顯示算式/答案）
  iconUrl?: string // tally/name：單元物件插畫 API path（相對 apiBaseUrl）；有此圖則平鋪此圖、無則退 emoji
  iconKey?: string // 單元物件鍵（名詞），不直接渲染
}

/** 小家教講解 payload（唸/打出的題目：英文題、數學應用題、概念） */
export type A1ExplainPayload = {
  subject: 'english' | 'math' | 'general'
  question: string
  steps: string[]
  answer?: string
  words?: A1EnglishWord[]
  viz?: A1MathViz
}

export type A1SentencePayload = {
  targetWord: string
  sentences: string[]
  bopomofo?: string
}

export type A1StoryPayload = {
  topic: string
  /** 接龍：這一輪的故事段落（開場一兩句，或老師接的一句），非整篇故事。 */
  story: string
  /** 接龍：把棒子交回小朋友、邀他接下去的一句話（done=true 時為空/省略）。 */
  prompt?: string
  /** 接龍：故事是否已收尾。true＝這是結尾、不再等小朋友接。 */
  done?: boolean
}

export type A1ArithmeticPayload = {
  a: number
  b: number
  operation: '+' | '-' | '*' | '/'
  expression: string
}

export type A1LookupPayload = {
  character: string
  bopomofo: string
  words: A1LookupWord[]
  idioms?: A1LookupWord[]
}

/** overlay 測驗種類；對應 useConversation 的 activeOverlay 狀態（DD-4）。
 * 與 game registry 的 OverlayKind 對齊（game_launch_framework）。 */
export type QuizMode = 'dictation' | 'idiom' | 'quiz' | 'crossword' | 'english_vocab'

/** 測驗完成回流對話的成績總結（DD-6） */
export type QuizSummary = {
  mode: QuizMode
  correct: number
  total: number
  maxCombo?: number   // 最高連擊（聽寫專用，成語可省略）
}

/** 學科練習單題（出題 overlay 用；鏡像 backend QuizServeItem，攤平 explain） */
export type QuizServeItem = {
  id: string
  subject: string
  type: 'fill' | 'choice' | 'make_word' | 'read_aloud'
  stem: string
  answer: string
  /** 所有應判定為正確的等價寫法（含單位變體、換算）；判題比對命中任一即算對（出題 AI 生）。 */
  acceptableAnswers?: string[]
  choices?: string[]
  steps: string[]
  viz?: A1MathViz
}

export type QuizJudgeResponse =
  | { ok: true; correct: boolean; normalizedAnswer: string; feedback: string }
  | A1ErrorResponse

/** 學科練習可選範圍（哪些科目×年級有題目） */
export type QuizRange = {
  subject: string
  subjectName: string
  grade: string
  count: number
}

export type A1ChatMessage = {
  /** 前端唯一 id（用於插畫掛在特定訊息、歷史不被洗）。後端不需此欄位。 */
  id?: string
  role: 'user' | 'tutor'
  text: string
  intent?: A1Intent
  // tutor 訊息可附富內容 payload，供對話串流 inline 渲染
  lookup?: A1LookupPayload
  sentence?: A1SentencePayload
  story?: A1StoryPayload
  draw?: A1DrawPayload
  arithmetic?: A1ArithmeticPayload
  explain?: A1ExplainPayload
  video?: A1VideoPayload
  // 測驗完成回流的成績總結卡（DD-6）；只有 tutor 訊息會帶
  quizSummary?: QuizSummary
}

export type A1ChatResponse = {
  ok: true
  intent: A1Intent
  reply: string
  lookup?: A1LookupPayload
  sentence?: A1SentencePayload
  story?: A1StoryPayload
  draw?: A1DrawPayload
  arithmetic?: A1ArithmeticPayload
  explain?: A1ExplainPayload
  video?: A1VideoPayload
  illustratable?: boolean
}

export type A1IllustrateResponse = {
  ok: true
  imageDataUri: string
  altText?: string
}

export type A1ReadQuestionResponse = {
  ok: true
  question: string
}

export type A1UtteranceCompleteResponse =
  | { ok: true; complete: boolean }
  | A1ErrorResponse

export type A1ErrorResponse = {
  ok: false
  error: string
  message: string
}

export const apiClient = {
  getHealth: () => request<HealthResponse>('/health'),
  lookupWord: (query: string) =>
    request<A1LookupResponse>('/a1/lookup', {
      method: 'POST',
      body: JSON.stringify({ query }),
    }),
  generateQuiz: (questionCount: number, mode: 'random' | 'custom' = 'random', idioms: string[] = []) =>
    request<A2QuizResponse>('/a2/quiz', {
      method: 'POST',
      body: JSON.stringify({ mode, idioms, questionCount }),
    }),
  getVocabMeta: (publisher?: string, grade?: string, semester?: string) => {
    const params = new URLSearchParams()
    if (publisher) params.set('publisher', publisher)
    if (grade) params.set('grade', grade)
    if (semester) params.set('semester', semester)
    return request<{ publishers: string[]; grades: string[]; semesters: string[]; lessons: string[] }>(`/a5/meta?${params}`)
  },
  prepareVocabQuiz: (options: {
    mode: 'random' | 'curriculum' | 'custom'
    publisher?: string
    grade?: string
    semester?: string
    lessons?: string[]
    customChars?: string
    questionCount: number
  }) =>
    request<{ ok: boolean; quizId: string; chars: string[]; total: number }>('/a5/prepare', {
      method: 'POST',
      body: JSON.stringify(options),
    }),
  fetchNextQuestion: (char: string, index: number, wordType?: string) =>
    request<A5QuizItem>('/a5/next', {
      method: 'POST',
      body: JSON.stringify({ char, index, wordType }),
    }),
  chat: (messages: A1ChatMessage[], hint?: 'lookup' | 'story') =>
    request<A1ChatResponse | A1ErrorResponse>('/a1/chat', {
      method: 'POST',
      body: JSON.stringify(hint ? { messages, hint } : { messages }),
    }),
  illustrate: (context: string, targetWord?: string, mode: 'scene' | 'diagram' = 'scene') =>
    request<A1IllustrateResponse | A1ErrorResponse>('/a1/illustrate', {
      method: 'POST',
      body: JSON.stringify({
        context,
        ...(targetWord ? { targetWord } : {}),
        ...(mode === 'diagram' ? { mode } : {}),
      }),
    }),
  readQuestion: (imageBase64: string, mimeType: string) =>
    request<A1ReadQuestionResponse | A1ErrorResponse>('/a1/read-question', {
      method: 'POST',
      body: JSON.stringify({ imageBase64, mimeType }),
    }),
  utteranceComplete: (text: string, quietRepeatCount = 0) =>
    request<A1UtteranceCompleteResponse>('/a1/utterance-complete', {
      method: 'POST',
      body: JSON.stringify({ text, quietRepeatCount }),
    }),
  searchVideos: (query: string, topic?: string, limit?: number) =>
    request<A1VideoSearchResponse | A1ErrorResponse>('/a1/videos', {
      method: 'POST',
      body: JSON.stringify({
        query,
        ...(topic ? { topic } : {}),
        ...(typeof limit === 'number' ? { limit } : {}),
      }),
    }),
  videoBankSummary: () =>
    request<A1VideoBankSummaryResponse | A1ErrorResponse>('/a1/videobank'),
  getQuizRanges: () =>
    request<{ ok: boolean; ranges: QuizRange[] }>('/quiz/meta'),
  fetchQuiz: (opts: { subject?: string; grade?: string; count: number }) => {
    const params = new URLSearchParams()
    if (opts.subject) params.set('subject', opts.subject)
    if (opts.grade) params.set('grade', opts.grade)
    params.set('count', String(opts.count))
    return request<{ ok: boolean; items: QuizServeItem[] }>(`/quiz?${params}`)
  },
  judgeQuizAnswer: (item: QuizServeItem, studentAnswer: string) =>
    request<QuizJudgeResponse>('/quiz/judge', {
      method: 'POST',
      body: JSON.stringify({
        subject: item.subject,
        type: item.type,
        stem: item.stem,
        answer: item.answer,
        acceptableAnswers: item.acceptableAnswers,
        choices: item.choices,
        studentAnswer,
      }),
    }),
  getCrosswordPuzzle: (level?: number, difficulty?: 'easy' | 'normal' | 'hard') => {
    const params = new URLSearchParams()
    if (typeof level === 'number') params.set('level', String(level))
    if (difficulty) params.set('difficulty', difficulty)
    const qs = params.toString()
    return request<A7PuzzleResponse>(`/a7/puzzle${qs ? `?${qs}` : ''}`)
  },
  explainIdiom: (idiom: string) =>
    request<A7ExplainResponse>('/a7/explain', {
      method: 'POST',
      body: JSON.stringify({ idiom }),
    }),
  fetchEnglishVocabQuiz: (count: number, stage = 'all', grade = 0, difficulty = 'all') =>
    request<A6EnglishVocabResponse>(`/a6/quiz?count=${count}&stage=${stage}&grade=${grade}&difficulty=${difficulty}`),
}
