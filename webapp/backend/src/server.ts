import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { loadEnv } from './config/env.js'
import { initAccessLog, logAccess } from './logging/accessLog.js'
import { initRequestLog, logRequest, createRequestId, logUpstream } from './logging/requestLog.js'
import { createA1Module } from './modules/a1.js'
import { createA2Module } from './modules/a2.js'
import { createA7Module } from './modules/a7.js'
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
import { YtDlpVideoProvider } from './providers/ytDlpVideoProvider.js'
import { Blocklist } from './providers/blocklist.js'
import { ImagenVertexProvider } from './providers/imagenVertexProvider.js'
import type { DialogueChatProvider, SceneIllustrationProvider } from './contracts/providers.js'
import { IdiomQuizEngine } from './providers/idiomQuizEngine.js'
import { IdiomCrosswordEngine } from './providers/idiomCrosswordProvider.js'
import { IdiomExplainEngine } from './providers/idiomExplainProvider.js'
import { UtteranceCompleteEngine } from './providers/utteranceCompleteProvider.js'
import { MoeWordLookupProvider } from './providers/moeProvider.js'
import { VocabQuizEngine } from './providers/vocabQuizEngine.js'
import { QuizBankProvider } from './providers/quizBankProvider.js'
import { QuizGenProvider } from './providers/quizGenProvider.js'
import { QuizIconProvider } from './providers/quizIconProvider.js'
import { QuizAnswerJudgeProvider } from './providers/quizAnswerJudgeProvider.js'
import { GenBank, type GenTable } from './providers/genbank.js'
import { CachedIllustrationProvider } from './providers/cachedIllustrationProvider.js'
import { createReadStream, existsSync } from 'node:fs'
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

