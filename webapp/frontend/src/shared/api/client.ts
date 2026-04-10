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
    throw new Error(`Request failed: ${response.status}`)
  }

  return (await response.json()) as T
}

export const apiClient = {
  getHealth: () => request<HealthResponse>('/health'),
  lookupWord: (query: string) =>
    request<A1LookupResponse>('/a1/lookup', {
      method: 'POST',
      body: JSON.stringify({ query }),
    }),
  generateQuiz: (idioms: string[], questionCount: number) =>
    request<A2QuizResponse>('/a2/quiz', {
      method: 'POST',
      body: JSON.stringify({ idioms, questionCount }),
    }),
}
