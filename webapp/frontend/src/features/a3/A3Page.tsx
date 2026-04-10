import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../shared/components/Button'
import { Panel } from '../../shared/components/Panel'
import { buildOperationSteps, type Operation } from './engine'

const keypad = ['1', '2', '3', '+', '4', '5', '6', '-', '7', '8', '9', '*', 'C', '0', 'DEL', '/']

export function A3Page() {
  const [numA, setNumA] = useState('')
  const [numB, setNumB] = useState('')
  const [activeField, setActiveField] = useState<'a' | 'b'>('a')
  const [operation, setOperation] = useState<Operation>('+')
  const [speed, setSpeed] = useState(1500)
  const [allSteps, setAllSteps] = useState<string[]>([])
  const [visibleSteps, setVisibleSteps] = useState<string[]>([])
  const [answer, setAnswer] = useState('-')
  const [index, setIndex] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [runId, setRunId] = useState(0)
  const answerRef = useRef('-')

  const summary = useMemo(() => `${numA || '?'} ${operation} ${numB || '?'} = ${answer}`, [answer, numA, numB, operation])

  useEffect(() => {
    if (!isRunning || isPaused) return
    if (index >= allSteps.length) {
      setIsRunning(false)
      setAnswer(answerRef.current)
      return
    }

    const timer = window.setTimeout(() => {
      setVisibleSteps((current) => [...current, allSteps[index]])
      setIndex((current) => current + 1)
    }, speed)

    return () => window.clearTimeout(timer)
  }, [allSteps, index, isPaused, isRunning, speed])

  function updateField(value: string) {
    if (activeField === 'a') setNumA(value)
    else setNumB(value)
  }

  function handleKey(value: string) {
    if (['+', '-', '*', '/'].includes(value)) {
      setOperation(value as Operation)
      return
    }

    const current = activeField === 'a' ? numA : numB
    if (value === 'C') {
      updateField('')
      return
    }
    if (value === 'DEL') {
      updateField(current.slice(0, -1))
      return
    }
    updateField(`${current}${value}`)
  }

  function calculate() {
    const result = buildOperationSteps(Number(numA), Number(numB), operation)
    answerRef.current = result.answer
    setAllSteps(result.steps)
    setVisibleSteps([])
    setAnswer('-')
    setIndex(0)
    setIsPaused(false)
    setIsRunning(true)
    setRunId((current) => current + 1)
  }

  function cancel() {
    setIsRunning(false)
    setIsPaused(false)
    setVisibleSteps([])
    setAllSteps([])
    setIndex(0)
    setAnswer('-')
    answerRef.current = '-'
  }

  return (
    <div className="feature-page">
      <Panel>
        <h2>A3 - Math 4 Operations Learn</h2>
        <p className="muted">輸入兩個數字，選擇運算子，逐步播放計算說明。</p>
        <div className="math-inputs">
          <input value={numA} onChange={(event) => setNumA(event.target.value.replace(/[^0-9]/g, ''))} onFocus={() => setActiveField('a')} placeholder="數字 A" />
          <div className="math-operator">{operation}</div>
          <input value={numB} onChange={(event) => setNumB(event.target.value.replace(/[^0-9]/g, ''))} onFocus={() => setActiveField('b')} placeholder="數字 B" />
        </div>
        <div className="keypad-grid">
          {keypad.map((item) => (
            <Button key={`${runId}-${item}`} variant={['+', '-', '*', '/'].includes(item) ? 'secondary' : 'primary'} onClick={() => handleKey(item)}>
              {item}
            </Button>
          ))}
        </div>
        <div className="toolbar-row">
          <label>
            播放速度
            <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
              <option value={800}>快</option>
              <option value={1500}>中</option>
              <option value={2500}>慢</option>
            </select>
          </label>
          <Button onClick={calculate}>開始計算</Button>
          <Button variant="secondary" onClick={() => setIsPaused((current) => !current)} disabled={!isRunning}>
            {isPaused ? '繼續' : '暫停'}
          </Button>
          <Button variant="secondary" onClick={cancel}>
            取消
          </Button>
        </div>
      </Panel>

      <Panel>
        <h3>目前算式</h3>
        <p className="math-summary">{summary}</p>
        <div className="answer-box">答案：{answer}</div>
      </Panel>

      <Panel>
        <h3>步驟播放</h3>
        <ol className="step-list">
          {visibleSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </Panel>
    </div>
  )
}
