import { useEffect, useState } from 'react'
import { apiClient, type A5QuizItem } from '../../shared/api/client'
import { celebrate } from '../../shared/celebrate'
import { Button } from '../../shared/components/Button'
import { Panel } from '../../shared/components/Panel'
import { useScore } from '../../shared/ScoreContext'
import { speak, isTTSSupported } from './tts'
import { WritingPad } from './WritingPad'

type Phase = 'setup' | 'loading' | 'quiz' | 'result'
type RangeMode = 'random' | 'curriculum' | 'custom'

const PREFS_KEY = 'cecelearn-a5-prefs'

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    return raw ? JSON.parse(raw) as Record<string, string> : {}
  } catch { return {} }
}

function savePrefs(prefs: Record<string, string>) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch { /* ignore */ }
}

type AnswerRecord = {
  word: string
  submitted: boolean
  correct: boolean
  hinted: boolean
}

export function A5Page() {
  const { addScore } = useScore()

  // Setup state (restore from localStorage)
  const prefs = loadPrefs()
  const [phase, setPhase] = useState<Phase>('setup')
  const [rangeMode, setRangeMode] = useState<RangeMode>((prefs.rangeMode as RangeMode) || 'random')
  const [publisher, setPublisher] = useState(prefs.publisher || '康軒版')
  const [grade, setGrade] = useState(prefs.grade || '1年級')
  const [availableSemesters, setAvailableSemesters] = useState<string[]>([])
  const [semester, setSemester] = useState('')
  const [availableLessons, setAvailableLessons] = useState<string[]>([])
  const [selectedLessons, setSelectedLessons] = useState<string[]>([])
  const [questionCount, setQuestionCount] = useState(Number(prefs.questionCount) || 5)
  const [customChars, setCustomChars] = useState('')
  const [error, setError] = useState('')

  // Fetch semesters when publisher/grade changes
  useEffect(() => {
    if (rangeMode !== 'curriculum') return
    apiClient.getVocabMeta(publisher, grade).then(meta => {
      setAvailableSemesters(meta.semesters)
      setSemester(meta.semesters[0] ?? '')
      setSelectedLessons([])
    }).catch(() => setAvailableSemesters([]))
  }, [publisher, grade, rangeMode])

  // Fetch lessons when semester changes
  useEffect(() => {
    if (rangeMode !== 'curriculum' || !semester) return
    apiClient.getVocabMeta(publisher, grade, semester).then(meta => {
      setAvailableLessons(meta.lessons)
      setSelectedLessons([])
    }).catch(() => setAvailableLessons([]))
  }, [publisher, grade, semester, rangeMode])

  // Quiz state
  const [items, setItems] = useState<A5QuizItem[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState<AnswerRecord[]>([])
  const [showHint, setShowHint] = useState(false)
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)
  const [speaking, setSpeaking] = useState(false)

  const currentItem = items[currentIdx]
  const totalCorrect = answers.filter(a => a.correct).length

  async function startQuiz() {
    setError('')
    savePrefs({ rangeMode, publisher, grade, questionCount: String(questionCount) })
    setPhase('loading')
    try {
      const res = await apiClient.generateVocabQuiz({
        mode: rangeMode,
        publisher: rangeMode === 'curriculum' ? publisher : undefined,
        grade: rangeMode === 'curriculum' ? grade : undefined,
        semester: rangeMode === 'curriculum' ? semester : undefined,
        lessons: rangeMode === 'curriculum' && selectedLessons.length > 0 ? selectedLessons : undefined,
        customChars: rangeMode === 'custom' ? customChars : undefined,
        questionCount,
      })
      if (!res.items || res.items.length === 0) {
        setError('出題失敗，範圍內沒有足夠的生字。')
        setPhase('setup')
        return
      }
      setItems(res.items)
      setAnswers(res.items.map(item => ({ word: item.word, submitted: false, correct: false, hinted: false })))
      setCurrentIdx(0)
      setCombo(0)
      setMaxCombo(0)
      setShowHint(false)
      setPhase('quiz')
      // Auto-play first question
      setTimeout(() => playQuestion(res.items[0]), 500)
    } catch (e) {
      setError(e instanceof Error ? e.message : '出題失敗')
      setPhase('setup')
    }
  }

  async function playQuestion(item: A5QuizItem) {
    if (!isTTSSupported()) return
    setSpeaking(true)
    try {
      // Read the full sentence, then ask "X怎麼寫"
      await speak(item.sentence, 0.8)
      await speak(`${item.word}，怎麼寫？`, 0.7)
    } catch { /* ignore */ }
    setSpeaking(false)
  }

  function hintDown() {
    setShowHint(true)
    setAnswers(prev => prev.map((a, i) => i === currentIdx ? { ...a, hinted: true } : a))
  }

  function hintUp() {
    setShowHint(false)
  }

  function handleSubmit() {
    // For now, any submission with strokes = correct (no OCR)
    // If hint was used, reduced score
    const hinted = answers[currentIdx].hinted
    const isCorrect = true // Accept all handwriting submissions
    const points = hinted ? 1 : 3

    const newCombo = isCorrect ? combo + 1 : 0
    setCombo(newCombo)
    if (newCombo > maxCombo) setMaxCombo(newCombo)

    // Apply combo multiplier
    const multiplier = newCombo >= 10 ? 2 : newCombo >= 5 ? 1.5 : 1
    const finalPoints = Math.round(points * multiplier)
    addScore(finalPoints)

    setAnswers(prev => prev.map((a, i) => i === currentIdx ? { ...a, submitted: true, correct: isCorrect } : a))
    setShowHint(false)

    // Auto advance after brief delay
    if (currentIdx < items.length - 1) {
      setTimeout(() => {
        setCurrentIdx(prev => prev + 1)
        setShowHint(false)
        // Play next word
        playQuestion(items[currentIdx + 1])
      }, 800)
    } else {
      // All done
      setTimeout(() => {
        setPhase('result')
        if (totalCorrect + 1 === items.length) celebrate()
      }, 800)
    }
  }

  function resetQuiz() {
    setPhase('setup')
    setItems([])
    setAnswers([])
    setCurrentIdx(0)
    setCombo(0)
    setMaxCombo(0)
    setShowHint(false)
  }

  function replay() {
    setCurrentIdx(0)
    setAnswers(items.map(item => ({ word: item.word, submitted: false, correct: false, hinted: false })))
    setCombo(0)
    setMaxCombo(0)
    setShowHint(false)
    setPhase('quiz')
    setTimeout(() => playQuestion(items[0]), 500)
  }

  return (
    <div className="feature-page a5-page">
      {phase === 'setup' && (
        <Panel>
          <h3>聽寫設定</h3>
          <label className="field-block">
            出題範圍
            <select value={rangeMode} onChange={e => setRangeMode(e.target.value as RangeMode)}>
              <option value="random">隨機出題</option>
              <option value="curriculum">按課綱篩選</option>
              <option value="custom">自訂生字</option>
            </select>
          </label>
          {rangeMode === 'curriculum' && (
            <>
              <label className="field-block">
                出版社
                <select value={publisher} onChange={e => setPublisher(e.target.value)}>
                  <option value="南一版">南一版</option>
                  <option value="康軒版">康軒版</option>
                  <option value="翰林版">翰林版</option>
                </select>
              </label>
              <label className="field-block">
                年級
                <select value={grade} onChange={e => setGrade(e.target.value)}>
                  {['1年級','2年級','3年級','4年級','5年級','6年級'].map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </label>
              {availableSemesters.length > 0 && (
                <label className="field-block">
                  學期
                  <select value={semester} onChange={e => setSemester(e.target.value)}>
                    {availableSemesters.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
              )}
              {availableLessons.length > 0 && (
                <div className="field-block">
                  <span>課次（不選 = 全部）</span>
                  <div className="a5-lesson-grid">
                    {availableLessons.map(lesson => (
                      <label key={lesson} className="a5-lesson-check">
                        <input
                          type="checkbox"
                          checked={selectedLessons.includes(lesson)}
                          onChange={e => {
                            if (e.target.checked) setSelectedLessons(prev => [...prev, lesson])
                            else setSelectedLessons(prev => prev.filter(l => l !== lesson))
                          }}
                        />
                        <span>{lesson}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {rangeMode === 'custom' && (
            <label className="field-block">
              自訂生字
              <input value={customChars} onChange={e => setCustomChars(e.target.value)} placeholder="輸入生字，例如：學校花草天地" />
            </label>
          )}
          <label className="field-block">
            題數
            <input type="number" min={1} max={20} value={questionCount} onChange={e => setQuestionCount(Number(e.target.value))} />
          </label>
          {error && <p className="error-text">{error}</p>}
          <div className="toolbar-row">
            <Button onClick={startQuiz}>開始聽寫</Button>
          </div>
        </Panel>
      )}

      {phase === 'loading' && (
        <Panel><p>出題中...</p></Panel>
      )}

      {phase === 'quiz' && currentItem && (
        <Panel>
          <div className="a5-quiz-header">
            <span className="a5-progress">第 {currentIdx + 1} / {items.length} 題</span>
            {combo >= 3 && <span className="a5-combo">🔥 {combo} 連擊{combo >= 5 ? ' ×1.5' : ''}{combo >= 10 ? ' ×2' : ''}</span>}
          </div>

          <WritingPad
            onSubmit={handleSubmit}
            answer={currentItem.word}
            showHint={showHint}
          />

          <div className="a5-actions">
            <button className="a5-action-btn" onClick={() => playQuestion(currentItem)} disabled={speaking} aria-label="重聽">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              <span>重聽</span>
            </button>
            <button className="a5-action-btn" onMouseDown={hintDown} onMouseUp={hintUp} onMouseLeave={hintUp} onTouchStart={hintDown} onTouchEnd={hintUp} aria-label="提示">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span>提示</span>
            </button>
          </div>

          {answers[currentIdx]?.submitted && (
            <div className="a5-feedback a5-feedback--correct">
              <span className="a5-feedback-answer">{currentItem.word}</span>
              <span className="a5-feedback-score">✓ {answers[currentIdx].hinted ? '+1' : '+3'} 分</span>
            </div>
          )}
        </Panel>
      )}

      {phase === 'result' && (
        <Panel>
          <h3>聽寫完成</h3>
          <div className="a5-result-stats">
            <div className="a5-stat">
              <span className="a5-stat-value">{totalCorrect}</span>
              <span className="a5-stat-label">答對</span>
            </div>
            <div className="a5-stat">
              <span className="a5-stat-value">{items.length}</span>
              <span className="a5-stat-label">總題數</span>
            </div>
            <div className="a5-stat">
              <span className="a5-stat-value">{maxCombo}</span>
              <span className="a5-stat-label">最高連擊</span>
            </div>
          </div>
          <div className="a5-result-words">
            {items.map((item, i) => (
              <span key={item.id} className={`a5-result-word${answers[i]?.hinted ? ' a5-result-word--hinted' : ''}`}>
                {item.word}
                {answers[i]?.hinted && <small>（提示）</small>}
              </span>
            ))}
          </div>
          <div className="toolbar-row">
            <Button onClick={replay}>再來一次</Button>
            <Button variant="secondary" onClick={resetQuiz}>重新設定</Button>
          </div>
        </Panel>
      )}
    </div>
  )
}
