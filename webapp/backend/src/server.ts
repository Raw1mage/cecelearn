import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { loadEnv } from './config/env.js'
import { initAccessLog, logAccess } from './logging/accessLog.js'
import { initRequestLog, logRequest, createRequestId, logUpstream } from './logging/requestLog.js'
import { createA1Module } from './modules/a1.js'
import { createA2Module } from './modules/a2.js'
import { GeminiChatProvider } from './providers/geminiChatProvider.js'
import { OpencodeBareChatProvider } from './providers/opencodeBareChatProvider.js'
import { CascadeChatProvider } from './providers/cascadeChatProvider.js'
import { GeminiImageProvider } from './providers/geminiImageProvider.js'
import { VertexImageProvider } from './providers/vertexImageProvider.js'
import { CascadeImageProvider } from './providers/cascadeImageProvider.js'
import { GeminiVisionProvider } from './providers/geminiVisionProvider.js'
import { YoutubeVideoProvider } from './providers/youtubeVideoProvider.js'
import { ChildChannelLibrary } from './providers/childChannelLibrary.js'
import { VideoBank } from './providers/videoBank.js'
import { InvidiousClient } from './providers/invidiousClient.js'
import { ImagenVertexProvider } from './providers/imagenVertexProvider.js'
import type { DialogueChatProvider, SceneIllustrationProvider } from './contracts/providers.js'
import { IdiomQuizEngine } from './providers/idiomQuizEngine.js'
import { MoeWordLookupProvider } from './providers/moeProvider.js'
import { VocabQuizEngine } from './providers/vocabQuizEngine.js'
import { QuizBankProvider } from './providers/quizBankProvider.js'
import { QuizGenProvider } from './providers/quizGenProvider.js'
import type { A1ChatMessage } from './contracts/providers.js'

const env = loadEnv()
initAccessLog(resolve(process.env.HOME || '/tmp', '.local/state/cecelearn/logs/access.log'))
initRequestLog(resolve(process.env.HOME || '/tmp', '.local/state/cecelearn/logs/request.log'))
function buildImageProvider(): SceneIllustrationProvider {
  // vertexImage 在 'vertex' / 'cascade' 模式下必存在（loadEnv 已 fail-fast 驗證）
  if (env.imageProvider === 'vertex') {
    return new VertexImageProvider(env.vertexImage!)
  }
  if (env.imageProvider === 'cascade') {
    // 成本分層：先免費 apikey（Gemini 多模態）→ 撞 429/502/空回 掉接 Imagen 4（福利點數）。
    // 後備層用 Imagen 4 而非 Gemini-on-Vertex：Imagen 是專門 T2I，每次都出圖、不會空回文字。
    const v = env.vertexImage!
    return new CascadeImageProvider(
      new GeminiImageProvider(env.geminiApiKeys),
      new ImagenVertexProvider({
        project: v.project,
        location: v.location,
        model: v.imagenModel,
        keyFile: v.keyFile,
        apiKeys: env.geminiApiKeys, // 中文→英文 prompt 翻譯（Imagen 只吃英文）
      }),
      { primary: 'apikey', secondary: 'imagen' },
    )
  }
  return new GeminiImageProvider(env.geminiApiKeys)
}

function buildChatProvider(): DialogueChatProvider {
  const gemini = new GeminiChatProvider(env.geminiApiKeys)
  // bareChat 在 'bare' / 'cascade' 模式下必存在（loadEnv 已 fail-fast 驗證）
  if (env.chatProvider === 'bare') {
    return new OpencodeBareChatProvider(env.bareChat!)
  }
  if (env.chatProvider === 'cascade') {
    // 主→備：Claude（bare session 借訂閱）連線/結構化失敗才掉接 Gemini（使用者授權）
    return new CascadeChatProvider(new OpencodeBareChatProvider(env.bareChat!), gemini, {
      primary: 'claude-bare',
      secondary: 'gemini',
    })
  }
  return gemini
}

const channelLibrary = new ChildChannelLibrary()
const videoBank = new VideoBank()
const invidious = env.invidiousApiUrl ? new InvidiousClient(env.invidiousApiUrl) : undefined
const a1 = createA1Module(
  new MoeWordLookupProvider(env.geminiApiKeys),
  buildChatProvider(),
  buildImageProvider(),
  new GeminiVisionProvider(env.geminiApiKeys),
  new YoutubeVideoProvider(env.youtubeApiKey, channelLibrary, videoBank, invidious),
  channelLibrary,
  videoBank,
)
const idiomEngine = new IdiomQuizEngine()
const a2 = createA2Module(idiomEngine)
const vocabEngine = new VocabQuizEngine(env.geminiApiKeys)
const quizBank = new QuizBankProvider() // 事實科（自然/社會）事實種子池
const quizGen = new QuizGenProvider(env.geminiApiKeys, quizBank) // 全科 runtime 動態生