// 統一 token 產物累積層（SQLite）：題庫 bank-first/rotation、場景插畫快取、影片庫。fail-fast 開不了即拋。
const genBank = new GenBank()
const channelLibrary = new ChildChannelLibrary()
const videoBank = new VideoBank(genBank) // 影片庫內部改用 genBank（API 不變）
const ytdlp = env.ytDlpPath ? new YtDlpVideoProvider(env.ytDlpPath) : undefined
const blocklist = new Blocklist()
const a1 = createA1Module(
  new MoeWordLookupProvider(env.geminiApiKeys),
  buildChatProvider(),
  // 場景插畫包一層累積快取：命中回庫圖（零 token），未命中生成後回存（契約不變）
  new CachedIllustrationProvider(buildImageProvider(), genBank),
  new GeminiVisionProvider(env.geminiApiKeys),
  new YoutubeVideoProvider(env.youtubeApiKey, channelLibrary, videoBank, ytdlp, blocklist),
  channelLibrary,
  videoBank,
  blocklist,
  new UtteranceCompleteEngine(env.geminiApiKeys),
)
const idiomEngine = new IdiomQuizEngine()
const a2 = createA2Module(idiomEngine)
const crosswordEngine = new IdiomCrosswordEngine()
const explainEngine = new IdiomExplainEngine(env.geminiApiKeys)
const a7 = createA7Module(crosswordEngine, explainEngine)
const vocabEngine = new VocabQuizEngine(env.geminiApiKeys)
const quizBank = new QuizBankProvider() // 事實科（自然/社會）事實種子池
// 練習題單元物件插畫圖庫（複合生圖）：build 預生 + runtime 用 image provider 補沒有的（天條 #11 已批准）
const quizIcons = new QuizIconProvider(buildImageProvider())
const quizGen = new QuizGenProvider(env.geminiApiKeys, quizBank, quizIcons, genBank) // 全科 runtime 動態生 + 題庫累積
const quizJudge = new QuizAnswerJudgeProvider(env.geminiApiKeys)

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

  if (url === '/api/a1/utterance-complete' && method === 'POST') {
    const raw = await readBody(request)
    let text = ''
    let quietRepeatCount = 0
    try {
      const payload = JSON.parse(raw || '{}') as { text?: string; quietRepeatCount?: number }
      if (typeof payload.text === 'string') text = payload.text
      if (typeof payload.quietRepeatCount === 'number' && Number.isFinite(payload.quietRepeatCount)) {
        quietRepeatCount = Math.max(0, Math.min(10, Math.floor(payload.quietRepeatCount)))
      }
    } catch {
      send(400, { ok: false, error: 'UTTERANCE_BAD_REQUEST', message: '沒有要判斷的內容。' }, raw)
      return
    }
    const startedAt = Date.now()
    const result = await a1.utteranceComplete(text, quietRepeatCount)
    console.log(
      `[UtteranceCompleteAPI] quietRepeat=${quietRepeatCount} ok=${result.ok} complete=${result.ok ? result.complete : 'n/a'} elapsed=${Date.now() - startedAt}ms len=${text.length}`,
    )
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
    let limit: number | undefined
    try {
      const payload = JSON.parse(raw || '{}') as { query?: string; topic?: string; limit?: number }
      if (typeof payload.query === 'string') query = payload.query
      if (typeof payload.topic === 'string') topic = payload.topic
      if (typeof payload.limit === 'number' && Number.isFinite(payload.limit)) limit = payload.limit
    } catch {
      send(400, { ok: false, error: 'VIDEO_BAD_REQUEST', message: '我還不知道要找什麼影片耶。' }, raw)
      return
    }
    const result = await a1.searchVideos(query, topic, limit)
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

  // 家長黑名單：列出（檢索）
  if (url === '/api/a1/block' && method === 'GET') {
    const result = a1.listBlocked()
    send(result.ok ? 200 : 500, result)
    return
  }

  // 家長黑名單：封鎖/解封（管理）。body: {action: 'block'|'unblock', channelId, channelName?}
  if (url === '/api/a1/block' && method === 'POST') {
    const raw = await readBody(request)
    let payload: import('./contracts/providers.js').BlockActionRequest
    try {
      payload = JSON.parse(raw || '{}')
    } catch {
      send(400, { ok: false, error: 'BLOCK_BAD_REQUEST', message: '請提供 action 與 channelId。' }, raw)
      return
    }
    const action = payload.action === 'unblock' ? 'unblock' : 'block'
    const result = a1.blockChannel(action, payload.channelId || '', payload.channelName)
    send(result.ok ? 200 : result.error === 'BLOCK_BAD_REQUEST' ? 400 : 500, result, raw)
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

  // A7 成語交叉填字：生成一個關卡（純本地演算法，零後端成本）。失敗顯式回 {ok:false}（DD-9）。
  if (url.startsWith('/api/a7/puzzle') && method === 'GET') {
    const qs = new URLSearchParams(url.split('?')[1] ?? '')
    const levelRaw = Number(qs.get('level'))
    const level = Number.isFinite(levelRaw) && levelRaw > 0 ? Math.floor(levelRaw) : 1
    const diffRaw = qs.get('difficulty')
    const difficulty = diffRaw === 'easy' || diffRaw === 'normal' || diffRaw === 'hard' ? diffRaw : undefined
    const result = a7.generatePuzzle({ level, difficulty })
    send(result.ok ? 200 : 500, result)
    return
  }

  // A7 成語解釋：揭曉時按需查，Gemini 適齡白話生成（DD-10）。失敗顯式回 {ok:false}。
  if (url === '/api/a7/explain' && method === 'POST') {
    const raw = await readBody(request)
    const payload = JSON.parse(raw || '{}') as { idiom?: string }
    const result = await a7.explainIdiom(payload.idiom ?? '')
    send(result.ok ? 200 : 502, result)
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

  // 練習題單元物件插畫：以名詞鍵取圖（複合生圖圖庫）。名詞須命中 NOUN_BANK（filePathFor 對未知名詞回 null）→ 防路徑穿越。
  if (url.startsWith('/api/quiz/icon/') && method === 'GET') {
    const noun = decodeURIComponent(url.slice('/api/quiz/icon/'.length).split('?')[0] ?? '')
    const filePath = /^[a-z]+$/.test(noun) ? quizIcons.filePathFor(noun) : null
    if (!filePath) {
      response.writeHead(404, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ ok: false, error: 'ICON_NOT_FOUND' }))
      return
    }
    const ext = filePath.slice(filePath.lastIndexOf('.') + 1).toLowerCase()
    const ct = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    response.writeHead(200, { 'Content-Type': ct, 'Cache-Control': 'public, max-age=86400' })
    createReadStream(filePath).pipe(response)
    return
  }

  // 場景插畫快取圖：依 gen_image id 取檔（累積層 kind=scene/quiz-icon）。id 須為純數字 → 防穿越。
  if (url.startsWith('/api/genbank/img/') && method === 'GET') {
    const idStr = url.slice('/api/genbank/img/'.length).split('?')[0] ?? ''
    const id = /^\d+$/.test(idStr) ? Number(idStr) : NaN
    const row = Number.isNaN(id) ? null : genBank.imageById(id)
    if (!row) {
      response.writeHead(404, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ ok: false, error: 'IMG_NOT_FOUND' }))
      return
    }
    const abs = resolve(process.cwd(), 'data', row.file_path)
    const dataDir = resolve(process.cwd(), 'data')
    if (!abs.startsWith(dataDir) || !existsSync(abs)) {
      response.writeHead(404, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ ok: false, error: 'IMG_FILE_MISSING' }))
      return
    }
    const ext = abs.slice(abs.lastIndexOf('.') + 1).toLowerCase()
    const ct = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    response.writeHead(200, { 'Content-Type': ct, 'Cache-Control': 'public, max-age=86400' })
    createReadStream(abs).pipe(response)
    return
  }

  // 統一後台：累積層各類統計
  if (url === '/api/genbank/summary' && method === 'GET') {
    send(200, { ok: true, summary: genBank.summary(), videoTopics: genBank.videoTopics() })
    return
  }

  // 統一後台：分類分頁列表。?type=quiz|image|video&category=&page=&pageSize=
  if (url.startsWith('/api/genbank/list') && method === 'GET') {
    const params = new URL(url, 'http://localhost').searchParams
    const typeParam = params.get('type') ?? 'quiz'
    const tableMap: Record<string, GenTable> = { quiz: 'gen_quiz', image: 'gen_image', video: 'gen_video' }
    const table = tableMap[typeParam]
    if (!table) {
      send(400, { ok: false, error: 'BAD_TYPE', message: 'type 須為 quiz|image|video' })
      return
    }
    const result = genBank.list(table, {
      category: params.get('category') ?? undefined,
      page: Number(params.get('page')) || 0,
      pageSize: Number(params.get('pageSize')) || 50,
    })
    send(200, { ok: true, type: typeParam, ...result })
    return
  }

  // 統一後台：刪一筆。DELETE /api/genbank/:type/:id
  if (url.startsWith('/api/genbank/') && method === 'DELETE') {
    const parts = url.slice('/api/genbank/'.length).split('?')[0]?.split('/') ?? []
    const typeParam = parts[0] ?? ''
    const id = /^\d+$/.test(parts[1] ?? '') ? Number(parts[1]) : NaN
    const tableMap: Record<string, GenTable> = { quiz: 'gen_quiz', image: 'gen_image', video: 'gen_video' }
    const table = tableMap[typeParam]
    if (!table || Number.isNaN(id)) {
      send(400, { ok: false, error: 'BAD_REQUEST', message: '需要 /api/genbank/:type/:id（type=quiz|image|video, id=數字）' })
      return
    }
    const removed = genBank.remove(table, id)
    send(removed ? 200 : 404, { ok: removed, removed })
    return
  }

  // 出題範圍：全科 runtime 動態生（機制科從知識點、事實科從種子池）
  if (url === '/api/quiz/meta' && method === 'GET') {
    send(200, { ok: true, ranges: quizGen.meta() })
    return
  }

  // AI 判題：數學語音答案交由 Gemini 判斷等價性（單位、中文數字、語音近似）。失敗顯式回 ok:false。
  if (url === '/api/quiz/judge' && method === 'POST') {
    const raw = await readBody(request)
    try {
      const payload = JSON.parse(raw || '{}') as Parameters<typeof quizJudge.judge>[0]
      const result = await quizJudge.judge(payload)
      send(result.ok ? 200 : 502, result, raw)
    } catch {
      send(400, { ok: false, error: 'QUIZ_JUDGE_BAD_REQUEST', message: '判題資料格式不正確。' }, raw)
    }
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
  // yt-dlp health probe（DD-32）：找影片走被動函式 yt-dlp（無 daemon）。啟動時 probe 一次，
  // 連不到只 log warn、不崩——找影片會退 Data API（若有 key）或影片庫既有內容。
  if (ytdlp) {
    void ytdlp.ping().then((ok) => {
      if (ok) {
        console.log(`[startup] yt-dlp OK: ${ytdlp.binary()}（找影片被動函式、零 YouTube 配額、無 daemon）`)
      } else {
        console.warn(
          `[startup] WARN: 跑不起 yt-dlp（${ytdlp.binary()}）。` +
            `找影片將退 YouTube Data API 或影片庫既有內容。` +
            `安裝：下載單一 binary 到 PATH 或設 YTDLP_PATH 指向它。`,
        )
      }
    })
  } else {
    console.log('[startup] yt-dlp 已停用（YTDLP_PATH 空），找影片走 YouTube Data API')
  }
})
