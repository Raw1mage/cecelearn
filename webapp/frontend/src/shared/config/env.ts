export type FrontendEnv = {
  apiBaseUrl: string
  appName: string
}

export const env: FrontendEnv = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? `${import.meta.env.BASE_URL.replace(/\/+$/, '')}/api`,
  appName: import.meta.env.VITE_APP_NAME ?? '小雞老師',
}
