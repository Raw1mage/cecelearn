import { useState } from 'react'
import { isTtsSupported, isTtsEnabled, setTtsEnabled } from '../speech/tts'

/**
 * 全域朗讀總開關（放在 app header 標題右邊）。
 * 朗讀狀態是 tts module 的單一真實來源（module-level `enabled`）；
 * 本元件是唯一的切換入口，故本地 state 與 module 不會失步。
 */
export function TtsToggle() {
  const [on, setOn] = useState(isTtsEnabled())
  if (!isTtsSupported()) return null
  const toggle = () => {
    const next = !on
    setOn(next)
    setTtsEnabled(next)
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
