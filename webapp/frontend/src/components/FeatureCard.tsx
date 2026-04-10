import { LinkButton } from '../shared/components/Button'
import { Panel } from '../shared/components/Panel'

type FeatureCardProps = {
  code: string
  title: string
  description: string
  to: string
}

export function FeatureCard({ code, title, description, to }: FeatureCardProps) {
  return (
    <Panel>
      <div className="feature-card__code">{code}</div>
      <h2>{title}</h2>
      <p>{description}</p>
      <LinkButton className="feature-card__link" to={to}>
        進入 {code}
      </LinkButton>
    </Panel>
  )
}
