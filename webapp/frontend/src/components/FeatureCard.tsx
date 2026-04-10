import { Link } from 'react-router-dom'

type FeatureCardProps = {
  title: string
  description: string
  to: string
}

export function FeatureCard({ title, description, to }: FeatureCardProps) {
  return (
    <Link to={to} className="ui-panel feature-card-link">
      <h2>{title}</h2>
      <p>{description}</p>
    </Link>
  )
}
