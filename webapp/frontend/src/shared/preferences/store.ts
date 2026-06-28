/**
 * 中央偏好 store core（DD-3，純 TS 不依賴 React）。
 *
 * 職責：
 * - load：parse → 版本遷移 → 補預設 → corrupt 回 DEFAULT；全程 try/catch。
 * - persist：寫單一 key，localStorage 不可用走顯式記憶體 fallback（不靜默吞，R3）。
 * - 舊 key 一次性遷移（DD-5）：僅當中央 key 不存在時讀舊 key 併入，不刪舊 key。
 * - subscribe/notify：寫入後通知訂閱者（值未變則略過，equality guard）。
 */

import {
  DEFAULT_PREFERENCES,
  LEGACY_A5_PREFS_KEY,
  LEGACY_TTS_PREFS_KEY,
  PREFS_KEY,
  PREFS_SCHEMA_VERSION,
  type Preferences,
} from './types'

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}

type StoredEnvelope = {
  schemaVersion: number
  data: Preferences
}

/** localStorage 不可用時的顯式記憶體 fallback（隱私模式 / 配額用盡），不靜默吞。 */
let memoryFallback: string | null = null
let usingMemoryFallback = false

function safeGetItem(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') {
      usingMemoryFallback = true
      return key === PREFS_KEY ? memoryFallback : null
    }
    return localStorage.getItem(key)
  } catch {
    usingMemoryFallback = true
    return key === PREFS_KEY ? memoryFallback : null
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    if (typeof localStorage === 'undefined') {
      usingMemoryFallback = true
      if (key === PREFS_KEY) memoryFallback = value
      return
    }
    localStorage.setItem(key, value)
  } catch {
    // 寫入失敗（隱私模式 / 配額）：顯式落到記憶體 fallback，不靜默忽略。
    usingMemoryFallback = true
    if (key === PREFS_KEY) memoryFallback = value
  }
}

/** 是否正走記憶體 fallback（供診斷 / UI 提示，不靜默）。 */
export function isUsingMemoryFallback(): boolean {
  return usingMemoryFallback
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 取出 override 中「有定義」的欄位（undefined 跳過），供分區合併。 */
function definedFields(override: unknown): Record<string, unknown> {
  if (!isPlainObject(override)) return {}
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(override)) {
    const value = override[key]
    if (value === undefined) continue
    result[key] = value
  }
  return result
}

/** 分區深合併：以 DEFAULT 為底，補上 stored 的有效欄位（缺欄位補預設）。 */
function mergeWithDefaults(data: unknown): Preferences {
  const source = isPlainObject(data) ? data : {}
  const voice: Preferences['voice'] = { ...DEFAULT_PREFERENCES.voice, ...definedFields(source.voice) }
  const identity: Preferences['identity'] = { ...DEFAULT_PREFERENCES.identity, ...definedFields(source.identity) }
  const learning: Preferences['learning'] = { ...DEFAULT_PREFERENCES.learning, ...definedFields(source.learning) }
  const ui: Preferences['ui'] = { ...DEFAULT_PREFERENCES.ui, ...definedFields(source.ui) }
  return { voice, identity, learning, ui }
}

/**
 * 版本遷移（DD-2）。目前 v0→v1 等同「補預設」，故 migrate 直接走 mergeWithDefaults。
 * 未來新增版本時在此分支處理舊版形狀。
 */
function migrate(rawData: unknown, _fromVersion: number): Preferences {
  return mergeWithDefaults(rawData)
}

/** 舊 key 一次性遷移（DD-5）：僅當中央 key 不存在時呼叫。回傳併入舊值後的 Preferences。 */
function adoptLegacyKeys(base: Preferences): Preferences {
  const next: Preferences = {
    voice: { ...base.voice },
    identity: { ...base.identity },
    learning: { ...base.learning, topics: [...base.learning.topics] },
    ui: { ...base.ui },
  }

  // cecelearn-tts-prefs: { rate, pitch } → voice.rate / voice.pitch
  try {
    const rawTts = safeGetItem(LEGACY_TTS_PREFS_KEY)
    if (rawTts) {
      const parsed = JSON.parse(rawTts) as { rate?: unknown; pitch?: unknown }
      if (typeof parsed.rate === 'number') next.voice.rate = parsed.rate
      if (typeof parsed.pitch === 'number') next.voice.pitch = parsed.pitch
    }
  } catch {
    /* 舊 key 損毀不阻擋遷移 */
  }

  // cecelearn-a5-prefs: Record<string,string> → learning.a5（保留為子物件）
  try {
    const rawA5 = safeGetItem(LEGACY_A5_PREFS_KEY)
    if (rawA5) {
      const parsed = JSON.parse(rawA5) as unknown
      if (isPlainObject(parsed)) {
        const a5: Record<string, string> = {}
        for (const key of Object.keys(parsed)) {
          const value = parsed[key]
          if (typeof value === 'string') a5[key] = value
        }
        next.learning.a5 = a5
      }
    }
  } catch {
    /* 舊 key 損毀不阻擋遷移 */
  }

  return next
}

