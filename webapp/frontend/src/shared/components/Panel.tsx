import type { PropsWithChildren } from 'react'

export function Panel({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <section className={className ? `ui-panel ${className}` : 'ui-panel'}>{children}</section>
}
