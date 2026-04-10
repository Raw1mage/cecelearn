import { createServer } from 'node:http'
import { loadEnv } from './config/env.js'
import { createA1Module } from './modules/a1.js'
import { createA2Module } from './modules/a2.js'
import { LocalIdiomQuizProvider, LocalWordLookupProvider } from './providers/localProviders.js'

const env = loadEnv()
const a1 = createA1Module(new LocalWordLookupProvider())
const a2 = createA2Module(new LocalIdiomQuizProvider())

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
    sendJson(response, 200, a1.lookup(payload.query?.trim() || '字'))
    return
  }

  if (url === '/api/a2/quiz' && method === 'POST') {
    const payload = JSON.parse((await readBody(request)) || '{}') as { idioms?: string[]; questionCount?: number }
    const idioms = Array.isArray(payload.idioms) ? payload.idioms : []
    const questionCount = Number(payload.questionCount || 5)
    sendJson(response, 200, a2.generateQuiz(idioms, questionCount))
    return
  }

  sendJson(response, 404, { ok: false, error: 'Not Found' })
})

server.listen(env.port, '0.0.0.0', () => {
  console.log(`Backend listening on ${env.port}`)
})
