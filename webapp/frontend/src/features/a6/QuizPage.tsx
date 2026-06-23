import { useCallback, useEffect, useRef, useState } from 'react'
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
import { addSpeechEndListener, isTtsEnabled, isTtsSupported, speak } from '../../shared/speech/tts'
import { recognizeOnce } from '../../shared/speech/recognizeOnce'
import { MathDiagram } from '../a1/components/MathDiagram'
import { useSpeechCapture } from '../a1/speechCapture'
import { ArithmeticCard } from '../a3/components/ArithmeticCard'
import type { Operation } from '../a3/engine'

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

type ArithmeticExpression = { a: number; b: number; operation: Operation }

const COUNT_OPTIONS = [3, 5, 10]

/** A6 學科練習設定持久化 key（記住科目/年級/題數，跨 session 還原）。 */
const A6_PREFS_KEY = 'cecelearn:a6-prefs:v1'

type A6Prefs = { subject?: string; grade?: string; count?: number }

/** 讀回 A6 設定（壞值/不可用 fail-soft 回空物件，不擋功能）。 */
function loadA6Prefs(): A6Prefs {
  try {
    const raw = localStorage.getItem(A6_PREFS_KEY)
    return raw ? (JSON.parse(raw) as A6Prefs) : {}
  } catch {
    return {}
  }
}

/** 寫回 A6 設定（localStorage 不可用時略過，不擋功能）。 */
function saveA6Prefs(prefs: A6Prefs) {
  try {
    localStorage.setItem(A6_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* localStorage 不可用：略過持久化 */
  }
}

function norm(s: string): string {
  return s.trim().replace(/\s+/g, '').replace(/[。.。！!？?]$/, '')
}

/** 單一候選答案比對：正規化字串相等，或兩邊都是數值且相等。 */
function matchesOne(given: string, candidate: string): boolean {
  const a = norm(given)
  const b = norm(candidate)
  if (a && a === b) return true
  const na = Number(a)
  const nb = Number(b)
  return Number.isFinite(na) && Number.isFinite(nb) && na === nb
}

const CHINESE_DIGITS: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  兩: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
}

function parseChineseInteger(value: string): number | null {
  if (!/^[零〇一二兩三四五六七八九十百]+$/.test(value)) return null
  if (!/[十百]/.test(value) && value.length > 1) {
    return Number(value.split('').map((char) => CHINESE_DIGITS[char]).join(''))
  }
  let total = 0
  let current = 0
  for (const char of value) {
    if (char === '百') {
      total += (current || 1) * 100
      current = 0
    } else if (char === '十') {
      total += (current || 1) * 10
      current = 0
    } else {
      current = CHINESE_DIGITS[char]
    }
  }
  return total + current
}

function normalizeSpokenAnswer(value: string): string {
  const cleaned = norm(value)
    .replace(/^(答案是|答案|我選|選|是|等於)/, '')
    .replace(/(個|顆|隻|本|元|公分|公尺|毫米|mm|cm|m)$/i, '')
  const parsed = parseChineseInteger(cleaned)
  return parsed === null ? cleaned : String(parsed)
}

function parseArithmeticExpression(item: QuizServeItem): ArithmeticExpression | null {
  if (item.subject !== 'math') return null
  const text = `${item.viz?.equation ?? ''} ${item.stem}`
  const match = text.match(/(\d+)\s*([+\-−×*÷/])\s*(\d+)/)
  if (!match) return null
  const opMap: Record<string, Operation> = { '+': '+', '-': '-', '−': '-', '×': '*', '*': '*', '÷': '/', '/': '/' }
  return { a: Number(match[1]), operation: opMap[match[2]] ?? '+', b: Number(match[3]) }
}

/**
 * 批改：選擇題嚴格比對；造詞/跟讀為開放練習，作答即過；
 * 填空題比對「出題 AI 給的所有等價正確寫法」（acceptableAnswers，含單位變體與換算），
 * 命中任一即算對——例如「3.2公尺」「320公分」「3200mm」「3.2」都接受（DD-26）。
 */
function judge(item: QuizServeItem, given: string): boolean {
  if (item.type === 'choice') return given === item.answer
  if (item.type === 'make_word' || item.type === 'read_aloud') return given.trim().length > 0
  // 比對池：acceptableAnswers（若有）∪ answer。去空白去重。
  const pool = [item.answer, ...(item.acceptableAnswers ?? [])]
    .map((s) => s.trim())
    .filter(Boolean)
  return pool.some((candidate) => matchesOne(given, candidate))
}

