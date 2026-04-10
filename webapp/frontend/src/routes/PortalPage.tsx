import { FeatureCard } from '../components/FeatureCard'

const features = [
  {
    code: 'A1',
    title: 'Chinese Word Lookup',
    description: 'Speech-assisted lookup with bopomofo, backend-backed query parsing, and stroke-order replay.',
    to: '/a1',
  },
  {
    code: 'A2',
    title: 'Chinese Idiom Practice',
    description: 'Backend-generated quiz items with setup, answer flow, result, and review states.',
    to: '/a2',
  },
  {
    code: 'A3',
    title: 'Math 4 Operations Learn',
    description: 'Unified arithmetic practice with keypad input and pause/resume/cancel step playback.',
    to: '/a3',
  },
]

export function PortalPage() {
  return (
    <>
      <section className="hero">
        <span className="hero__eyebrow">Learning Portal</span>
        <h2>Choose a learning activity</h2>
        <p>A single webapp home for CeceLearn activities. Start from a portal card, then enter A1, A2, or A3.</p>
      </section>

      <section className="feature-grid" aria-label="Learning features">
        {features.map((feature) => (
          <FeatureCard key={feature.code} {...feature} />
        ))}
      </section>
    </>
  )
}
