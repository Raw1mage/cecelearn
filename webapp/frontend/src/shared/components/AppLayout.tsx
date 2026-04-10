import type { PropsWithChildren } from 'react'
import { Link } from 'react-router-dom'
import { env } from '../config/env'
import { useScore } from '../ScoreContext'

export function AppLayout({ children }: PropsWithChildren) {
  const { score } = useScore()
  return (
    <div className="app-frame">
      <header className="app-header">
        <h1><Link to="/" className="app-title-link">{env.appName}</Link></h1>
        <div className="app-score">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#fbbf24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" /></svg>
          <span>{score}</span>
        </div>
      </header>
      <main className="page-shell">{children}</main>
    </div>
  )
}
