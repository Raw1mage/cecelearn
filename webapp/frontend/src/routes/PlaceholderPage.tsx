import { Link } from 'react-router-dom'

type PlaceholderPageProps = {
  code: string
  title: string
  description: string
}

export function PlaceholderPage({ code, title, description }: PlaceholderPageProps) {
  return (
    <main className="page-shell page-shell--narrow">
      <div className="placeholder-card">
        <span className="feature-card__code">{code}</span>
        <h1>{title}</h1>
        <p>{description}</p>
        <Link className="feature-card__link" to="/">
          Back to portal
        </Link>
      </div>
    </main>
  )
}
