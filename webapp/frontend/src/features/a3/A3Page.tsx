import { useEffect, useRef, useState } from 'react'
import { Button } from '../../shared/components/Button'
import { Panel } from '../../shared/components/Panel'
import { buildVertical, type Operation, type VRow } from './engine'

const keypad = ['1', '2', '3', '+', '4', '5', '6', '-', '7', '8', '9', '*', 'C', '0', 'DEL', '/']

function VerticalRow({ row, highlight }: { row: VRow; highlight: boolean }) {
  const maxDigits = row.digits.length
  return (
    <div
      className={`vrow ${row.lineAbove ? 'vrow--line-above' : ''} ${highlight ? 'vrow--highlight' : ''} vrow--${row.kind}`}
    >
      {row.label && <span className="vrow__label">{row.label}</span>}
      <div className="vrow__digits" style={{ gridTemplateColumns: `repeat(${maxDigits}, 2.2rem)` }}>
        {row.digits.map((d, i) => (
          <span key={i} className={`vrow__cell ${d === '' ? 'vrow__cell--empty' : ''}`}>
            {d}
          </span>
        ))}
      </div>
    </div>
  )
}

export function A3Page() {
  const [numA, setNumA] = useState('')
  const [numB, setNumB] = useState('')
  const [activeField, setActiveField] = useState<'a' | 'b'>('a')
  const [operation, setOperation] = useState<Operation>('+')
  const [speed, setSpeed] = useState(1500)
  const [allRows, setAllRows] = useState<VRow[]>([])
  const [visibleCount, setVisibleCount] = useState(0)
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [runId, setRunId] = useState(0)
  const answerRef = useRef('')

  useEffect(() => {
    if (!isRunning || isPaused) return
    if (visibleCount >= allRows.length) {
      setIsRunning(false)
      setAnswer(answerRef.current)
      return
    }

    const timer = window.setTimeout(() => {
      setVisibleCount((c) => c + 1)
    }, speed)

    return () => window.clearTimeout(timer)
  }, [allRows, visibleCount, isPaused, isRunning, speed])

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
    setError('')
    const result = buildVertical(Number(numA), Number(numB), operation)
    if (result.error) {
      setError(result.error)
      return
    }
    answerRef.current = result.answer
    setAllRows(result.rows)
    setVisibleCount(0)
    setAnswer('')
    setIsPaused(false)
    setIsRunning(true)
    setRunId((c) => c + 1)
  }

  function cancel() {
    setIsRunning(false)
    setIsPaused(false)
    setAllRows([])
    setVisibleCount(0)
    setAnswer('')
    answerRef.current = ''
  }

  function showAll() {
    setVisibleCount(allRows.length)
    setIsRunning(false)
    setAnswer(answerRef.current)
  }

  const visibleRows = allRows.slice(0, visibleCount)
  const currentNote = visibleCount > 0 && visibleCount <= allRows.length ? allRows[visibleCount - 1].note : null

  return (
    <div className="feature-page">
      <Panel>
        <h2>四則運算</h2>
        <p className="muted">輸入兩個數字，選擇運算子，逐步播放直式計算過程。</p>
        <div className="math-inputs">
          <input value={numA} onChange={(e) => setNumA(e.target.value.replace(/[^0-9]/g, ''))} onFocus={() => setActiveField('a')} placeholder="數字 A" />
          <div className="math-operator">{operation}</div>
          <input value={numB} onChange={(e) => setNumB(e.target.value.replace(/[^0-9]/g, ''))} onFocus={() => setActiveField('b')} placeholder="數字 B" />
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
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              <option value={800}>快</option>
              <option value={1500}>中</option>
              <option value={2500}>慢</option>
            </select>
          </label>
          <Button onClick={calculate}>開始計算</Button>
          <Button variant="secondary" onClick={() => setIsPaused((c) => !c)} disabled={!isRunning}>
            {isPaused ? '繼續' : '暫停'}
          </Button>
          <Button variant="secondary" onClick={cancel}>取消</Button>
          {isRunning && <Button variant="secondary" onClick={showAll}>直接顯示</Button>}
        </div>
        {error && <p className="error-text">{error}</p>}
      </Panel>

      {(visibleRows.length > 0 || answer) && (
        <Panel>
          <h3>直式計算</h3>
          <div className="vertical-math">
            {visibleRows.map((row, i) => (
              <VerticalRow key={i} row={row} highlight={i === visibleCount - 1 && isRunning} />
            ))}
          </div>
          {currentNote && <p className="vrow-note">{currentNote}</p>}
          {answer && <div className="answer-box">答案：{answer}</div>}
        </Panel>
      )}
    </div>
  )
}
