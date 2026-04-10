import { useMemo, useState } from 'react'
import { apiClient, type A2QuizItem } from '../../shared/api/client'
import { Button } from '../../shared/components/Button'
import { Panel } from '../../shared/components/Panel'
import { defaultIdioms } from './constants'

type Mode = 'setup' | 'loading' | 'quiz' | 'result' | 'review'

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
  const [mode, setMode] = useState<Mode>('setup')
  const [questionCount, setQuestionCount] = useState(5)
  const [bankText, setBankText] = useState(defaultIdioms.join(', '))
  const [quizItems, setQuizItems] = useState<A2QuizItem[]>([])
  const [answers, setAnswers] = useState<AnswerState[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [error, setError] = useState('')

  const score = useMemo(() => answers.filter((item) => item.isCorrect).length, [answers])
  const currentItem = quizItems[currentIndex]

  async function generateQuiz() {
    const idioms = parseIdioms(bankText)
    if (idioms.length < 4) {
      setError('請至少輸入 4 個成語。')
      return
    }
    setError('')
    setMode('loading')
    try {
      const response = await apiClient.generateQuiz(idioms, questionCount)
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
      <Panel>
        <h2>成語練習</h2>
        <p className="muted">從成語詞庫出題，練習完可以查看結果和錯題解釋。</p>
      </Panel>

      {mode === 'setup' && (
        <Panel>
          <h3>出題設定</h3>
          <label className="field-block">
            題目數量
            <input type="number" min={1} max={10} value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))} />
          </label>
          <label className="field-block">
            成語詞庫
            <textarea rows={7} value={bankText} onChange={(event) => setBankText(event.target.value)} />
          </label>
          {error ? <p className="error-text">{error}</p> : null}
          <div className="toolbar-row">
            <Button onClick={generateQuiz}>產生題目</Button>
          </div>
        </Panel>
      )}

      {mode === 'loading' && (
        <Panel>
          <h3>出題中</h3>
          <p>後端正在整理題目...</p>
        </Panel>
      )}

      {mode === 'quiz' && currentItem && (
        <Panel>
          <h3>第 {currentIndex + 1} / {quizItems.length} 題</h3>
          <p className="quiz-prompt">{currentItem.prompt}</p>
          <div className="quiz-options">
            {currentItem.options.map((option, optionIndex) => (
              <Button
                key={option}
                variant={answers[currentIndex]?.selected === optionIndex ? 'secondary' : 'primary'}
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
            <Button onClick={() => setMode('review')}>查看錯題</Button>
            <Button variant="secondary" onClick={resetQuiz}>重新設定</Button>
          </div>
        </Panel>
      )}

      {mode === 'review' && (
        <Panel>
          <h3>錯題回顧</h3>
          <div className="review-list">
            {quizItems.map((item, idx) => {
              const answer = answers[idx]
              if (answer?.isCorrect) return null
              return (
                <article key={item.id} className="review-item">
                  <p>{item.prompt}</p>
                  <p>你的答案：{answer?.selected == null ? '未作答' : item.options[answer.selected]}</p>
                  <p>正確答案：{item.options[item.correctAnswer]}</p>
                  <p className="muted">{item.explanation}</p>
                </article>
              )
            })}
          </div>
          <div className="toolbar-row">
            <Button onClick={() => setMode('result')}>返回結果</Button>
            <Button variant="secondary" onClick={resetQuiz}>重新設定</Button>
          </div>
        </Panel>
      )}
    </div>
  )
}
