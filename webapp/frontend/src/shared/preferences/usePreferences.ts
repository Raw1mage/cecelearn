/**
 * React 層偏好 hook（DD-3）。
 * 用 useSyncExternalStore 訂閱 store core，並導出 setter。
 */

import { useSyncExternalStore } from 'react'
import {
  getPreferences,
  setPreference,
  subscribe,
  resetPreferences,
  type DeepPartial,
} from './store'
import type { Preferences } from './types'

export type UsePreferencesResult = {
  preferences: Preferences
  setPreference: (patch: DeepPartial<Preferences>) => void
  resetPreferences: () => void
}

/** 讀整包偏好 + setter。整包變更（任一分區）都會觸發 re-render。 */
export function usePreferences(): UsePreferencesResult {
  const preferences = useSyncExternalStore(subscribe, getPreferences, getPreferences)
  return { preferences, setPreference, resetPreferences }
}

/** selector 版本：只在選取的切片變化時 re-render（需自備穩定 selector + 純值比較）。 */
export function usePreferencesSelector<T>(
  selector: (prefs: Preferences) => T,
): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(getPreferences()),
    () => selector(getPreferences()),
  )
}
