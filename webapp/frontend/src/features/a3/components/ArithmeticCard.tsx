import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { buildVertical, type AnimStep, type Operation, type VRow } from '../engine'

export type ArithmeticCardProps = {
  a: number
  b: number
  operation: Operation
  autoStart?: boolean
  compact?: boolean
  onClose?: () => void
}

const opDisplay: Record<Operation, string> = {
  '+': '+',
  '-': '−',
  '*': '×',
  '/': '÷',
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
  const anyRevealed = row.digits.some((_, index) => revealed.has(cellKey(rowIndex, index)))

  return (
    <div className={`vrow ${row.lineAbove && anyRevealed ? 'vrow--line-above' : ''} ${row.lineBelow && anyRevealed ? 'vrow--line-below' : ''} vrow--${row.kind}`} style={anyRevealed ? undefined : { visibility: 'hidden' }}>
      {row.label && <span className="vrow__label">{row.label}</span>}
      <div className="vrow__digits" style={{ gridTemplateColumns: `repeat(${maxDigits}, 2.2rem)` }}>
        {row.digits.map((digit, index) => {
          const key = cellKey(rowIndex, index)
          const isRevealed = revealed.has(key)
          const isHighlight = highlightSet.has(key)
          const isEmpty = digit === ''
          const displayValue = key in overrides ? overrides[key] : digit
          const isDrop = dropCell === key
          return (
            <span
              key={isDrop ? `${index}-drop` : index}
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

function CarryRow({ digits, width, pulling, pullDistance }: { digits: string[]; width: number; pulling: number | null; pullDistance: number }) {
  const padded = digits.length < width
    ? Array(width - digits.length).fill('').concat(digits)
    : digits

  return (
    <div className="vrow vrow--carry">
      <div className="vrow__digits" style={{ gridTemplateColumns: `repeat(${width}, 2.2rem)` }}>
        {padded.map((digit, index) => {
          const isPulling = pulling !== null && index === pulling && digit !== ''
          return (
            <span
              key={`${index}-${isPulling ? 'pull' : 'idle'}`}
              className={`vrow__cell${digit === '' ? ' vrow__cell--empty' : ''}${isPulling ? ' vrow__cell--pull-down' : ''}`}
              style={isPulling ? { '--pull-y': `${pullDistance}rem` } as CSSProperties : undefined}
            >
              {digit || '\u00A0'}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export function ArithmeticCard({ a, b, operation, autoStart = true, compact = false, onClose }: ArithmeticCardProps) {
  const [speed, setSpeed] = useState(compact ? 1500 : 2500)
  const [allRows, setAllRows] = useState<VRow[]>([])
  const [allSteps, setAllSteps] = useState<AnimStep[]>([])
  const [stepIndex, setStepIndex] = useState(0)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [highlightSet, setHighlightSet] = useState<Set<string>>(new Set())
  const [carryDisplay, setCarryDisplay] = useState<string[] | null>(null)
  const [displayOverrides, setDisplayOverrides] = useState<Record<string, string>>({})
  const [carryPulling, setCarryPulling] = useState<number | null>(null)
  const [carryPullTargetRow, setCarryPullTargetRow] = useState(0)
  const [dropCell, setDropCell] = useState<string | null>(null)
  const [answer, setAnswer] = useState('')
  const [noteLog, setNoteLog] = useState<string[]>([])
  const [error, setError] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const noteLogRef = useRef<HTMLDivElement | null>(null)
  const answerRef = useRef('')
  const lastPlayClickRef = useRef(0)

  const resetVisualState = () => {
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
  }

  useEffect(() => {
    setError('')
    const result = buildVertical(a, b, operation)
    if (result.error) {
      setError(result.error)
      setAllRows([])
      setAllSteps([])
      setIsRunning(false)
      return
    }
    answerRef.current = result.answer
    setAllRows(result.rows)
    setAllSteps(result.steps)
    resetVisualState()
    setIsRunning(autoStart)
  }, [a, b, operation, autoStart])

  useEffect(() => {
    noteLogRef.current?.scrollTo({ top: noteLogRef.current.scrollHeight, behavior: 'smooth' })
  }, [noteLog])

  useEffect(() => {
    if (!isRunning || isPaused) return
    if (stepIndex >= allSteps.length) {
      const endTimer = window.setTimeout(() => {
        setIsRunning(false)
        setAnswer(answerRef.current)
        setHighlightSet(new Set())
        setCarryDisplay(null)
        setDisplayOverrides({})
        setCarryPulling(null)
      }, speed)
      return () => window.clearTimeout(endTimer)
    }

    const step = allSteps[stepIndex]
    const isPullStep = step.carryPull !== undefined
    const isQuickGlance = step.cells.length === 0 && !isPullStep && (step.highlight?.length ?? 0) <= 2
    const isSilent = !step.note
    const delay = isPullStep ? Math.max(speed, 2000) : (isQuickGlance || isSilent) ? Math.max(400, speed * 0.4) : speed

    const timer = window.setTimeout(() => {
      setRevealed((prev) => {
        const next = new Set(prev)
        for (const cell of step.cells) next.add(cellKey(cell.row, cell.col))
        return next
      })
      const highlightCells = step.highlight ?? step.cells
      setHighlightSet(new Set([...highlightCells, ...step.cells].map((cell) => cellKey(cell.row, cell.col))))
      if (step.carryDisplay !== undefined) setCarryDisplay(step.carryDisplay)
      if (step.overrides !== undefined) {
        if (step.overrides === null) setDisplayOverrides({})
        else setDisplayOverrides((prev) => ({ ...prev, ...step.overrides }))
      }
      setCarryPulling(step.carryPull ?? null)
      setCarryPullTargetRow(step.carryPullRow ?? 0)
      if (step.carryPull !== undefined && step.carryPullRow !== undefined && operation === '/') {
        setDropCell(cellKey(step.carryPullRow, step.carryPull))
      } else {
        setDropCell(null)
      }
      if (step.note) setNoteLog((prev) => [...prev, step.note])
      setStepIndex((index) => index + 1)
    }, delay)

    return () => window.clearTimeout(timer)
  }, [allSteps, stepIndex, isPaused, isRunning, speed, operation])

  function cancel() {
    setIsRunning(false)
    setIsPaused(false)
    setAllRows([])
    setAllSteps([])
    resetVisualState()
    answerRef.current = ''
    onClose?.()
  }

  function replay() {
    resetVisualState()
    setIsRunning(true)
  }

  function handlePlayPause() {
    const now = Date.now()
    if (isRunning && now - lastPlayClickRef.current < 400) {
      lastPlayClickRef.current = 0
      cancel()
      return
    }
    lastPlayClickRef.current = now
    if (isRunning) setIsPaused((current) => !current)
    else replay()
  }

  const hasContent = allRows.length > 0
  const animDone = hasContent && !isRunning
  const maxRowWidth = allRows.length > 0 ? Math.max(...allRows.map((row) => row.digits.length)) : 0

  if (error) {
    return <p className="error-text">{error}</p>
  }
  if (!hasContent) return null

  return (
    <div className={`a3-card${compact ? ' a3-card--compact' : ''}`}>
      <div className="a3-card__header">
        <strong>{a} {opDisplay[operation]} {b}</strong>
        {!animDone && (
          <label className="a3-speed-label">
            播放速度
            <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
              <option value={800}>快</option>
              <option value={1500}>中</option>
              <option value={2500}>慢</option>
            </select>
          </label>
        )}
      </div>
      {!animDone && (
        <div className="a3-playback-bar">
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
          {allRows.map((row, index) => (
            <VerticalRow key={index} row={row} rowIndex={index} revealed={revealed} highlightSet={highlightSet} overrides={displayOverrides} dropCell={dropCell} />
          ))}
        </div>
      </div>
      {answer && <div className="answer-box">答案：{answer}</div>}
      {animDone && (
        <div className="a3-end-bar">
          <button className="a3-play-btn" onClick={replay} aria-label="重播">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
          </button>
          {onClose && (
            <button className="a3-play-btn a3-play-btn--pause" onClick={cancel} aria-label="結束">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><polyline points="12 19 5 12 12 5" /></svg>
            </button>
          )}
        </div>
      )}
      {noteLog.length > 0 && (
        <div className="a3-note-log" ref={noteLogRef}>
          {noteLog.map((note, index) => (
            <p key={index} className={`a3-note-line${index === noteLog.length - 1 ? ' a3-note-line--current' : ''}`}>{note}</p>
          ))}
        </div>
      )}
    </div>
  )
}
