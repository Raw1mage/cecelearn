import { FeatureCard } from '../components/FeatureCard'

const features = [
  {
    code: 'A1',
    title: '國字查詢',
    description: '語音輸入查詢注音、詞組，還有筆順動畫可以重播學習。',
    to: '/a1',
  },
  {
    code: 'A2',
    title: '成語練習',
    description: '從成語詞庫出題，選擇題作答後可以查看錯題和解釋。',
    to: '/a2',
  },
  {
    code: 'A3',
    title: '四則運算',
    description: '輸入數字選運算，逐步播放計算過程，支援暫停和重播。',
    to: '/a3',
  },
]

export function PortalPage() {
  return (
    <>
      <section className="hero">
        <span className="hero__eyebrow">學習入口</span>
        <h2>選擇一個學習活動</h2>
        <p>希希小家教的學習園地，從下面的卡片開始吧！</p>
      </section>

      <section className="feature-grid" aria-label="Learning features">
        {features.map((feature) => (
          <FeatureCard key={feature.code} {...feature} />
        ))}
      </section>
    </>
  )
}