function load(): Preferences {
  const raw = safeGetItem(PREFS_KEY)

  // 中央 key 不存在 → 嘗試一次性遷移舊 key，並寫回中央 key（DD-5/R2）。
  if (raw === null) {
    const adopted = adoptLegacyKeys(mergeWithDefaults(undefined))
    persist(adopted)
    return adopted
  }

  try {
    const envelope = JSON.parse(raw) as Partial<StoredEnvelope>
    const version = typeof envelope.schemaVersion === 'number' ? envelope.schemaVersion : 0
    if (version !== PREFS_SCHEMA_VERSION) {
      const migrated = migrate(envelope.data, version)
      persist(migrated)
      return migrated
    }
    return mergeWithDefaults(envelope.data)
  } catch {
    // corrupt / parse 失敗 → 回 DEFAULT（fail-soft，但不靜默：回退到乾淨預設）。
    return mergeWithDefaults(undefined)
  }
}

function persist(prefs: Preferences): void {
  const envelope: StoredEnvelope = {
    schemaVersion: PREFS_SCHEMA_VERSION,
    data: prefs,
  }
  safeSetItem(PREFS_KEY, JSON.stringify(envelope))
}

let current: Preferences = load()

type Listener = (prefs: Preferences) => void
const listeners = new Set<Listener>()

function notify(): void {
  for (const listener of listeners) {
    try {
      listener(current)
    } catch {
      /* 單一訂閱者錯誤不影響其他訂閱者 */
    }
  }
}

/** 讀取目前整包偏好。 */
export function getPreferences(): Preferences {
  return current
}

/**
 * 分區淺合併寫入。patch 只需給要改的分區/欄位。
 * 值未變則略過 persist + notify（equality guard，防環 R1）。
 */
export function setPreference(patch: DeepPartial<Preferences>): void {
  const voice: Preferences['voice'] = patch.voice ? { ...current.voice, ...definedFields(patch.voice) } : current.voice
  const identity: Preferences['identity'] = patch.identity ? { ...current.identity, ...definedFields(patch.identity) } : current.identity
  const learning: Preferences['learning'] = patch.learning ? { ...current.learning, ...definedFields(patch.learning) } : current.learning
  const ui: Preferences['ui'] = patch.ui ? { ...current.ui, ...definedFields(patch.ui) } : current.ui
  const next: Preferences = { voice, identity, learning, ui }

  if (
    shallowEqualSection(current.voice, next.voice) &&
    shallowEqualSection(current.identity, next.identity) &&
    shallowEqualSection(current.learning, next.learning) &&
    shallowEqualSection(current.ui, next.ui)
  ) {
    return
  }

  current = next
  persist(current)
  notify()
}

/** 分區淺比較：key 集合與每個 value 嚴格相等才視為未變（topics/a5 為參考比較，足以擋多數無變更）。 */
function shallowEqualSection(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  if (a === b) return true
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false
  }
  return true
}

/** 訂閱偏好變化。回傳取消訂閱函式。 */
export function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** 回復預設（仍持久化寫回）。 */
export function resetPreferences(): void {
  current = mergeWithDefaults(undefined)
  persist(current)
  notify()
}

/** 增加全域經驗值，並處理升級邏輯。回傳 { leveledUp: boolean, oldLevel: number, newLevel: number } */
export function addXp(amount: number): { leveledUp: boolean; oldLevel: number; newLevel: number } {
  const currentPrefs = getPreferences()
  const currentXp = currentPrefs.learning.xp ?? 0
  const currentLevel = currentPrefs.learning.level ?? 1
  
  const nextXp = currentXp + amount
  const nextLevel = Math.floor(nextXp / 100) + 1
  const leveledUp = nextLevel > currentLevel
  
  setPreference({
    learning: {
      xp: nextXp,
      level: nextLevel
    }
  })
  
  return {
    leveledUp,
    oldLevel: currentLevel,
    newLevel: nextLevel
  }
}
