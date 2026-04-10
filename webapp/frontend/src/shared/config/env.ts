export type FrontendEnv = {
  apiBaseUrl: string
  appName: string
}

export const env: FrontendEnv = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api',
  appName: import.meta.env.VITE_APP_NAME ?? 'CeceLearn Learning Portal',
}
