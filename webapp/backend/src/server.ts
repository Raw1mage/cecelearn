import { createServer } from 'node:http'
import { loadEnv } from './config/env.js'
import { createA1Module } from './modules/a1.js'
import { createA2Module } from './modules/a2.js'
import { IdiomQuizEngine } from './providers/idiomQuizEngine.js'
import { MoeWordLookupProvider } from './providers/moeProvider.js'
import { VocabQuizEngine } from './providers/vocabQuizEngine.js'

const env = loadEnv()
const a1 = createA1Module(new MoeWordLookupProvider(env.geminiApiKeys))
const idiomEngine = new IdiomQuizEngine()
const a2 = createA2Module(idiomEngine)
const vocabEngine = new VocabQuizEngine()

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
  const { method = 'GET' } = request
  // Strip PUBLIC_BASE_PATH prefix so route matching stays path-agnostic
  let url = request.url || '/'
  if (env.basePath && url.startsWith(env.basePath)) {
    url = url.slice(env.basePath.length) || '/'
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
    sendJson(response, 200, { ok: true, service: '希希小家教-backend', port: env.port })
    return
  }

  if (url === '/api/a1' && method === 'GET') {
    sendJson(response, 501, { ok: false, status: 'not_implemented', path: url })
    return
  }

  if (url === '/api/a2' && method === 'GET') {
    sendJson(response, 501, { ok: false, status: 'not_implemented', path: url })
    return
  }

  if (url === '/api/a3' && method === 'GET') {
    sendJson(response, 501, { ok: false, status: 'not_implemented', path: url })
    return
  }

  if (url === '/api/a1/lookup' && method === 'POST') {
    const payload = JSON.parse((await readBody(request)) || '{}') as { query?: string }
    sendJson(response, 200, await a1.lookup(payload.query?.trim() || '字'))
    return
  }

  if (url === '/api/a2/quiz' && method === 'POST') {
    const payload = JSON.parse((await readBody(request)) || '{}') as {
      mode?: 'random' | 'custom'
      idioms?: string[]
      questionCount?: number
    }
    const questionCount = Number(payload.questionCount || 5)
    if (payload.mode === 'random') {
      sendJson(response, 200, idiomEngine.generateRandom(questionCount))
    } else {
      const idioms = Array.isArray(payload.idioms) ? payload.idioms : []
      sendJson(response, 200, idiomEngine.generate(idioms, questionCount))
    }
    return
  }

  if (url === '/api/a5/quiz' && method === 'POST') {
    const payload = JSON.parse((await readBody(request)) || '{}') as {
      mode?: 'random' | 'curriculum' | 'custom'
      publisher?: string
      grade?: string
      semester?: string
      lessons?: string[]
      customChars?: string
      questionCount?: number
    }
    sendJson(response, 200, await vocabEngine.generate({
      mode: payload.mode ?? 'random',
      publisher: payload.publisher,
      grade: payload.grade,
      semester: payload.semester,
      lessons: payload.lessons,
      customChars: payload.customChars,
      questionCount: Number(payload.questionCount || 5),
    }))
    return
  }

  if (url?.startsWith('/api/a5/meta') && method === 'GET') {
    const params = new URL(url, 'http://localhost').searchParams
    const pub = params.get('publisher')
    const gr = params.get('grade')
    const sem = params.get('semester')
    sendJson(response, 200, {
      publishers: vocabEngine.getPublishers(),
      grades: pub ? vocabEngine.getGrades(pub) : [],
      semesters: pub && gr ? vocabEngine.getSemesters(pub, gr) : [],
      lessons: pub && gr ? vocabEngine.getLessons(pub, gr, sem ?? undefined) : [],
    })
    return
  }

  sendJson(response, 404, { ok: false, error: 'Not Found' })
})

server.listen(env.port, '0.0.0.0', () => {
  console.log(`Backend listening on ${env.port}`)
})