export function QuizPage({ onClose, onComplete }: QuizPageProps = {}) {
  const { addScore } = useScore()
  // 小朋友不會用中文輸入法 → 填空題允許「用說的」。借用 A1 主辨識（不在 Provider 內時退回獨立辨識）。
  const capture = useSpeechCapture()
  const autoPromptedQuestionRef = useRef('')
  const [phase, setPhase] = useState<Phase>('setup')
  const [error, setError] = useState('')
  const [listening, setListening] = useState(false)
  const [micHint, setMicHint] = useState('')

  // 範圍（哪些科目×年級有題目）
  const [ranges, setRanges] = useState<QuizRange[]>([])
  const [subject, setSubject] = useState('')
  const [grade, setGrade] = useState('')
  // 題數 lazy-init：還原上次選擇（不在 COUNT_OPTIONS 內則退 5）。
  const [count, setCount] = useState(() => {
    const c = loadA6Prefs().count
    return typeof c === 'number' && COUNT_OPTIONS.includes(c) ? c : 5
  })

  // 測驗狀態
  const [items, setItems] = useState<QuizServeItem[]>([])
  const [idx, setIdx] = useState(0)
  const [input, setInput] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [judging, setJudging] = useState(false)
  const [correct, setCorrect] = useState(false)
  const [judgeFeedback, setJudgeFeedback] = useState('')
  const [numCorrect, setNumCorrect] = useState(0)
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)

  const item = items[idx] ?? null

  // 載入可選範圍；優先還原上次選擇（須仍在 ranges 內，否則退回第一個有料的）。
  useEffect(() => {
    apiClient
      .getQuizRanges()
      .then((res) => {
        const rs = res.ranges ?? []
        setRanges(rs)
        if (rs.length === 0) return
        const saved = loadA6Prefs()
        // 還原須驗證該 subject×grade 組合仍存在於 ranges（題庫可能變動），否則退預設。
        const restored = rs.find((r) => r.subject === saved.subject && r.grade === saved.grade)
        if (restored) {
          setSubject(restored.subject)
          setGrade(restored.grade)
        } else {
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
      setJudging(false)
      setJudgeFeedback('')
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

  const finishSubmit = useCallback((ok: boolean, feedback = '') => {
    setCorrect(ok)
    setJudgeFeedback(feedback)
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
  }, [addScore, combo])

  const submitAnswer = useCallback(async (answerOverride?: string) => {
    if (!item || submitted || judging) return
    const given = answerOverride ?? (item.type === 'choice' ? picked ?? '' : input)
    if (!given.trim()) return
    setJudging(true)
    setMicHint('')
    try {
      if (item.subject === 'math') {
        const judged = await apiClient.judgeQuizAnswer(item, given)
        if (!judged.ok) {
          setMicHint(judged.message)
          return
        }
        if (item.type !== 'choice') setInput(judged.normalizedAnswer)
        finishSubmit(judged.correct, judged.feedback)
        return
      }
      finishSubmit(judge(item, given))
    } finally {
      setJudging(false)
    }
  }, [finishSubmit, input, item, judging, picked, submitted])

  // 用說的作答：英文科聽 en-US，其餘（國語/數學）聽中文。數學題聽到後直接送 AI 判題。
  const listen = useCallback(async () => {
    if (!item || submitted || listening || judging) return
    const lang = item.subject === 'english' ? 'en-US' : 'cmn-Hant-TW'
    setListening(true)
    setMicHint('')
    try {
      const transcript = capture
        ? await capture.captureOnce({ lang })
        : await recognizeOnce(lang)
      const said = transcript.trim()
      if (said) {
        if (item.subject === 'math') {
          const normalized = normalizeSpokenAnswer(said)
          if (item.type !== 'choice') setInput(normalized)
          await submitAnswer(normalized)
          return
        }
        if (item.type === 'choice' && item.choices?.length) {
          const normalizedSaid = normalizeSpokenAnswer(said)
          const choice = item.choices.find((candidate) => matchesOne(normalizedSaid, candidate) || normalizeSpokenAnswer(candidate) === normalizedSaid)
          if (choice) setPicked(choice)
          else setMicHint(`聽到「${said}」，請點一下答案或再說一次。`)
        } else {
          setInput(normalizeSpokenAnswer(said))
        }
      }
      else setMicHint('沒聽清楚，再說一次好嗎？')
    } catch {
      setMicHint('沒聽到，再按一次麥克風喔')
    } finally {
      setListening(false)
    }
  }, [capture, item, judging, listening, submitAnswer, submitted])

  useEffect(() => {
    if (phase !== 'quiz' || !item || item.subject !== 'math' || submitted) return
    const questionKey = `${idx}:${item.id}`
    if (autoPromptedQuestionRef.current === questionKey) return
    autoPromptedQuestionRef.current = questionKey

    let cancelled = false
    const startListening = () => {
      if (cancelled) return
      void listen()
    }

    setMicHint('聽完題目後，直接說答案。')
    if (isTtsSupported() && isTtsEnabled()) {
      const removeSpeechEndListener = addSpeechEndListener(() => {
        removeSpeechEndListener()
        window.setTimeout(startListening, 250)
      })
      speak(item.stem, { id: `quiz-${item.id}` })
      const fallbackTimer = window.setTimeout(() => {
        removeSpeechEndListener()
        startListening()
      }, Math.min(15_000, Math.max(3_000, item.stem.length * 260)))
      return () => {
        cancelled = true
        removeSpeechEndListener()
        window.clearTimeout(fallbackTimer)
      }
    }

    const timer = window.setTimeout(startListening, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [idx, item, listen, phase, submitted])

  function next() {
    if (idx < items.length - 1) {
      setIdx((i) => i + 1)
      setInput('')
      setPicked(null)
      setSubmitted(false)
      setJudging(false)
      setJudgeFeedback('')
      setMicHint('')
    } else {
      setPhase('result')
      celebrate()
      onComplete?.({ mode: 'quiz', correct: numCorrect, total: items.length, maxCombo })
    }
  }

  const subjectName = ranges.find((r) => r.subject === subject)?.subjectName ?? subject
  const arithmeticExpression = item ? parseArithmeticExpression(item) : null

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
                    const s = e.target.value
                    setSubject(s)
                    const g = ranges.find((r) => r.subject === s)?.grade
                    if (g) setGrade(g)
                    saveA6Prefs({ subject: s, grade: g ?? grade, count })
                  }}
                >
                  {subjects.map(([s, name]) => (
                    <option key={s} value={s}>{name}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: '0.25rem' }}>
                <span className="muted">年級</span>
                <select
                  value={grade}
                  onChange={(e) => {
                    setGrade(e.target.value)
                    saveA6Prefs({ subject, grade: e.target.value, count })
                  }}
                >
                  {gradesForSubject.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: '0.25rem' }}>
                <span className="muted">題數</span>
                <select
                  value={count}
                  onChange={(e) => {
                    const c = Number(e.target.value)
                    setCount(c)
                    saveA6Prefs({ subject, grade, count: c })
                  }}
                >
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

          {/* 數數量題（tally）：圖即題目，必須在作答前顯示 */}
          {item.viz?.kind === 'tally' && <MathDiagram viz={item.viz} />}

          {/* 跟讀題（read_aloud）指示：講白「照著唸」，避免小朋友以為要回答/翻譯。 */}
          {item.type === 'read_aloud' && !submitted && (
            <p className="a6-readaloud-hint">
              🗣️ 這題是「照著唸」：先按 🔊 聽老師唸一次，再按 🎤 跟著把上面的句子唸出來就好，不用回答問題喔！
            </p>
          )}

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
                    disabled={submitted || judging}
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
                  disabled={submitted || judging}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void submitAnswer() }}
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
                  disabled={submitted || listening || judging}
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
              {judgeFeedback && <p className="muted" style={{ margin: '0.25rem 0 0.75rem' }}>{judgeFeedback}</p>}
              {/* tally 圖即題目，上方已顯示；解說區不再重畫同一張圖（DD：避免重複＋撐長到要捲動）。
                  count/groups 是作答後才揭曉的解法圖解，保留。 */}
              {item.viz && item.viz.kind !== 'tally' && <MathDiagram viz={item.viz} />}
              {arithmeticExpression && (
                <div style={{ marginTop: '0.75rem' }}>
                  <ArithmeticCard
                    key={`${item.id}-${arithmeticExpression.a}-${arithmeticExpression.operation}-${arithmeticExpression.b}`}
                    a={arithmeticExpression.a}
                    b={arithmeticExpression.b}
                    operation={arithmeticExpression.operation}
                    compact
                    narrate
                    autoStart
                  />
                </div>
              )}
              {item.steps.length > 0 && (
                <ol style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem', lineHeight: 1.7 }}>
                  {item.steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              )}
            </div>
          )}

          <div className="toolbar-row" style={{ marginTop: '1rem' }}>
            {!submitted ? (
              <Button onClick={() => void submitAnswer()} disabled={judging || (item.type === 'choice' ? !picked : !input.trim())}>{judging ? 'AI 判題中…' : '送出答案'}</Button>
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
