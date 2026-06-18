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

/* A1 — Dialogue Tutor (chat + illustrate)
 * 契約對齊 specs/a1_dialogue_tutor/data-schema.json。所有 Gemini 呼叫經後端 proxy。 */

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

/** 小家教講解（唸/打出的題目）：英文題、數學應用題、概念解釋。純算式仍走 solve_arithmetic。 */
export type A1ExplainPayload = {
  subject: 'english' | 'math' | 'general'
  question: string   // 小朋友唸/打出的題目（正規化後）
  steps: string[]    // 一步步講解，適齡、可朗讀
  answer?: string    // 最後答案/結論（若適用）
}

export type A1DrawPayload = {
  subject: string   // 小朋友想畫的東西（直接畫圖請求）
}

export type A1SentencePayload = {
  targetWord: string
  sentences: string[]   // 可造多句（預設 1，上限 5）
  bopomofo?: string
}

export type A1ArithmeticPayload = {
  a: number
  b: number
  operation: '+' | '-' | '*' | '/'
  expression: string
}

export type A1ChatMessage = {
  role: 'user' | 'tutor'
  text: string
  intent?: A1Intent   // 僅 tutor 訊息有
  // tutor 訊息可附富內容 payload，供對話串流 inline 渲染
  lookup?: A1LookupPayload
  sentence?: A1SentencePayload
  story?: A1StoryPayload
  arithmetic?: A1ArithmeticPayload
  explain?: A1ExplainPayload
}

export type A1StoryPayload = {
  topic: string
  story: string
}

export type A1LookupPayload = {
  character: string
  bopomofo: string
  words: A1LookupWord[]
  idioms?: A1LookupWord[]
}

export type A1ChatRequest = {
  messages: A1ChatMessage[]
  hint?: 'lookup'
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

export type A1IllustrateRequest = {
  context: string
  targetWord?: string
  /** 'scene'＝情境插畫（預設，造句/故事/畫圖）；'diagram'＝教學示意圖/圖解（explain 講解用） */
  mode?: 'scene' | 'diagram'
}

export type A1IllustrateResponse = {
  ok: true
  imageDataUri: string
  altText?: string
}

/* 拍照讀題（OCR）：小朋友對著試卷拍照 → 視覺模型辨識成題目文字，再餵進 chat→explain 流程 */
export type A1ReadQuestionRequest = {
  imageBase64: string   // 純 base64（不含 data: 前綴）
  mimeType: string      // image/jpeg | image/png | image/webp
}

export type A1ReadQuestionResponse = {
  ok: true
  question: string      // 辨識出的題目文字（保留英文/數字/符號）
}

export type A1ErrorResponse = {
  ok: false
  error: string
  message: string
}

export interface DialogueChatProvider {
  chat(messages: A1ChatMessage[], hint?: 'lookup'): Promise<A1ChatResponse | A1ErrorResponse>
}

export interface SceneIllustrationProvider {
  illustrate(
    context: string,
    targetWord?: string,
    mode?: 'scene' | 'diagram',
  ): Promise<A1IllustrateResponse | A1ErrorResponse>
}

export interface IdiomQuizProvider {
  generate(idioms: string[], questionCount: number): A2QuizResponse
}

export interface QuestionVisionProvider {
  readQuestion(
    imageBase64: string,
    mimeType: string,
  ): Promise<A1ReadQuestionResponse | A1ErrorResponse>
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
  semester?: string
  lessons?: string[]
  customChars?: string
  questionCount: number
}
