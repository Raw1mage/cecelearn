export type VertexImageEnv = {
  project: string
  location: string
  model: string
  /** Imagen 4 模型（cascade 第二層用；專門 T2I，不像 Gemini 多模態會空回文字） */
  imagenModel: string
  keyFile: string
}

/**
 * 畫圖 provider 模式:
 * - 'apikey'   : 只走 GEMINI_API_KEYS（AI Studio 免費額度），預設
 * - 'vertex'   : 只走 Vertex（吃 GCP 福利 credit）
 * - 'cascade'  : 先免費 apikey，撞 429 冷卻 / 502 / empty 才掉接 Vertex 福利點數（使用者授權的成本分層）
 */
export type ImageProviderMode = 'apikey' | 'vertex' | 'cascade'

/**
 * 對話 provider 模式:
 * - 'gemini'  : 只走 GEMINI_API_KEYS（AI Studio），預設（不改既有行為）
 * - 'bare'    : 只走 opencode bare session（Claude OAuth 訂閱，經同機 unix socket）
 * - 'cascade' : 先 Claude bare，連線/結構化失敗才掉接 Gemini（使用者授權的主→備）
 */
export type ChatProviderMode = 'gemini' | 'bare' | 'cascade'

export type BareChatEnv = {
  socketPath: string
  providerId: string
  modelID: string
  accountId?: string
}

export type BackendEnv = {
  port: number
  nodeEnv: string
  basePath: string
  geminiApiKeys: string[]
  imageProvider: ImageProviderMode
  /** imageProvider='vertex'|'cascade' 時必填，否則 loadEnv fail-fast */
  vertexImage?: VertexImageEnv
  chatProvider: ChatProviderMode
  /** chatProvider='bare'|'cascade' 時必填，否則 loadEnv fail-fast */
  bareChat?: BareChatEnv
  /** 找影片（YouTube Data API v3）金鑰；空字串＝不啟用 Data API 後備（主要走 yt-dlp） */
  youtubeApiKey: string
  /** 找影片主要來源：yt-dlp binary 路徑（被動函式、零配額、無 daemon）。空字串＝停用、改走 Data API */
  ytDlpPath: string
}

