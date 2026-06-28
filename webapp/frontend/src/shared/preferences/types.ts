/**
 * 中央個人化偏好層（DD-1/DD-2）。
 *
 * 單一 localStorage key、版本化 JSON、四分區（voice/identity/learning/ui）。
 * 這裡只放型別 + 預設 + 版本/key 常數；讀寫邏輯在 store.ts。
 */

export type Theme = 'light' | 'dark'

export type VoicePreferences = {
  /** 朗讀總開關（TTS）。收編自 tts.ts 的 module-level enabled。 */
  ttsEnabled: boolean
  /**
   * 半雙工模式：朗讀中不收語音、不接受語音插話（barge-in）。
   * 全雙工（預設）邊講邊聽、可自然插話；但 Web Speech API 無法辨語者，現場其他人講話會被
   * 誤判成小朋友插話而中斷朗讀。半雙工＝小雞老師講完才聽，朗讀中一律不被語音打斷
   * （要中斷改按「停止」鈕）。預設關（全雙工，保留自然插話）。
   */
  halfDuplex: boolean
  /** 朗讀語速。 */
  rate: number
  /** 朗讀音調。 */
  pitch: number
  /** 指定中文語音 voiceURI（未設 = 自動挑選）。 */
  zhVoiceURI?: string
  /** 指定英文語音 voiceURI（未設 = 自動挑選）。 */
  enVoiceURI?: string
}

export type IdentityPreferences = {
  /** 小朋友暱稱（用於稱呼/問候）。 */
  nickname: string
  /** 年級。 */
  grade: string
}

export type LearningPreferences = {
  /** 預設意圖傾向（第一版先存可編輯，消費漸進 DD-8）。 */
  defaultIntentBias?: string
  /** 難度。 */
  difficulty?: string
  /** 主題興趣。 */
  topics: string[]
  /** 舊 cecelearn-a5-prefs 出題範圍遷移保留區（向後相容 DD-5）。 */
  a5?: Record<string, string>
  /** 累積經驗值（全域累積） */
  xp?: number
  /** 當前等級 */
  level?: number
}

export type UiPreferences = {
  /** 字級縮放（落地到 --app-font-scale）。 */
  fontScale: number
  /** 深淺色主題（落地到 data-theme）。 */
  theme: Theme
  /** 麥克風進場預設開（僅供初值，不奪運行時控制 DD-8）。 */
  micDefaultOn: boolean
}

export type Preferences = {
  voice: VoicePreferences
  identity: IdentityPreferences
  learning: LearningPreferences
  ui: UiPreferences
}

/** schema 版本，落後時跑 migrate（DD-2）。 */
export const PREFS_SCHEMA_VERSION = 1

/** 單一 localStorage key（DD-1）。 */
export const PREFS_KEY = 'cecelearn:prefs:v1'

/** 舊 key（一次性遷移來源，DD-5）。 */
export const LEGACY_TTS_PREFS_KEY = 'cecelearn-tts-prefs'
export const LEGACY_A5_PREFS_KEY = 'cecelearn-a5-prefs'

/**
 * 合理預設。
 * - ttsEnabled true、rate 0.8、pitch 1：對齊 A5 既有預設。
 * - fontScale 1、theme 'light'。
 * - micDefaultOn true：對齊 A1 既有「進場即聽」預設。
 */
export const DEFAULT_PREFERENCES: Preferences = {
  voice: {
    ttsEnabled: true,
    halfDuplex: false,
    rate: 0.8,
    pitch: 1,
  },
  identity: {
    nickname: '',
    grade: '',
  },
  learning: {
    topics: [],
    xp: 0,
    level: 1,
  },
  ui: {
    fontScale: 1,
    theme: 'light',
    micDefaultOn: true,
  },
}
