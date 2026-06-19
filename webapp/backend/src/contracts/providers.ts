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

/** 英文跟讀練習的單字（subject=english 時附帶）：單字 + 中文意思。 */
export type A1EnglishWord = {
  word: string
  meaning: string
}

/**
 * 數學圖解的「確定性視覺規格」：前端用 SVG 照畫，100% 正確，不靠生圖模型隨機性。
 * 只在 subject=math 且題目可圖像化時填。
 * - kind='count'：加減法數東西。total 起始數，operation 加/減，operand 加減量，result 結果。
 * - kind='groups'：乘除法分組。groups 組數，per 每組數量，result 結果。
 */
export type A1MathViz = {
  kind: 'count' | 'groups'
  icon?: string       // emoji（🍎🍬🍕…），預設 🔵
  total?: number
  operation?: 'add' | 'sub'
  operand?: number
  groups?: number
  per?: number
  result?: number
  equation?: string   // 如 "8 - 3 = 5"
}

/** 小家教講解（唸/打出的題目）：英文題、數學應用題、概念解釋。純算式仍走 solve_arithmetic。 */
export type A1ExplainPayload = {
  subject: 'english' | 'math' | 'general'
  question: string   // 小朋友唸/打出的題目（正規化後）
  steps: string[]    // 一步步講解，適齡、可朗讀
  answer?: string    // 最後答案/結論（若適用）
  words?: A1EnglishWord[]   // 英文題：可跟讀練習的關鍵單字（1-5 個）
  viz?: A1MathViz          // 數學題：確定性 SVG 圖解規格
}

export type A1DrawPayload = {
  subject: string   // 小朋友想畫的東西（直接畫圖請求）
}

/** 找影片（find_video）：把小朋友的好奇正規化成一條 kid-safe 的中文搜尋詞。 */
export type A1VideoPayload = {
  query: string     // 餵給 YouTube 的搜尋詞（繁中、教育向、適齡），如「恐龍 介紹 兒童」
  topic?: string    // 小朋友想知道的主題（顯示用），如「恐龍」
}

/** YouTube 搜尋結果單則（後端搜回，前端 inline 嵌入播放窗）。 */
export type A1VideoItem = {
  videoId: string
  title: string
  channelId: string
  channelTitle: string
  thumbnail: string   // 縮圖 URL
  curated?: boolean   // 命中兒童知識型頻道庫（會被加權排前、標精選）
}

/** 兒童知識型頻道庫的一筆頻道（curated channel registry）。 */
export type CuratedChannel = {
  channelId?: string   // 官方頻道 ID；pending（待確認）時可空
  title: string
  handle?: string      // @handle
  topics: string[]     // 主題關鍵詞（成語、科普、自然…），供檢索
  note?: string
  status: 'active' | 'pending'   // active 才參與搜尋加權
  addedAt: string      // YYYY-MM-DD
}

export type ChannelListResponse = {
  ok: true
  channels: CuratedChannel[]
}

/** 新增頻道入庫（管理用）。channelId 必填，其餘可選。 */
export type ChannelAddRequest = {
  channelId: string
  title?: string
  handle?: string
  topics?: string[]
  note?: string
}

export type ChannelAddResponse = {
  ok: true
  channel: CuratedChannel
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
  video?: A1VideoPayload
}

export type A1StoryPayload = {
  topic: string
  /** 接龍：這一輪的故事段落（開場一兩句，或老師接的一句），非整篇故事。 */
  story: string
  /** 接龍：把棒子交回小朋友、邀他接下去的一句話（done=true 時為空）。 */
  prompt?: string
  /** 接龍：故事是否已收尾。true＝這是結尾、不再等小朋友接。 */
  done?: boolean
}

export type A1LookupPayload = {
  character: string
  bopomofo: string
  words: A1LookupWord[]
  idioms?: A1LookupWord[]
}

export type A1ChatRequest = {
  messages: A1ChatMessage[]
  hint?: 'lookup' | 'story'
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

/* 找影片：小朋友問知識 → 小雞老師到 YouTube 找適齡影片，inline 開成小播放窗 */
export type A1VideoSearchRequest = {
  query: string   // chat 回的 A1VideoPayload.query
}

export type A1VideoSearchResponse = {
  ok: true
  query: string
  items: A1VideoItem[]   // 0-N 則，第一則當主播放窗，其餘當候選縮圖
}

export type A1ErrorResponse = {
  ok: false
  error: string
  message: string
}

export interface DialogueChatProvider {
  chat(messages: A1ChatMessage[], hint?: 'lookup' | 'story'): Promise<A1ChatResponse | A1ErrorResponse>
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

export interface VideoSearchProvider {
  search(query: string, topic?: string): Promise<A1VideoSearchResponse | A1ErrorResponse>
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
