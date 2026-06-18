import { useRef, useState } from 'react'
import { Button } from '../../shared/components/Button'
import { Panel } from '../../shared/components/Panel'
import { ArithmeticCard } from './components/ArithmeticCard'
import { buildVertical, type Operation } from './engine'

const keypad = ['1', '2', '3', '+', '4', '5', '6', '−', '7', '8', '9', '×', 'C', '0', '←', '÷']

const opDisplay: Record<Operation, string> = {
  '+': '+',
  '-': '−',
  '*': '×',
  '/': '÷',
}

const opFromDisplay: Record<string, Operation> = {
  '+': '+',
  '−': '-',
  '×': '*',
  '÷': '/',
}

type ArithmeticInput = {
  a: number
  b: number
  operation: Operation
}

export function A3Page() {
  const [numA, setNumA] = useState('')
  const [numB, setNumB] = useState('')
  const [activeField, setActiveField] = useState<'a' | 'b'>('a')
  const [operation, setOperation] = useState<Operation>('+')
  const [error, setError] = useState('')
  const [activeExpression, setActiveExpression] = useState<ArithmeticInput | null>(null)
  const [runId, setRunId] = useState(0)
  const inputBRef = useRef<HTMLInputElement | null>(null)

  function updateField(value: string) {
    if (activeField === 'a') setNumA(value)
    else setNumB(value)
  }

  function clearInput() {
    setNumA('')
    setNumB('')
    setActiveExpression(null)
    setError('')
  }

  function handleKey(value: string) {
    if (value in opFromDisplay) {
      setOperation(opFromDisplay[value])
      if (numA) {
        setActiveField('b')
        inputBRef.current?.focus()
      }
      return
    }
    const current = activeField === 'a' ? numA : numB
    if (value === 'C') {
      clearInput()
      return
    }
    if (value === '←') {
      updateField(current.slice(0, -1))
      return
    }
    if (current.length >= 10) return
    updateField(`${current}${value}`)
  }

  function calculate() {
    setError('')
    const a = Number(numA)
    const b = Number(numB)
    const result = buildVertical(a, b, operation)
    if (result.error) {
      setError(result.error)
      return
    }
    setActiveExpression({ a, b, operation })
    setRunId((current) => current + 1)
  }

  return (
    <div className="feature-page a3-page">
      {!activeExpression && (
        <Panel>
          <div className="a3-input-row">
            <input value={numA} onChange={(event) => setNumA(event.target.value.replace(/[^0-9]/g, '').slice(0, 10))} onFocus={() => setActiveField('a')} placeholder="第一個數" maxLength={10} />
            <div className="a3-op-display">{opDisplay[operation]}</div>
            <input ref={inputBRef} value={numB} onChange={(event) => setNumB(event.target.value.replace(/[^0-9]/g, '').slice(0, 10))} onFocus={() => setActiveField('b')} placeholder="第二個數" maxLength={10} />
          </div>
          <div className="keypad-grid">
            {keypad.map((item) => (
              <Button key={`${runId}-${item}`} variant={item in opFromDisplay ? 'secondary' : 'primary'} onClick={() => handleKey(item)}>
                {item}
              </Button>
            ))}
          </div>
          <div className="a3-start-row">
            <button className="a3-play-btn" onClick={calculate} aria-label="開始計算">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            </button>
          </div>
          {error && <p className="error-text">{error}</p>}
        </Panel>
      )}

      {activeExpression && (
        <Panel>
          <ArithmeticCard
            key={`${runId}-${activeExpression.a}-${activeExpression.b}-${activeExpression.operation}`}
            a={activeExpression.a}
            b={activeExpression.b}
            operation={activeExpression.operation}
            autoStart
            onClose={() => setActiveExpression(null)}
          />
        </Panel>
      )}
    </div>
  )
}
