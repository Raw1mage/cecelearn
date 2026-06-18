export type VertexImageEnv = {
  project: string
  location: string
  model: string
  keyFile: string
}

/**
 * 畫圖 provider 模式:
 * - 'apikey'   : 只走 GEMINI_API_KEYS（AI Studio 免費額度），預設
 * - 'vertex'   : 只走 Vertex（吃 GCP 福利 credit）
 * - 'cascade'  : 先免費 apikey，撞 429 冷卻 / 502 / empty 才掉接 Vertex 福利點數（使用者授權的成本分層）
 */
export type ImageProviderMode = 'apikey' | 'vertex' | 'cascade'

export type BackendEnv = {
  port: number
  nodeEnv: string
  basePath: string
  geminiApiKeys: string[]
  imageProvider: ImageProviderMode
  /** imageProvider='vertex'|'cascade' 時必填，否則 loadEnv fail-fast */
  vertexImage?: VertexImageEnv
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
      keyFile,
    }
  }

  // cascade 還需要免費 tier 的 key；缺了直接報錯而非默默變單 tier
  if (imageProvider === 'cascade' && geminiApiKeys.length === 0) {
    throw new Error('IMAGE_PROVIDER=cascade 但缺 GEMINI_API_KEYS（免費 tier 無法啟用）')
  }

  return {
    port: Number(process.env.PORT || 3014),
    nodeEnv: process.env.NODE_ENV || 'development',
    basePath,
    geminiApiKeys,
    imageProvider,
    vertexImage,
  }
}
