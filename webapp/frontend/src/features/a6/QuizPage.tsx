import { useEffect, useState } from 'react'
import {
  apiClient,
  type QuizServeItem,
  type QuizRange,
  type QuizSummary,
} from '../../shared/api/client'
import { celebrate } from '../../shared/celebrate'
import { Button } from '../../shared/components/Button'
import { Panel } from '../../shared/components/Panel'
import { useScore } from '../../shared/ScoreContext'
import { speak } from '../../shared/speech/tts'
import { recognizeOnce } from '../../shared/speech/recognizeOnce'
import { MathDiagram } from '../a1/components/MathDiagram'
import { useSpeechCapture } from '../a1/speechCapture'

/**
 * QuizPage —— 學科練習 overlay（出題等作答）。
 *
 * 補上對話流缺的「出題 → 停下來等作答 → 即時批改」機制：題目來自 quizbank（後端
 * /api/quiz），一題一題作答，批改後才揭曉講解 + 確定性圖解，最後回流成績卡。
 * 沿用聽寫/成語 overlay 的 onClose/onComplete 契約（DD-2/DD-6）。
 */

type Phase = 'setup' | 'loading' | 'quiz' | 'result'

type QuizPageProps = {
  onClose?: () => void
  onComplete?: (summary: QuizSummary) => void
}

const COUNT_OPTIONS = [3, 5, 10]

function norm(s: string): string {
  return s.trim().replace(/\s+/g, '').replace(/[。.。！!？?]$/, '')
}

/** 批改：選擇題嚴格比對；填空數值容忍格式；造詞/跟讀為開放練習，作答即過。 */
function judge(item: QuizServeItem, given: string): boolean {
  if (item.type === 'choice') return given === item.answer
  if (item.type === 'make_word' || item.type === 'read_aloud') return given.trim().length > 0
  const a = norm(given)
  const b = norm(item.answer)
  if (a && a === b) return true
  const na = Number(a)
  const nb = Number(b)
  return Number.isFinite(na) && Number.isFinite(nb) && na === nb
}

