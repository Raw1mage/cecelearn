import type { PropsWithChildren } from 'react'
import { Link } from 'react-router-dom'
import { env } from '../config/env'

export function AppLayout({ children }: PropsWithChildren) {
  return (
    <div className="app-frame">
      <header className="app-header">
        <h1><Link to="/" className="app-title-link">{env.appName}</Link></h1>
      </header>
      <main className="page-shell">{children}</main>
    </div>
  )
}
