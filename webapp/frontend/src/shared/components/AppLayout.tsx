import type { PropsWithChildren } from 'react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { env } from '../config/env'
import { useScore } from '../ScoreContext'
import { usePreferences } from '../preferences/usePreferences'
import { TtsToggle } from './TtsToggle'
import { SettingsPanel } from './SettingsPanel'

export function AppLayout({ children }: PropsWithChildren) {
  const { score } = useScore()
  const { preferences } = usePreferences()
  const [settingsOpen, setSettingsOpen] = useState(false)

  // 介面偏好落地（DD-7）：字級縮放需作用在 root font-size（rem 相對 root），
  // 故 --app-font-scale 與 data-theme 都寫到 document root，純 CSR mount 同步套用。
  const { fontScale, theme } = preferences.ui
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--app-font-scale', String(fontScale))
    root.setAttribute('data-theme', theme)
  }, [fontScale, theme])

  return (
    <div className="app-frame">
      <header className="app-header">
        <div className="app-header__title">
          <h1><Link to="/" className="app-title-link">{env.appName}</Link></h1>
          <TtsToggle />
          <button
            type="button"
            className="app-tts-toggle"
            onClick={() => setSettingsOpen(true)}
            aria-label="開啟設定"
            title="設定"
          >
            ⚙️
          </button>
        </div>
        <div className="app-score">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#fbbf24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" /></svg>
          <span>{score}</span>
        </div>
      </header>
      <main className="page-shell">{children}</main>
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
