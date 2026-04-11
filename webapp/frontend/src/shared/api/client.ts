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
}
