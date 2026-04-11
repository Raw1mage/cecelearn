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

export interface WordLookupProvider {
  lookup(query: string): A1LookupResponse | Promise<A1LookupResponse>
}

export interface IdiomQuizProvider {
  generate(idioms: string[], questionCount: number): A2QuizResponse
}

/* A5 — Dictation Practice */

export type A5QuizItem = {
  id: string
  word: string          // 詞語或成語（答案）
  bopomofo: string      // 注音
  characters: string[]   // 逐字拆分
  sentence: string      // 含答案的例句（TTS 唸）
}

export type A5QuizResponse = {
  ok: boolean
  quizId: string
  items: A5QuizItem[]
}

export type A5QuizOptions = {
  mode: 'random' | 'curriculum' | 'custom'
  publisher?: string
  grade?: string
  lessons?: string[]
  customChars?: string
  questionCount: number
}