function sendJson(response: import('node:http').ServerResponse, statusCode: number, body: unknown) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(body))
}

function readBody(request: import('node:http').IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => resolve(body))
    request.on('error', reject)
  })
}

const server = createServer(async (request, response) => {
  const startTime = Date.now()
  const reqId = createRequestId()
  response.on('finish', () => logAccess(request, response, startTime))
  const { method = 'GET' } = request
  // Strip PUBLIC_BASE_PATH prefix so route matching stays path-agnostic
  let url = request.url || '/'
  if (env.basePath && url.startsWith(env.basePath)) {
    url = url.slice(env.basePath.length) || '/'
  }

  const send = (statusCode: number, body: unknown, reqBody?: string) => {
    const resBody = JSON.stringify(body)
    response.writeHead(statusCode, { 'Content-Type': 'application/json' })
    response.end(resBody)
    logRequest(reqId, method, url, statusCode, Date.now() - startTime,
      request.headers['content-type'], reqBody, resBody)
  }

  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (method === 'OPTIONS') {
    response.writeHead(204)
    response.end()
    return
  }

  if (url === '/api/health' && method === 'GET') {
    send(200, { ok: true, service: '小雞老師-backend', port: env.port })
    return
  }

  if (url === '/api/a1' && method === 'GET') {
    send(501, { ok: false, status: 'not_implemented', path: url })
    return
  }

  if (url === '/api/a2' && method === 'GET') {
    send(501, { ok: false, status: 'not_implemented', path: url })
    return
  }

  if (url === '/api/a3' && method === 'GET') {
    send(501, { ok: false, status: 'not_implemented', path: url })
    return
  }

  if (url === '/api/a1/lookup' && method === 'POST') {
    const raw = await readBody(request)
    const payload = JSON.parse(raw || '{}') as { query?: string }
    send(200, await a1.lookup(payload.query?.trim() || '字'), raw)
    return
  }

  if (url === '/api/a1/chat' && method === 'POST') {
    const raw = await readBody(request)
    let messages: A1ChatMessage[] = []
    let hint: 'lookup' | 'story' | undefined
    try {
      const payload = JSON.parse(raw || '{}') as {
        messages?: A1ChatMessage[]
        hint?: 'lookup' | 'story'
      }
      if (Array.isArray(payload.messages)) messages = payload.messages
      if (payload.hint === 'lookup' || payload.hint === 'story') hint = payload.hint
    } catch {
      send(400, { ok: false, error: 'CHAT_BAD_REQUEST', message: '我沒聽清楚耶，再說一次好嗎？' }, raw)
      return
    }
    const result = await a1.chat(messages, hint)
    send(result.ok ? 200 : 502, result, raw)
    return
  }

  if (url === '/api/a1/illustrate' && method === 'POST') {
    const raw = await readBody(request)
    let context = ''
    let targetWord: string | undefined
    let mode: 'scene' | 'diagram' = 'scene'
    try {
      const payload = JSON.parse(raw || '{}') as {
        context?: string
        targetWord?: string
        mode?: 'scene' | 'diagram'
      }
      if (typeof payload.context === 'string') context = payload.context
      if (typeof payload.targetWord === 'string') targetWord = payload.targetWord
      if (payload.mode === 'diagram') mode = 'diagram'
    } catch {
      send(400, { ok: false, error: 'ILLUSTRATE_BAD_REQUEST', message: '我還不知道要畫什麼耶。' }, raw)
      return
    }
    const result = await a1.illustrate(context, targetWord, mode)
    send(result.ok ? 200 : 502, result, raw)
    return
  }

  if (url === '/api/a1/read-question' && method === 'POST') {
    const raw = await readBody(request)
    let imageBase64 = ''
    let mimeType = 'image/jpeg'
    try {
      const payload = JSON.parse(raw || '{}') as { imageBase64?: string; mimeType?: string }
      if (typeof payload.imageBase64 === 'string') imageBase64 = payload.imageBase64
      if (typeof payload.mimeType === 'string') mimeType = payload.mimeType
    } catch {
      send(400, { ok: false, error: 'READ_BAD_REQUEST', message: '我沒看到照片耶，再拍一次好嗎？' }, '[image]')
      return
    }
    const result = await a1.readQuestion(imageBase64, mimeType)
    // 不把整張 base64 寫進 request.log（會塞爆）：以占位字串記錄
    send(result.ok ? 200 : 502, result, '[image]')
    return
  }

  if (url === '/api/a1/videos' && method === 'POST') {
    const raw = await readBody(request)
    let query = ''
    let topic: string | undefined
    try {
      const payload = JSON.parse(raw || '{}') as { query?: string; topic?: string }
      if (typeof payload.query === 'string') query = payload.query
      if (typeof payload.topic === 'string') topic = payload.topic
    } catch {
      send(400, { ok: false, error: 'VIDEO_BAD_REQUEST', message: '我還不知道要找什麼影片耶。' }, raw)
      return
    }
    const result = await a1.searchVideos(query, topic)
    send(result.ok ? 200 : 502, result, raw)
    return
  }

  // 影片庫：各主題摘要（後台檢索：累積了哪些主題、各幾支）
  if (url === '/api/a1/videobank' && method === 'GET') {
    const result = a1.videoBankSummary()
    send(result.ok ? 200 : 500, result)
    return
  }

  // 兒童知識型頻道庫：列出（檢索）
  if (url === '/api/a1/channels' && method === 'GET') {
    const result = a1.listChannels()
    send(result.ok ? 200 : 500, result)
    return
  }

  // 兒童知識型頻道庫：新增入庫（管理）。body: {channelId, title?, handle?, topics?, note?}
  if (url === '/api/a1/channels' && method === 'POST') {
    const raw = await readBody(request)
    let payload: import('./contracts/providers.js').ChannelAddRequest
    try {
      payload = JSON.parse(raw || '{}')
    } catch {
      send(400, { ok: false, error: 'CHANNEL_BAD_REQUEST', message: '請提供 channelId。' }, raw)
      return
    }
    const result = a1.addChannel(payload)
    send(result.ok ? 200 : result.error === 'CHANNEL_BAD_REQUEST' ? 400 : 500, result, raw)
    return
  }

  if (url === '/api/a2/quiz' && method === 'POST') {
    const raw = await readBody(request)
    const payload = JSON.parse(raw || '{}') as {
      mode?: 'random' | 'custom'
      idioms?: string[]
      questionCount?: number
    }
    const questionCount = Number(payload.questionCount || 5)
    if (payload.mode === 'random') {
      send(200, idiomEngine.generateRandom(questionCount), raw)
    } else {
      const idioms = Array.isArray(payload.idioms) ? payload.idioms : []
      send(200, idiomEngine.generate(idioms, questionCount), raw)
    }
    return
  }

  if (url === '/api/a5/prepare' && method === 'POST') {
    const raw = await readBody(request)
    const payload = JSON.parse(raw || '{}') as {
      mode?: 'random' | 'curriculum' | 'custom'
      publisher?: string
      grade?: string
      semester?: string
      lessons?: string[]
      customChars?: string
      questionCount?: number
    }
    send(200, vocabEngine.prepare({
      mode: payload.mode ?? 'random',
      publisher: payload.publisher,
      grade: payload.grade,
      semester: payload.semester,
      lessons: payload.lessons,
      customChars: payload.customChars,
      questionCount: Number(payload.questionCount || 5),
    }), raw)
    return
  }

  if (url === '/api/a5/next' && method === 'POST') {
    const raw = await readBody(request)
    const payload = JSON.parse(raw || '{}') as { char: string; index: number; wordType?: 'word' | 'idiom' | 'mixed' }
    send(200, await vocabEngine.generateOne(payload.char, payload.index ?? 0, payload.wordType ?? 'mixed'), raw)
    return
  }

  if (url?.startsWith('/api/a5/meta') && method === 'GET') {
    const params = new URL(url, 'http://localhost').searchParams
    const pub = params.get('publisher')
    const gr = params.get('grade')
    const sem = params.get('semester')
    send(200, {
      publishers: vocabEngine.getPublishers(),
      grades: pub ? vocabEngine.getGrades(pub) : [],
      semesters: pub && gr ? vocabEngine.getSemesters(pub, gr) : [],
      lessons: pub && gr ? vocabEngine.getLessons(pub, gr, sem ?? undefined) : [],
    })
    return
  }

  // 出題範圍：全科 runtime 動態生（機制科從知識點、事實科從種子池）
  if (url === '/api/quiz/meta' && method === 'GET') {
    send(200, { ok: true, ranges: quizGen.meta() })
    return
  }

  // 出題：全科都走動態生（機制科即時生、事實科重包裝種子）
  if (url?.startsWith('/api/quiz') && method === 'GET') {
    const params = new URL(url, 'http://localhost').searchParams
    const subject = params.get('subject') ?? ''
    const grade = params.get('grade') ?? ''
    const count = Math.min(20, Math.max(1, Number(params.get('count')) || 5))
    const items = await quizGen.generate(subject, grade, count)
    send(200, { ok: true, items })
    return
  }

  send(404, { ok: false, error: 'Not Found' })
})

server.listen(env.port, '0.0.0.0', () => {
  console.log(`Backend listening on ${env.port}`)
})