export function QuizPage({ onClose, onComplete }: QuizPageProps = {}) {
  const { addScore } = useScore()
  // 小朋友不會用中文輸入法 → 填空題允許「用說的」。借用 A1 主辨識（不在 Provider 內時退回獨立辨識）。
  const capture = useSpeechCapture()
  const [phase, setPhase] = useState<Phase>('setup')
  const [error, setError] = useState('')
  const [listening, setListening] = useState(false)
  const [micHint, setMicHint] = useState('')

  // 範圍（哪些科目×年級有題目）
  const [ranges, setRanges] = useState<QuizRange[]>([])
  const [subject, setSubject] = useState('')
  const [grade, setGrade] = useState('')
  const [count, setCount] = useState(5)

  // 測驗狀態
  const [items, setItems] = useState<QuizServeItem[]>([])
  const [idx, setIdx] = useState(0)
  const [input, setInput] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [correct, setCorrect] = useState(false)
  const [numCorrect, setNumCorrect] = useState(0)
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)

  const item = items[idx] ?? null

  // 載入可選範圍；預設第一個有料的（目前是數學・3年級）
  useEffect(() => {
    apiClient
      .getQuizRanges()
      .then((res) => {
        const rs = res.ranges ?? []
        setRanges(rs)
        if (rs.length > 0) {
          setSubject(rs[0].subject)
          setGrade(rs[0].grade)
        }
      })
      .catch(() => setRanges([]))
  }, [])

  const subjects = Array.from(new Map(ranges.map((r) => [r.subject, r.subjectName])).entries())
  const gradesForSubject = ranges.filter((r) => r.subject === subject).map((r) => r.grade)

  async function start() {
    setError('')
    setPhase('loading')
    try {
      const res = await apiClient.fetchQuiz({ subject, grade, count })
      if (!res.items || res.items.length === 0) {
        setError('這個範圍還沒有題目喔，換一個試試看！')
        setPhase('setup')
        return
      }
      setItems(res.items)
      setIdx(0)
      setInput('')
      setPicked(null)
      setSubmitted(false)
      setMicHint('')
      setNumCorrect(0)
      setCombo(0)
      setMaxCombo(0)
      setPhase('quiz')
    } catch (e) {
      setError(e instanceof Error ? e.message : '出題失敗')
      setPhase('setup')
    }
  }

  // 用說的作答：英文科聽 en-US，其餘（國語/數學）聽中文。聽到就填進輸入框，讓小朋友能改。
  async function listen() {
    if (!item || submitted || listening) return
    const lang = item.subject === 'english' ? 'en-US' : 'cmn-Hant-TW'
    setListening(true)
    setMicHint('')
    try {
      const transcript = capture
        ? await capture.captureOnce({ lang })
        : await recognizeOnce(lang)
      const said = transcript.trim()
      if (said) setInput(said)
      else setMicHint('沒聽清楚，再說一次好嗎？')
    } catch {
      setMicHint('沒聽到，再按一次麥克風喔')
    } finally {
      setListening(false)
    }
  }

  function submit() {
    if (!item || submitted) return
    const given = item.type === 'choice' ? picked ?? '' : input
    if (!given.trim()) return
    const ok = judge(item, given)
    setCorrect(ok)
    setSubmitted(true)
    if (ok) {
      const nc = combo + 1
      setCombo(nc)
      setMaxCombo((m) => Math.max(m, nc))
      const mult = nc >= 10 ? 2 : nc >= 5 ? 1.5 : 1
      addScore(Math.round(10 * mult))
      setNumCorrect((n) => n + 1)
      celebrate()
    } else {
      setCombo(0)
    }
  }

  function next() {
    if (idx < items.length - 1) {
      setIdx((i) => i + 1)
      setInput('')
      setPicked(null)
      setSubmitted(false)
      setMicHint('')
    } else {
      setPhase('result')
      celebrate()
      onComplete?.({ mode: 'quiz', correct: numCorrect, total: items.length, maxCombo })
    }
  }

  const subjectName = ranges.find((r) => r.subject === subject)?.subjectName ?? subject

  return (
    <div className="feature-page a6-quiz-page">
      {phase === 'setup' && (
        <Panel>
          <h3 style={{ margin: '0 0 0.75rem' }}>📝 學科練習</h3>
          {ranges.length === 0 ? (
            <p className="muted">題庫還在準備中，請稍後再試。</p>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem', maxWidth: 360 }}>
              <label style={{ display: 'grid', gap: '0.25rem' }}>
                <span className="muted">科目</span>
                <select
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value)
                    const g = ranges.find((r) => r.subject === e.target.value)?.grade
                    if (g) setGrade(g)
                  }}
                >
                  {subjects.map(([s, name]) => (
                    <option key={s} value={s}>{name}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: '0.25rem' }}>
                <span className="muted">年級</span>
                <select value={grade} onChange={(e) => setGrade(e.target.value)}>
                  {gradesForSubject.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: '0.25rem' }}>
                <span className="muted">題數</span>
                <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                  {COUNT_OPTIONS.map((c) => (
                    <option key={c} value={c}>{c} 題</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {error && <p className="error-text">{error}</p>}
          <div className="toolbar-row" style={{ marginTop: '1rem' }}>
            {ranges.length > 0 && <Button onClick={start}>開始練習</Button>}
            {onClose && <Button variant="secondary" onClick={onClose}>回到小雞老師</Button>}
          </div>
        </Panel>
      )}

      {phase === 'loading' && <Panel><p>出題中…</p></Panel>}

      {phase === 'quiz' && item && (
        <Panel>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="muted">{subjectName}・第 {idx + 1} / {items.length} 題</span>
            {combo >= 3 && <span className="muted">{combo} 連擊{combo >= 10 ? ' ×2' : combo >= 5 ? ' ×1.5' : ''}</span>}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.75rem 0' }}>
            <p style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, flex: 1 }}>{item.stem}</p>
            <button
              type="button"
              className="a1-quick-chip"
              onClick={() => speak(item.stem, { id: `quiz-${item.id}` })}
              aria-label="唸題目"
            >
              🔊
            </button>
          </div>

          {/* 作答區 */}
          {item.type === 'choice' && item.choices ? (
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {item.choices.map((c) => {
                const isPick = picked === c
                const isAns = c === item.answer
                const bg = submitted
                  ? isAns
                    ? 'rgba(52,211,153,0.25)'
                    : isPick
                      ? 'rgba(239,68,68,0.2)'
                      : undefined
                  : isPick
                    ? 'rgba(99,102,241,0.2)'
                    : undefined
                return (
                  <button
                    key={c}
                    type="button"
                    disabled={submitted}
                    onClick={() => setPicked(c)}
                    style={{
                      padding: '0.75rem 1rem',
                      borderRadius: 12,
                      border: '1.5px solid rgba(148,163,184,0.4)',
                      background: bg ?? 'transparent',
                      color: 'inherit',
                      fontSize: '1.1rem',
                      textAlign: 'left',
                      cursor: submitted ? 'default' : 'pointer',
                    }}
                  >
                    {c}
                  </button>
                )
              })}
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  value={input}
                  disabled={submitted}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
                  placeholder="把答案打進來，或按麥克風用說的…"
                  style={{
                    flex: 1,
                    padding: '0.75rem 1rem',
                    fontSize: '1.2rem',
                    borderRadius: 12,
                    border: '1.5px solid rgba(148,163,184,0.4)',
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  type="button"
                  className={`a1-en-speak${listening ? ' a1-en-speak--active' : ''}`}
                  disabled={submitted || listening}
                  onClick={() => void listen()}
                  aria-label="用說的作答"
                  title="用說的作答"
                  style={{ flex: '0 0 auto', fontSize: '1.1rem', padding: '0.6rem 0.9rem' }}
                >
                  {listening ? '🎙️…' : '🎤'}
                </button>
              </div>
              {micHint && <p className="muted" style={{ margin: '0.4rem 0 0' }}>{micHint}</p>}
            </div>
          )}

          {/* 批改後揭曉：結果 + 講解 + 圖解 */}
          {submitted && (
            <div style={{ marginTop: '1rem' }}>
              <p style={{ fontSize: '1.3rem', fontWeight: 700, color: correct ? '#34d399' : '#fb7185' }}>
                {correct ? '答對了！🎉' : '再加油！'}
                {!correct && item.type !== 'make_word' && item.type !== 'read_aloud' && (
                  <span style={{ marginLeft: '0.5rem', fontWeight: 400 }}>正確答案：{item.answer}</span>
                )}
              </p>
              {item.viz && <MathDiagram viz={item.viz} />}
              {item.steps.length > 0 && (
                <ol style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem', lineHeight: 1.7 }}>
                  {item.steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              )}
            </div>
          )}

          <div className="toolbar-row" style={{ marginTop: '1rem' }}>
            {!submitted ? (
              <Button onClick={submit} disabled={item.type === 'choice' ? !picked : !input.trim()}>送出答案</Button>
            ) : (
              <Button onClick={next}>{idx < items.length - 1 ? '下一題 →' : '看成績 ✓'}</Button>
            )}
            {onClose && <Button variant="secondary" onClick={onClose}>結束</Button>}
          </div>
        </Panel>
      )}

      {phase === 'result' && (
        <Panel>
          <h3>練習完成 🎉</h3>
          <div style={{ display: 'flex', gap: '2rem', margin: '1rem 0' }}>
            <div><div style={{ fontSize: '2rem', fontWeight: 800 }}>{numCorrect}</div><div className="muted">答對</div></div>
            <div><div style={{ fontSize: '2rem', fontWeight: 800 }}>{items.length}</div><div className="muted">總題數</div></div>
            <div><div style={{ fontSize: '2rem', fontWeight: 800 }}>{maxCombo}</div><div className="muted">最高連擊</div></div>
          </div>
          <div className="toolbar-row">
            <Button onClick={() => setPhase('setup')}>再來一次</Button>
            {onClose && <Button variant="secondary" onClick={onClose}>回到小雞老師</Button>}
          </div>
        </Panel>
      )}
    </div>
  )
}
