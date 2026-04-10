import type { PropsWithChildren } from 'react'
import { NavLink } from 'react-router-dom'
import { env } from '../config/env'

const navItems = [
  { to: '/', label: '首頁' },
  { to: '/a1', label: '查字詞' },
  { to: '/a2', label: '成語練習' },
  { to: '/a3', label: '四則運算' },
]

export function AppLayout({ children }: PropsWithChildren) {
  return (
    <div className="app-frame">
      <header className="app-header">
        <div>
          <p className="app-header__eyebrow">學習平台</p>
          <h1>{env.appName}</h1>
        </div>
        <nav className="app-nav" aria-label="Primary">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `app-nav__link${isActive ? ' app-nav__link--active' : ''}`}
              end={item.to === '/'}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="page-shell">{children}</main>
    </div>
  )
}
