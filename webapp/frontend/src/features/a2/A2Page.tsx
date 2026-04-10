import { useMemo, useState } from 'react'
import { apiClient, type A2QuizItem } from '../../shared/api/client'
import { celebrate } from '../../shared/celebrate'
import { Button } from '../../shared/components/Button'
import { Panel } from '../../shared/components/Panel'
import { useScore } from '../../shared/ScoreContext'
import { defaultIdioms } from './constants'

type Mode = 'setup' | 'loading' | 'quiz' | 'result' | 'review'
type QuizMode = 'random' | 'custom'

type AnswerState = {
  selected: number | null
  isCorrect: boolean | null
}

function parseIdioms(value: string) {
  return value
    .split(/[\s,;，；\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function A2Page() {
  const { addScore } = useScore()
  const [mode, setMode] = useState<Mode>('setup')
  const [quizMode, setQuizMode] = useState<QuizMode>('random')
  const [questionCount, setQuestionCount] = useState(5)
  const [bankText, setBankText] = useState(defaultIdioms.join('、'))
  const [quizItems, setQuizItems] = useState<A2QuizItem[]>([])
  const [answers, setAnswers] = useState<AnswerState[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [error, setError] = useState('')

  const score = useMemo(() => answers.filter((item) => item.isCorrect).length, [answers])
  const currentItem = quizItems[currentIndex]

  async function generateQuiz() {
    if (quizMode === 'custom') {
      const idioms = parseIdioms(bankText)
      if (idioms.length < 4) {
        setError('請至少輸入 4 個成語。')
        return
      }
    }
    setError('')
    setMode('loading')
    try {
      const idioms = quizMode === 'custom' ? parseIdioms(bankText) : []
      const response = await apiClient.generateQuiz(questionCount, quizMode, idioms)
      if (!response.items || response.items.length === 0) {
        setError('出題失敗，請重試。')
        setMode('setup')
        return
      }
      setQuizItems(response.items)
      setAnswers(response.items.map(() => ({ selected: null, isCorrect: null })))
      setCurrentIndex(0)
      setMode('quiz')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '出題失敗')
      setMode('setup')
    }
  }

  function chooseAnswer(index: number) {
    setAnswers((current) => current.map((item, itemIndex) => (itemIndex === currentIndex ? { ...item, selected: index } : item)))
  }

  function submitQuiz() {
    const next = answers.map((item, idx) => ({
      ...item,
      isCorrect: item.selected === quizItems[idx].correctAnswer,
    }))
    setAnswers(next)
    const correctCount = next.filter((a) => a.isCorrect).length
    if (correctCount > 0) addScore(correctCount)
    if (correctCount === quizItems.length) celebrate()
    setMode('result')
  }

  function resetQuiz() {
    setMode('setup')
    setQuizItems([])
    setAnswers([])
    setCurrentIndex(0)
  }

  return (
    <div className="feature-page">
      {mode === 'setup' && (
        <Panel>
          <h3>出題設定</h3>
          <label className="field-block">
            出題模式
            <select value={quizMode} onChange={(e) => setQuizMode(e.target.value as QuizMode)}>
              <option value="random">隨機出題（從成語庫）</option>
              <option value="custom">指定範圍（自訂成語）</option>
            </select>
          </label>
          <label className="field-block">
            題目數量
            <input type="number" min={1} max={20} value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))} />
          </label>
          {quizMode === 'custom' && (
            <label className="field-block">
              成語詞庫
              <textarea rows={5} value={bankText} onChange={(event) => setBankText(event.target.value)} placeholder="輸入成語，用逗號或換行分隔" />
            </label>
          )}
          {error ? <p className="error-text">{error}</p> : null}
          <div className="toolbar-row">
            <Button onClick={generateQuiz}>開始練習</Button>
          </div>
        </Panel>
      )}

      {mode === 'loading' && (
        <Panel>
          <p>出題中...</p>
        </Panel>
      )}

      {mode === 'quiz' && currentItem && (
        <Panel>
          <h3>第 {currentIndex + 1} / {quizItems.length} 題</h3>
          <p className="a2-prompt">{currentItem.prompt}</p>
          <div className="a2-options">
            {currentItem.options.map((option, optionIndex) => (
              <Button
                key={option}
                variant={answers[currentIndex]?.selected === optionIndex ? 'primary' : 'secondary'}
                onClick={() => chooseAnswer(optionIndex)}
              >
                {option}
              </Button>
            ))}
          </div>
          <div className="toolbar-row">
            <Button variant="secondary" onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))} disabled={currentIndex === 0}>
              上一題
            </Button>
            {currentIndex < quizItems.length - 1 ? (
              <Button onClick={() => setCurrentIndex((value) => Math.min(quizItems.length - 1, value + 1))}>下一題</Button>
            ) : (
              <Button onClick={submitQuiz} disabled={answers.some((item) => item.selected === null)}>
                交卷
              </Button>
            )}
          </div>
        </Panel>
      )}

      {mode === 'result' && (
        <Panel>
          <h3>結果</h3>
          <p className="score-text">答對 {score} / {quizItems.length} 題</p>
          <div className="toolbar-row">
            <Button onClick={() => setMode('review')}>查看詳解</Button>
            <Button variant="secondary" onClick={resetQuiz}>再來一次</Button>
          </div>
        </Panel>
      )}

      {mode === 'review' && (
        <Panel>
          <h3>題目回顧</h3>
          <div className="review-list">
            {quizItems.map((item, idx) => {
              const answer = answers[idx]
              return (
                <article key={item.id} className={`review-item ${answer?.isCorrect ? 'review-item--correct' : 'review-item--wrong'}`}>
                  <p>{item.prompt}</p>
                  {!answer?.isCorrect && (
                    <p className="error-text">你的答案：{answer?.selected == null ? '未作答' : item.options[answer.selected]}</p>
                  )}
                  <p className="muted">{item.explanation}</p>
                </article>
              )
            })}
          </div>
          <div className="toolbar-row">
            <Button variant="secondary" onClick={resetQuiz}>再來一次</Button>
          </div>
        </Panel>
      )}
    </div>
  )
}
