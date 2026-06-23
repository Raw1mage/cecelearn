import { isTtsSupported, setTtsEnabled } from '../speech/tts'
import { usePreferences } from '../preferences/usePreferences'

/**
 * 全域朗讀總開關（放在 app header 標題右邊）。
 * UI 狀態讀中央 store 的 voice.ttsEnabled；切換仍透過 setTtsEnabled（寫 store，
 * store 再回灌 tts module），維持「切換入口與 module 不失步」不變式。
 */
export function TtsToggle() {
  const { preferences } = usePreferences()
  const on = preferences.voice.ttsEnabled
  if (!isTtsSupported()) return null
  const toggle = () => {
    setTtsEnabled(!on)
  }
  return (
    <button
      type="button"
      className={`app-tts-toggle${on ? ' app-tts-toggle--active' : ''}`}
      onClick={toggle}
      aria-label={on ? '關閉朗讀' : '開啟朗讀'}
      title={on ? '朗讀：開' : '朗讀：關'}
    >
      {on ? '🔊' : '🔇'}
    </button>
  )
}
