import { useEffect, useRef, useState } from 'react'
import { Button } from '../../shared/components/Button'
import { Panel } from '../../shared/components/Panel'
import { buildVertical, type AnimStep, type Operation, type VRow } from './engine'

const keypad = ['1', '2', '3', '+', '4', '5', '6', '\u2212', '7', '8', '9', '\u00D7', 'C', '0', '\u2190', '\u00F7']

const opDisplay: Record<string, string> = {
  '+': '+',
  '-': '\u2212',
  '*': '\u00D7',
  '/': '\u00F7',
}

const opFromDisplay: Record<string, Operation> = {
  '+': '+',
  '\u2212': '-',
  '\u00D7': '*',
  '\u00F7': '/',
}

function cellKey(row: number, col: number) {
  return `${row}-${col}`
}

function VerticalRow({ row, rowIndex, revealed, highlightSet, overrides, dropCell }: {
  row: VRow
  rowIndex: number
  revealed: Set<string>
  highlightSet: Set<string>
  overrides: Record<string, string>
  dropCell: string | null
}) {
  const maxDigits = row.digits.length
  const anyRevealed = row.digits.some((_, i) => revealed.has(cellKey(rowIndex, i)))

  return (
    <div className={`vrow ${row.lineAbove && anyRevealed ? 'vrow--line-above' : ''} ${row.lineBelow && anyRevealed ? 'vrow--line-below' : ''} vrow--${row.kind}`} style={anyRevealed ? undefined : { visibility: 'hidden' }}>
      {row.label && <span className="vrow__label">{row.label}</span>}
      <div className="vrow__digits" style={{ gridTemplateColumns: `repeat(${maxDigits}, 2.2rem)` }}>
        {row.digits.map((d, i) => {
          const key = cellKey(rowIndex, i)
          const isRevealed = revealed.has(key)
          const isHighlight = highlightSet.has(key)
          const isEmpty = d === ''
          const displayValue = (key in overrides) ? overrides[key] : d
          const isDrop = dropCell === key
          return (
            <span
              key={isDrop ? `${i}-drop` : i}
              className={[
                'vrow__cell',
                isEmpty && !(key in overrides) ? 'vrow__cell--empty' : '',
                !isRevealed && !isEmpty ? 'vrow__cell--hidden' : '',
                isHighlight ? 'vrow__cell--highlight' : '',
                isDrop ? 'vrow__cell--drop-in' : '',
              ].filter(Boolean).join(' ')}
            >
              {isRevealed || isEmpty ? displayValue : '\u00A0'}
            </span>
          )
        })}
      </div>
    </div>
  )
}

