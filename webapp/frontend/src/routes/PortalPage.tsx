import { FeatureCard } from '../components/FeatureCard'

const features = [
  {
    title: '國字查詢',
    description: '語音輸入查詢注音、詞組，還有筆順動畫可以重播學習。',
    to: '/a1',
  },
  {
    title: '成語練習',
    description: '從成語詞庫出題，選擇題作答後可以查看錯題和解釋。',
    to: '/a2',
  },
  {
    title: '四則運算',
    description: '輸入數字選運算，逐步播放計算過程，支援暫停和重播。',
    to: '/a3',
  },
]

export function PortalPage() {
  return (
    <>
      <section className="feature-grid" aria-label="Learning features">
        {features.map((feature) => (
          <FeatureCard key={feature.to} {...feature} />
        ))}
      </section>
    </>
  )
}
