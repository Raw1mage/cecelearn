export type BackendEnv = {
  port: number
  nodeEnv: string
}

export function loadEnv(): BackendEnv {
  return {
    port: Number(process.env.PORT || 3014),
    nodeEnv: process.env.NODE_ENV || 'development',
  }
}