/** Dynamic carry row — always reserves space above operands for multiplication */
function CarryRow({ digits, width, pulling, pullDistance }: { digits: string[]; width: number; pulling: number | null; pullDistance: number }) {
  const padded = digits.length < width
    ? Array(width - digits.length).fill('').concat(digits)
    : digits

  return (
    <div className="vrow vrow--carry">
      <div className="vrow__digits" style={{ gridTemplateColumns: `repeat(${width}, 2.2rem)` }}>
        {padded.map((d, i) => {
          const isPulling = pulling !== null && i === pulling && d !== ''
          return (
            <span
              key={`${i}-${isPulling ? 'pull' : 'idle'}`}
              className={`vrow__cell${d === '' ? ' vrow__cell--empty' : ''}${isPulling ? ' vrow__cell--pull-down' : ''}`}
              style={isPulling ? { '--pull-y': `${pullDistance}rem` } as React.CSSProperties : undefined}
            >
              {d || '\u00A0'}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export function A3Page() {
  const [numA, setNumA] = useState('')
  const [numB, setNumB] = useState('')
  const [activeField, setActiveField] = useState<'a' | 'b'>('a')
  const [operation, setOperation] = useState<Operation>('+')
  const [speed, setSpeed] = useState(2500)
  const [allRows, setAllRows] = useState<VRow[]>([])
  const [allSteps, setAllSteps] = useState<AnimStep[]>([])
  const [stepIndex, setStepIndex] = useState(0)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [highlightSet, setHighlightSet] = useState<Set<string>>(new Set())
  const [carryDisplay, setCarryDisplay] = useState<string[] | null>(null)
  const [displayOverrides, setDisplayOverrides] = useState<Record<string, string>>({})
  const [carryPulling, setCarryPulling] = useState<number | null>(null)
  const [carryPullTargetRow, setCarryPullTargetRow] = useState<number>(0)
  const [dropCell, setDropCell] = useState<string | null>(null)
  const [answer, setAnswer] = useState('')
  const [noteLog, setNoteLog] = useState<string[]>([])
  const noteLogRef = useRef<HTMLDivElement | null>(null)
  const [error, setError] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [runId, setRunId] = useState(0)
  const answerRef = useRef('')
  const inputBRef = useRef<HTMLInputElement | null>(null)
  const lastPlayClickRef = useRef(0)

  useEffect(() => {
    noteLogRef.current?.scrollTo({ top: noteLogRef.current.scrollHeight, behavior: 'smooth' })
  }, [noteLog])

  useEffect(() => {
    if (!isRunning || isPaused) return
    if (stepIndex >= allSteps.length) {
      // Delay before showing answer so the last step is visible
      const endTimer = window.setTimeout(() => {
        setIsRunning(false)
        setAnswer(answerRef.current)
        setHighlightSet(new Set())
        setCarryDisplay(null)
        setDisplayOverrides({})
        setCarryPulling(null)
      }, speed)
      return () => window.clearTimeout(endTimer)
      return
    }

    const step = allSteps[stepIndex]
    const isPullStep = step.carryPull !== undefined
    const isQuickGlance = step.cells.length === 0 && !isPullStep && (step.highlight?.length ?? 0) <= 2
    const isSilent = !step.note // no text = visual-only step (e.g. draw line)
    const delay = isPullStep ? Math.max(speed, 2000) : (isQuickGlance || isSilent) ? Math.max(400, speed * 0.4) : speed

    const timer = window.setTimeout(() => {
      setRevealed((prev) => {
        const next = new Set(prev)
        for (const c of step.cells) next.add(cellKey(c.row, c.col))
        return next
      })
      const hlCells = step.highlight ?? step.cells
      setHighlightSet(new Set([...hlCells, ...step.cells].map(c => cellKey(c.row, c.col))))
      if (step.carryDisplay !== undefined) {
        setCarryDisplay(step.carryDisplay)
      }
      if (step.overrides !== undefined) {
        if (step.overrides === null) {
          setDisplayOverrides({})
        } else {
          setDisplayOverrides((prev) => ({ ...prev, ...step.overrides }))
        }
      }
      setCarryPulling(step.carryPull ?? null)
      setCarryPullTargetRow(step.carryPullRow ?? 0)
      // For division: mark the cell being dropped in
      if (step.carryPull !== undefined && step.carryPullRow !== undefined && operation === '/') {
        setDropCell(cellKey(step.carryPullRow, step.carryPull))
      } else {
        setDropCell(null)
      }
      if (step.note) {
        setNoteLog((prev) => [...prev, step.note])
      }
      setStepIndex((i) => i + 1)
    }, delay)

    return () => window.clearTimeout(timer)
  }, [allSteps, stepIndex, isPaused, isRunning, speed])

  function updateField(value: string) {
    if (activeField === 'a') setNumA(value)
    else setNumB(value)
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
    if (value === 'C') { setNumA(''); setNumB(''); return }
    if (value === '\u2190') { updateField(current.slice(0, -1)); return }
    if (current.length >= 10) return
    updateField(`${current}${value}`)
  }

  function calculate() {
    setError('')
    const result = buildVertical(Number(numA), Number(numB), operation)
    if (result.error) { setError(result.error); return }
    answerRef.current = result.answer
    setAllRows(result.rows)
    setAllSteps(result.steps)
    setStepIndex(0)
    setRevealed(new Set())
    setHighlightSet(new Set())
    setCarryDisplay(null)
    setDisplayOverrides({})
    setCarryPulling(null)
    setDropCell(null)
    setNoteLog([])
    setAnswer('')
    setIsPaused(false)
    setIsRunning(true)
    setRunId((c) => c + 1)
  }

  function cancel() {
    setIsRunning(false)
    setIsPaused(false)
    setAllRows([])
    setAllSteps([])
    setStepIndex(0)
    setRevealed(new Set())
    setHighlightSet(new Set())
    setCarryDisplay(null)
    setDisplayOverrides({})
    setCarryPulling(null)
    setDropCell(null)
    setNoteLog([])
    setAnswer('')
    answerRef.current = ''
  }

  const hasContent = allRows.length > 0
  const animDone = hasContent && !isRunning

  function handlePlayPause() {
    const now = Date.now()
    if (isRunning && now - lastPlayClickRef.current < 400) {
      lastPlayClickRef.current = 0
      cancel()
      return
    }
    lastPlayClickRef.current = now

    if (!isRunning && !hasContent) {
      calculate()
    } else if (isRunning) {
      setIsPaused((c) => !c)
    }
  }

  function replay() {
    setStepIndex(0)
    setRevealed(new Set())
    setHighlightSet(new Set())
    setCarryDisplay(null)
    setDisplayOverrides({})
    setCarryPulling(null)
    setDropCell(null)
    setNoteLog([])
    setAnswer('')
    setIsPaused(false)
    setIsRunning(true)
  }

  const showCalculator = !hasContent

  // Carry row width = max digit width across all rows (so it right-aligns properly)
  const maxRowWidth = allRows.length > 0
    ? Math.max(...allRows.map(r => r.digits.length))
    : 0

  return (
    <div className="feature-page a3-page">
      {showCalculator && (
        <Panel>
          <div className="a3-input-row">
            <input value={numA} onChange={(e) => setNumA(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))} onFocus={() => setActiveField('a')} placeholder="第一個數" maxLength={10} />
            <div className="a3-op-display">{opDisplay[operation]}</div>
            <input ref={inputBRef} value={numB} onChange={(e) => setNumB(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))} onFocus={() => setActiveField('b')} placeholder="第二個數" maxLength={10} />
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

      {hasContent && (
        <Panel>
          {!animDone && (
            <div className="a3-playback-bar">
              <label className="a3-speed-label">
                播放速度
                <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                  <option value={800}>快</option>
                  <option value={1500}>中</option>
                  <option value={2500}>慢</option>
                </select>
              </label>
              <button className={`a3-play-btn${isRunning && !isPaused ? ' a3-play-btn--pause' : ''}`} onClick={handlePlayPause} aria-label={isPaused ? '繼續' : '暫停'}>
                {isRunning && !isPaused ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                )}
              </button>
            </div>
          )}
          <div className="vertical-math-wrap">
            <div className={`vertical-math${operation === '/' ? ' vertical-math--division' : ''}`}>
              {operation === '*' && <CarryRow digits={carryDisplay ?? Array(maxRowWidth).fill('')} width={maxRowWidth} pulling={carryPulling} pullDistance={(carryPullTargetRow + 1) * 2.5} />}
              {allRows.map((row, i) => (
                <VerticalRow key={i} row={row} rowIndex={i} revealed={revealed} highlightSet={highlightSet} overrides={displayOverrides} dropCell={dropCell} />
              ))}
            </div>
          </div>
          {answer && <div className="answer-box">答案：{answer}</div>}
          {animDone && (
            <div className="a3-end-bar">
              <button className="a3-play-btn" onClick={replay} aria-label="重播">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
              </button>
              <button className="a3-play-btn a3-play-btn--pause" onClick={cancel} aria-label="結束">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><polyline points="12 19 5 12 12 5" /></svg>
              </button>
            </div>
          )}
        </Panel>
      )}

      {noteLog.length > 0 && (
        <div className="a3-note-log" ref={noteLogRef}>
          {noteLog.map((note, i) => (
            <p key={i} className={`a3-note-line${i === noteLog.length - 1 ? ' a3-note-line--current' : ''}`}>{note}</p>
          ))}
        </div>
      )}
    </div>
  )
}