export function loadEnv(): BackendEnv {
  const raw = process.env.PUBLIC_BASE_PATH || '/'
  const basePath = ('/' + raw.replace(/^\/+|\/+$/g, '')).replace(/^\/$/, '')

  const imageProvider = (process.env.IMAGE_PROVIDER || 'apikey').trim() as ImageProviderMode
  if (!['apikey', 'vertex', 'cascade'].includes(imageProvider)) {
    throw new Error(`IMAGE_PROVIDER 必須是 'apikey' | 'vertex' | 'cascade'，收到 '${imageProvider}'`)
  }

  const geminiApiKeys = (process.env.GEMINI_API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean)

  // vertex 與 cascade 都需要完整 Vertex 配置；fail-fast 不 silent fallback（天條 #11）
  let vertexImage: VertexImageEnv | undefined
  if (imageProvider === 'vertex' || imageProvider === 'cascade') {
    const project = (process.env.VERTEX_PROJECT || '').trim()
    const keyFile = (process.env.VERTEX_KEY_FILE || '').trim()
    if (!project) throw new Error(`IMAGE_PROVIDER=${imageProvider} 但缺 VERTEX_PROJECT`)
    if (!keyFile) throw new Error(`IMAGE_PROVIDER=${imageProvider} 但缺 VERTEX_KEY_FILE`)
    vertexImage = {
      project,
      location: (process.env.VERTEX_LOCATION || 'us-central1').trim(),
      model: (process.env.VERTEX_IMAGE_MODEL || 'gemini-2.5-flash-image').trim(),
      imagenModel: (process.env.VERTEX_IMAGEN_MODEL || 'imagen-4.0-fast-generate-001').trim(),
      keyFile,
    }
  }

  // cascade 還需要免費 tier 的 key；缺了直接報錯而非默默變單 tier
  if (imageProvider === 'cascade' && geminiApiKeys.length === 0) {
    throw new Error('IMAGE_PROVIDER=cascade 但缺 GEMINI_API_KEYS（免費 tier 無法啟用）')
  }

  // 對話 provider —— 預設 gemini（不改既有行為）；bare/cascade 借 opencode daemon
  const chatProvider = (process.env.CHAT_PROVIDER || 'gemini').trim() as ChatProviderMode
  if (!['gemini', 'bare', 'cascade'].includes(chatProvider)) {
    throw new Error(`CHAT_PROVIDER 必須是 'gemini' | 'bare' | 'cascade'，收到 '${chatProvider}'`)
  }

  let bareChat: BareChatEnv | undefined
  if (chatProvider === 'bare' || chatProvider === 'cascade') {
    const runtimeDir = (process.env.XDG_RUNTIME_DIR || '').trim()
    const socketPath = (
      process.env.OPENCODE_DAEMON_SOCKET ||
      (runtimeDir ? `${runtimeDir}/opencode/daemon.sock` : '')
    ).trim()
    if (!socketPath) {
      throw new Error(
        `CHAT_PROVIDER=${chatProvider} 但缺 OPENCODE_DAEMON_SOCKET（且無 XDG_RUNTIME_DIR 可推導）`,
      )
    }
    bareChat = {
      socketPath,
      providerId: (process.env.OPENCODE_CHAT_PROVIDER_ID || 'claude-cli').trim(),
      modelID: (process.env.OPENCODE_CHAT_MODEL || 'claude-opus-4-8').trim(),
      accountId: (process.env.OPENCODE_CHAT_ACCOUNT || '').trim() || undefined,
    }
  }

  // cascade 還需要備援 tier 的 Gemini key；缺了直接報錯而非默默變單 tier
  if (chatProvider === 'cascade' && geminiApiKeys.length === 0) {
    throw new Error('CHAT_PROVIDER=cascade 但缺 GEMINI_API_KEYS（Gemini 備援 tier 無法啟用）')
  }

  // 找影片：專用 YOUTUBE_API_KEY；沒設就沿用第一把 Gemini key（同一 GCP 專案，
  // 在該專案啟用 YouTube Data API v3 即可共用）。兩者皆無 → 功能停用、不報錯。
  const youtubeApiKey = (
    process.env.YOUTUBE_API_KEY || geminiApiKeys[0] || ''
  ).trim()

  // 找影片主要來源：yt-dlp 被動函式（DD-32，取代熱 service Invidious）。
  //
  // 為什麼是 yt-dlp 而非 Invidious：Invidious 是「伺服器形狀」（連線池/反爬 token/postgres，
  // 需 3 容器常駐 daemon）；cecelearn 的找影片只是 query→清單 的被動需求，yt-dlp 是「函式
  // 形狀」——呼叫才 spawn 去爬、回 metadata 就退出，無 daemon/docker/postgres。預設 'yt-dlp'
  // 走 PATH；可設絕對路徑（如 ~/.local/bin/yt-dlp）。設空字串＝停用 yt-dlp、退 Data API。
  // 連不到時 server 啟動會 log warn（見 server.ts health probe），找影片 fail-soft 退
  // Data API（若有 YOUTUBE_API_KEY）或影片庫既有內容。兒童安全靠精選白名單+家長黑名單兩道閘
  // （yt-dlp 無 Invidious 的 isFamilyFriendly 欄位）。
  const ytDlpPath = (process.env.YTDLP_PATH ?? 'yt-dlp').trim()

  return {
    port: Number(process.env.PORT || 3014),
    nodeEnv: process.env.NODE_ENV || 'development',
    basePath,
    geminiApiKeys,
    imageProvider,
    vertexImage,
    chatProvider,
    bareChat,
    youtubeApiKey,
    ytDlpPath,
  }
}
