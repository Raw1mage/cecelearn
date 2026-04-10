import type { PropsWithChildren } from 'react'

export function Panel({ children }: PropsWithChildren) {
  return <section className="ui-panel">{children}</section>
}
