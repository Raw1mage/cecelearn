export type BackendEnv = {
  port: number
  nodeEnv: string
  basePath: string
  geminiApiKeys: string[]
}

export function loadEnv(): BackendEnv {
  const raw = process.env.PUBLIC_BASE_PATH || '/'
  const basePath = ('/' + raw.replace(/^\/+|\/+$/g, '')).replace(/^\/$/, '')
  return {
    port: Number(process.env.PORT || 3014),
    nodeEnv: process.env.NODE_ENV || 'development',
    basePath,
    geminiApiKeys: (process.env.GEMINI_API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean),
  }
}
