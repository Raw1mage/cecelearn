export type BackendEnv = {
  port: number
  nodeEnv: string
  basePath: string
}

export function loadEnv(): BackendEnv {
  const raw = process.env.PUBLIC_BASE_PATH || '/'
  // Normalize: ensure leading slash, strip trailing slash, e.g. "/cecelearn"
  const basePath = ('/' + raw.replace(/^\/+|\/+$/g, '')).replace(/^\/$/, '')
  return {
    port: Number(process.env.PORT || 3014),
    nodeEnv: process.env.NODE_ENV || 'development',
    basePath,
  }
}
