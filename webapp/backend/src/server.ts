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
import type { DialogueChatProvider, SceneIllustrationProvider } from './contracts/providers.js'
import { IdiomQuizEngine } from './providers/idiomQuizEngine.js'
import { MoeWordLookupProvider } from './providers/moeProvider.js'
import { VocabQuizEngine } from './providers/vocabQuizEngine.js'
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
    // 成本分層：先免費 apikey → 撞 429/502/empty 掉接 Vertex 福利點數（使用者授權）
    return new CascadeImageProvider(
      new GeminiImageProvider(env.geminiApiKeys),
      new VertexImageProvider(env.vertexImage!),
      { primary: 'apikey', secondary: 'vertex' },
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

const a1 = createA1Module(
  new MoeWordLookupProvider(env.geminiApiKeys),
  buildChatProvider(),
  buildImageProvider(),
)
const idiomEngine = new IdiomQuizEngine()
const a2 = createA2Module(idiomEngine)
const vocabEngine = new VocabQuizEngine(env.geminiApiKeys)

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
    let hint: 'lookup' | undefined
    try {
      const payload = JSON.parse(raw || '{}') as { messages?: A1ChatMessage[]; hint?: 'lookup' }
      if (Array.isArray(payload.messages)) messages = payload.messages
      if (payload.hint === 'lookup') hint = 'lookup'
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

  send(404, { ok: false, error: 'Not Found' })
})

server.listen(env.port, '0.0.0.0', () => {
  console.log(`Backend listening on ${env.port}`)
})
