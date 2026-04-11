import { useEffect, useRef, useState } from 'react'
import { apiClient, type A5QuizItem } from '../../shared/api/client'
import { celebrate } from '../../shared/celebrate'
import { Button } from '../../shared/components/Button'
import { Panel } from '../../shared/components/Panel'
import { useScore } from '../../shared/ScoreContext'
import { speak, isTTSSupported, unlockTTS, newSpeechSession, stopSpeaking } from './tts'

const TTS_PREFS_KEY = 'cecelearn-tts-prefs'
function loadTTSPrefs() {
  try { const r = localStorage.getItem(TTS_PREFS_KEY); return r ? JSON.parse(r) as { rate: number; pitch: number } : { rate: 0.8, pitch: 1 } }
  catch { return { rate: 0.8, pitch: 1 } }
}
function saveTTSPrefs(p: { rate: number; pitch: number }) {
  try { localStorage.setItem(TTS_PREFS_KEY, JSON.stringify(p)) } catch { /* ignore */ }
}
import { gradeHandwriting } from './grader'
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

  // Setup state (restore from localStorage — lazy init)
  const [phase, setPhase] = useState<Phase>('setup')
  const [rangeMode, setRangeMode] = useState<RangeMode>(() => (loadPrefs().rangeMode as RangeMode) || 'random')
  const [publisher, setPublisher] = useState(() => loadPrefs().publisher || '康軒版')
  const [grade, setGrade] = useState(() => loadPrefs().grade || '1年級')
  const [availableSemesters, setAvailableSemesters] = useState<string[]>([])
  const [semester, setSemester] = useState('')
  const [availableLessons, setAvailableLessons] = useState<string[]>([])
  const [selectedLessons, setSelectedLessons] = useState<string[]>([])
  const [questionCount, setQuestionCount] = useState(() => { const p = loadPrefs(); return p.questionCount === 'auto' ? 0 : (Number(p.questionCount) || 0) })
  const [wordType, setWordType] = useState<'word' | 'idiom'>(() => (loadPrefs().wordType as 'word' | 'idiom') || 'word')
  // 0 = auto (all characters in range)
  const [customChars, setCustomChars] = useState('')
  const [error, setError] = useState('')

  // Quiz state (must be before prefetch effect)
  const [charPool, setCharPool] = useState<string[]>([])
  const [itemBuffer, setItemBuffer] = useState<A5QuizItem[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [totalQuestions, setTotalQuestions] = useState(0)
  const [answers, setAnswers] = useState<AnswerRecord[]>([])
  const fetchingRef = useRef(new Set<number>())
  const [showHint, setShowHint] = useState(false)
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)
  const [speaking, setSpeaking] = useState(false)
  const [ttsPrefs, setTtsPrefs] = useState(loadTTSPrefs)
  const [showTtsSettings, setShowTtsSettings] = useState(false)
  const [hasStrokes, setHasStrokes] = useState(false)
  const [started, setStarted] = useState(false)
  const [gradeResult, setGradeResult] = useState<{ score: number; coverage: number; precision: number } | null>(null)
  const [earnedPoints, setEarnedPoints] = useState<number | null>(null)
  const canvasElRef = useRef<HTMLCanvasElement | null>(null)
  const [landscape, setLandscape] = useState(false)
  const totalCorrect = answers.filter(a => a.correct).length
  const currentItem = itemBuffer.find(item => item.id === `q-${currentIdx + 1}`) ?? null
  const isSubmitted = answers[currentIdx]?.submitted ?? false

  // Prefetch buffer: keep 3 items ahead of currentIdx
  useEffect(() => {
    if (phase !== 'quiz' || charPool.length === 0) return
    const BUFFER = 3
    for (let i = currentIdx; i < Math.min(currentIdx + BUFFER, charPool.length); i++) {
      if (fetchingRef.current.has(i)) continue
      if (itemBuffer.find(item => item.id === `q-${i + 1}`)) continue
      fetchingRef.current.add(i)
      const idx = i
      apiClient.fetchNextQuestion(charPool[idx], idx, wordType).then(item => {
        setItemBuffer(prev => prev.find(p => p.id === item.id) ? prev : [...prev, item])
      }).catch(() => {}).finally(() => fetchingRef.current.delete(idx))
    }
  // Only re-run when currentIdx changes or phase enters quiz — NOT when itemBuffer changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentIdx, charPool])

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


  async function startQuiz() {
    unlockTTS() // Must be called in user-gesture context for mobile
    setError('')
    savePrefs({ rangeMode, publisher, grade, questionCount: questionCount === 0 ? 'auto' : String(questionCount), wordType })
    setPhase('loading')
    try {
      const res = await apiClient.prepareVocabQuiz({
        mode: rangeMode,
        publisher: rangeMode === 'curriculum' ? publisher : undefined,
        grade: rangeMode === 'curriculum' ? grade : undefined,
        semester: rangeMode === 'curriculum' ? semester : undefined,
        lessons: rangeMode === 'curriculum' && selectedLessons.length > 0 ? selectedLessons : undefined,
        customChars: rangeMode === 'custom' ? customChars : undefined,
        questionCount: questionCount === 0 ? 9999 : questionCount,
      })
      if (!res.chars || res.chars.length === 0) {
        setError('出題失敗，範圍內沒有足夠的生字。')
        setPhase('setup')
        return
      }
      setCharPool(res.chars)
      setTotalQuestions(res.total)
      setItemBuffer([])
      setAnswers([])
      setCurrentIdx(0)
      setCombo(0)
      setMaxCombo(0)
      setShowHint(false)
      setHasStrokes(false)
      setStarted(false)
      setGradeResult(null)
      fetchingRef.current.clear()
      setPhase('quiz')
    } catch (e) {
      setError(e instanceof Error ? e.message : '出題失敗')
      setPhase('setup')
    }
  }

  function handleStop() {
    stopSpeaking()
    newSpeechSession()
    setSpeaking(false)
  }

  async function playQuestion(item: A5QuizItem) {
    if (!isTTSSupported()) return
    const signal = newSpeechSession()
    setSpeaking(true)
    try {
      await speak(item.sentence, ttsPrefs.rate, signal, ttsPrefs.pitch)
      if (!signal.aborted) await speak(`${item.word}，怎麼寫？`, ttsPrefs.rate * 0.9, signal, ttsPrefs.pitch)
    } catch { /* ignore */ }
    if (!signal.aborted) setSpeaking(false)
  }

  async function playAnswer(item: A5QuizItem) {
    if (!isTTSSupported()) return
    const signal = newSpeechSession()
    setSpeaking(true)
    try {
      await speak(item.word, ttsPrefs.rate * 0.9, signal, ttsPrefs.pitch)
    } catch { /* ignore */ }
    if (!signal.aborted) setSpeaking(false)
  }

  function updateTTSRate(rate: number) {
    const p = { ...ttsPrefs, rate }; setTtsPrefs(p); saveTTSPrefs(p)
  }
  function updateTTSPitch(pitch: number) {
    const p = { ...ttsPrefs, pitch }; setTtsPrefs(p); saveTTSPrefs(p)
  }

  function toggleHint() {
    const next = !showHint
    setShowHint(next)
    if (next) {
      setAnswers(prev => {
        const updated = [...prev]
        if (updated[currentIdx]) updated[currentIdx] = { ...updated[currentIdx], hinted: true }
        return updated
      })
    }
  }

  function handleHintQuizComplete(totalMistakes: number, totalStrokes: number) {
    if (!currentItem) return
    // Score = 5 × correct rate (correct strokes / total attempts)
    const totalAttempts = totalStrokes + totalMistakes
    const correctRate = totalAttempts > 0 ? totalStrokes / totalAttempts : 0
    const points = Math.round(5 * correctRate)
    setGradeResult(null)

    // Submit without clearing showHint — keep HanziWriter strokes as answer display
    const newCombo = combo + 1
    setCombo(newCombo)
    if (newCombo > maxCombo) setMaxCombo(newCombo)
    const multiplier = newCombo >= 10 ? 2 : newCombo >= 5 ? 1.5 : 1
    const finalPoints = Math.round(points * multiplier)
    addScore(finalPoints)
    setEarnedPoints(finalPoints)
    if (finalPoints > 0) celebrate()
    setAnswers(prev => {
      const updated = [...prev]
      updated[currentIdx] = { word: currentItem.word, submitted: true, correct: true, hinted: true }
      return updated
    })
    playAnswer(currentItem)
  }

  function handleSubmit() {
    if (!currentItem) return
    const answer = answers[currentIdx]
    const hinted = answer?.hinted ?? false

    // Grade handwriting → 0~10 points based on score percentage
    let grade = { score: 0, coverage: 0, precision: 0 }
    if (canvasElRef.current) {
      grade = gradeHandwriting(canvasElRef.current, currentItem.word)
    }
    setGradeResult(grade)
    const points = Math.round(grade.score * 10)  // 0~10
    submitWithPoints(points, hinted)
  }

  function submitWithPoints(points: number, hinted: boolean) {
    if (!currentItem) return

    const newCombo = combo + 1
    setCombo(newCombo)
    if (newCombo > maxCombo) setMaxCombo(newCombo)

    const multiplier = newCombo >= 10 ? 2 : newCombo >= 5 ? 1.5 : 1
    const finalPoints = Math.round(points * multiplier)
    addScore(finalPoints)
    setEarnedPoints(finalPoints)
    if (finalPoints > 0) celebrate()

    setAnswers(prev => {
      const updated = [...prev]
      updated[currentIdx] = { word: currentItem.word, submitted: true, correct: true, hinted }
      return updated
    })
    setShowHint(false)

    playAnswer(currentItem)
  }

  function handleNext() {
    if (currentIdx < totalQuestions - 1) {
      setCurrentIdx(prev => prev + 1)
      setShowHint(false)
      setHasStrokes(false)
      setGradeResult(null)
      setEarnedPoints(null)
    } else {
      setPhase('result')
      celebrate()
    }
  }

  // A5 page active: viewport-fit flex chain + real viewport height detection
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('a5-active')

    function updateVh() {
      // visualViewport gives the ACTUAL visible area excluding browser chrome
      const h = window.visualViewport?.height ?? window.innerHeight
      root.style.setProperty('--app-vh', `${h}px`)
    }
    updateVh()

    window.visualViewport?.addEventListener('resize', updateVh)
    window.addEventListener('resize', updateVh)

    return () => {
      root.classList.remove('a5-active')
      root.style.removeProperty('--app-vh')
      window.visualViewport?.removeEventListener('resize', updateVh)
      window.removeEventListener('resize', updateVh)
    }
  }, [])

  // Quiz phase: snap to top
  useEffect(() => {
    if (phase === 'quiz') window.scrollTo(0, 0)
  }, [phase])

  // Auto-play TTS when currentItem loads (skip first question until started)
  useEffect(() => {
    if (phase === 'quiz' && currentItem && (currentIdx > 0 || started)) {
      playQuestion(currentItem)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentItem?.id, started])

  function resetQuiz() {
    setPhase('setup')
    setCharPool([])
    setItemBuffer([])
    setAnswers([])
    setCurrentIdx(0)
    setTotalQuestions(0)
    setCombo(0)
    setMaxCombo(0)
    setShowHint(false)
    setHasStrokes(false)
    setStarted(false)
    setGradeResult(null)
    fetchingRef.current.clear()
  }

  function replay() {
    setItemBuffer([])
    setAnswers([])
    setCurrentIdx(0)
    setCombo(0)
    setMaxCombo(0)
    setShowHint(false)
    setHasStrokes(false)
    setStarted(false)
    setGradeResult(null)
    fetchingRef.current.clear()
    setPhase('quiz')
  }

  return (
    <div className="feature-page a5-page">
      {phase === 'setup' && (
        <Panel className="a5-setup-panel">
          <h3 style={{ margin: '0 0 0.5rem' }}>聽寫設定</h3>
          <div className="a5-setup-grid">
            <label className="a5-field-inline">
              <span className="a5-field-label">範圍</span>
              <select value={rangeMode} onChange={e => setRangeMode(e.target.value as RangeMode)}>
                <option value="random">隨機出題</option>
                <option value="curriculum">按課綱篩選</option>
                <option value="custom">自訂生字</option>
              </select>
            </label>
            <label className="a5-field-inline">
              <span className="a5-field-label">題數</span>
              <select value={questionCount} onChange={e => setQuestionCount(Number(e.target.value))}>
                <option value={0}>自動（全部）</option>
                <option value={5}>5 題</option>
                <option value={10}>10 題</option>
                <option value={15}>15 題</option>
                <option value={20}>20 題</option>
              </select>
            </label>
            <label className="a5-field-inline">
              <span className="a5-field-label">出題</span>
              <select value={wordType} onChange={e => setWordType(e.target.value as 'word' | 'idiom')}>
                <option value="word">字詞優先</option>
                <option value="idiom">成語優先</option>
              </select>
            </label>
            {rangeMode === 'curriculum' && (
              <>
                <label className="a5-field-inline">
                  <span className="a5-field-label">出版社</span>
                  <select value={publisher} onChange={e => setPublisher(e.target.value)}>
                    <option value="南一版">南一版</option>
                    <option value="康軒版">康軒版</option>
                    <option value="翰林版">翰林版</option>
                  </select>
                </label>
                <label className="a5-field-inline">
                  <span className="a5-field-label">年級</span>
                  <select value={grade} onChange={e => setGrade(e.target.value)}>
                    {['1年級','2年級','3年級','4年級','5年級','6年級'].map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </label>
                {availableSemesters.length > 0 && (
                  <label className="a5-field-inline">
                    <span className="a5-field-label">學期</span>
                    <select value={semester} onChange={e => setSemester(e.target.value)}>
                      {availableSemesters.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            )}
            {rangeMode === 'custom' && (
              <label className="a5-field-inline a5-setup-full">
                <span className="a5-field-label">自訂</span>
                <input value={customChars} onChange={e => setCustomChars(e.target.value)} placeholder="例如：學校花草天地" />
              </label>
            )}
          </div>
          {rangeMode === 'curriculum' && availableLessons.length > 0 && (
            <div className="a5-lesson-section">
              <span className="a5-field-label">課次（不選 = 全部）</span>
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
          {error && <p className="error-text">{error}</p>}
          <div className="toolbar-row a5-setup-bottom">
            <Button onClick={startQuiz}>開始聽寫</Button>
          </div>
        </Panel>
      )}

      {phase === 'loading' && (
        <Panel><p>出題中...</p></Panel>
      )}

      {phase === 'quiz' && !currentItem && (
        <Panel><p>準備題目中...</p></Panel>
      )}

      {phase === 'quiz' && currentItem && (
        <div className={`a5-quiz-layout${landscape ? ' a5-quiz-layout--landscape' : ''}`}>
          <WritingPad
            answer={currentItem.word}
            showHint={showHint}
            submitted={isSubmitted}
            progressText={`第${currentIdx + 1}/${totalQuestions}題`}
            comboText={combo >= 3 ? `${combo}連擊${combo >= 10 ? ' x2' : combo >= 5 ? ' x1.5' : ''}` : undefined}
            onStrokesChange={setHasStrokes}
            onHintQuizComplete={handleHintQuizComplete}
            onLayoutChange={setLandscape}
            canvasElRef={canvasElRef}
          />

          {/* Score popup — shown on submit */}
          {isSubmitted && earnedPoints !== null && (
            <div className="a5-score-popup" key={`score-${currentIdx}`}>
              <span className="a5-score-popup__points">+{earnedPoints}</span>
              <span className="a5-score-popup__label">分</span>
            </div>
          )}

          {/* Start overlay — first question only */}
          {currentIdx === 0 && !started && (
            <div className="a5-start-overlay" onClick={() => setStarted(true)}>
              <button className="a5-start-btn" onClick={() => setStarted(true)}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                <span>開始聽寫</span>
              </button>
            </div>
          )}

          {showTtsSettings && (
            <div className="a5-tts-settings">
              <label>
                <span>語速 {ttsPrefs.rate.toFixed(1)}</span>
                <input type="range" min="0.3" max="1.5" step="0.1" value={ttsPrefs.rate} onChange={e => updateTTSRate(Number(e.target.value))} />
              </label>
              <label>
                <span>音調 {ttsPrefs.pitch.toFixed(1)}</span>
                <input type="range" min="0.5" max="2.0" step="0.1" value={ttsPrefs.pitch} onChange={e => updateTTSPitch(Number(e.target.value))} />
              </label>
            </div>
          )}
          <div className={`a5-bottom-bar${landscape ? ' a5-bottom-bar--vertical' : ''}`}>
            {!isSubmitted ? (
              <>
                {speaking ? (
                  <button className="a5-action-btn a5-action-btn--speaking" onClick={handleStop} aria-label="停止">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                    {!landscape && <span>停止</span>}
                  </button>
                ) : (
                  <button className="a5-action-btn" onClick={() => playQuestion(currentItem)} disabled={!started && currentIdx === 0} aria-label="重聽">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                    {!landscape && <span>重聽</span>}
                  </button>
                )}
                <button className={`a5-action-btn${showHint ? ' a5-action-btn--active' : ''}`} onClick={toggleHint} aria-label="提示">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  {!landscape && <span>提示</span>}
                </button>
                <button className="a5-action-btn a5-action-btn--submit" onClick={handleSubmit} disabled={!hasStrokes} aria-label="提交">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  {!landscape && <span>提交</span>}
                </button>
                <button className="a5-action-btn" onClick={() => setShowTtsSettings(v => !v)} aria-label="語音設定">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                </button>
              </>
            ) : (
              <>
                {speaking ? (
                  <button className="a5-action-btn a5-action-btn--speaking" onClick={handleStop} aria-label="停止">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                    {!landscape && <span>停止</span>}
                  </button>
                ) : (
                  <button className="a5-action-btn" onClick={() => playAnswer(currentItem)} aria-label="重聽">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                    {!landscape && <span>重聽</span>}
                  </button>
                )}
                <button className="a5-action-btn a5-action-btn--next" onClick={handleNext} aria-label="下一題">
                  <span>{currentIdx < totalQuestions - 1 ? '→' : '✓'}</span>
                </button>
              </>
            )}
          </div>
        </div>
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
              <span className="a5-stat-value">{totalQuestions}</span>
              <span className="a5-stat-label">總題數</span>
            </div>
            <div className="a5-stat">
              <span className="a5-stat-value">{maxCombo}</span>
              <span className="a5-stat-label">最高連擊</span>
            </div>
          </div>
          <div className="a5-result-words">
            {answers.map((a, i) => (
              <span key={i} className={`a5-result-word${a.hinted ? ' a5-result-word--hinted' : ''}`}>
                {a.word}
                {a.hinted && <small>（提示）</small>}
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
