import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { loadEnv } from './config/env.js'
import { initAccessLog, logAccess } from './logging/accessLog.js'
import { initRequestLog, logRequest, createRequestId, logUpstream } from './logging/requestLog.js'
import { createA1Module } from './modules/a1.js'
import { createA2Module } from './modules/a2.js'
import { IdiomQuizEngine } from './providers/idiomQuizEngine.js'
import { MoeWordLookupProvider } from './providers/moeProvider.js'
import { VocabQuizEngine } from './providers/vocabQuizEngine.js'

const env = loadEnv()
initAccessLog(resolve(process.env.HOME || '/tmp', '.local/state/cecelearn/logs/access.log'))
initRequestLog(resolve(process.env.HOME || '/tmp', '.local/state/cecelearn/logs/request.log'))
const a1 = createA1Module(new MoeWordLookupProvider(env.geminiApiKeys))
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
    send(200, { ok: true, service: '希希小家教-backend', port: env.port })
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
