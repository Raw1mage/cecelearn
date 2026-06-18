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
  | 'draw'
  | 'solve_arithmetic'
  | 'explain'
  | 'start_dictation'
  | 'start_idiom'
  | 'chat'
  | 'unclear'

export type A1DrawPayload = {
  subject: string
}

/** 小家教講解 payload（唸/打出的題目：英文題、數學應用題、概念） */
export type A1ExplainPayload = {
  subject: 'english' | 'math' | 'general'
  question: string
  steps: string[]
  answer?: string
}

export type A1SentencePayload = {
  targetWord: string
  sentences: string[]
  bopomofo?: string
}

export type A1StoryPayload = {
  topic: string
  story: string
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

/** overlay 測驗種類；對應 useConversation 的 activeOverlay 狀態（DD-4） */
export type QuizMode = 'dictation' | 'idiom'

/** 測驗完成回流對話的成績總結（DD-6） */
export type QuizSummary = {
  mode: QuizMode
  correct: number
  total: number
  maxCombo?: number   // 最高連擊（聽寫專用，成語可省略）
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
  chat: (messages: A1ChatMessage[], hint?: 'lookup') =>
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
}
