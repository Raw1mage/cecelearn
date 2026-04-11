import { useRef, useEffect, useState, useCallback } from 'react'
// HanziWriter global type declared in ../a1/hanziWriterAdapter.ts

type Props = {
  width?: number
  answer?: string
  showHint: boolean
  submitted?: boolean
  progressText?: string
  comboText?: string
  onStrokesChange?: (has: boolean) => void
  onHintQuizComplete?: (totalMistakes: number, totalStrokes: number) => void
  onLayoutChange?: (landscape: boolean) => void
  canvasElRef?: React.MutableRefObject<HTMLCanvasElement | null>
}

const PALETTE = [
  '#000000', '#434343', '#666666', '#999999',
  '#dc2626', '#ea580c', '#ca8a04', '#16a34a',
  '#0d9488', '#2563eb', '#7c3aed', '#db2777',
  '#7f1d1d', '#78350f', '#1e3a5f', '#f8fafc',
]
const THICKNESSES = [3, 6, 10]
const THUMB_SIZE = 200
type Tool = 'pen' | 'eraser'

export function WritingPad({ width = 360, answer, showHint, submitted, progressText, comboText, onStrokesChange, onHintQuizComplete, onLayoutChange, canvasElRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const gridRef = useRef<ImageData | null>(null)
  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const areaRef = useRef<HTMLDivElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [sizes, setSizes] = useState({ canvas: 0, thumb: 0 })
  const hintContainerRef = useRef<HTMLDivElement | null>(null)
  const hintWriters = useRef<unknown[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(PALETTE[0])
  const [thickness, setThickness] = useState(THICKNESSES[1])
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const [isLandscape, setIsLandscape] = useState(false)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)

  // Per-character state
  const charCount = answer ? answer.length : 1
  const canvasDataRef = useRef<(ImageData | null)[]>([])
  const strokeFlagsRef = useRef<boolean[]>([])
  const thumbRefs = useRef<(HTMLCanvasElement | null)[]>([])

  const getCtx = useCallback(() => canvasRef.current?.getContext('2d') ?? null, [])

  /** Draw single-character grid (square with cross guides) */
  const drawGrid = useCallback(() => {
    const ctx = getCtx()
    if (!ctx) return
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, width, width)
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)'
    ctx.lineWidth = 1
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(width / 2, 0); ctx.lineTo(width / 2, width)
    ctx.moveTo(0, width / 2); ctx.lineTo(width, width / 2)
    ctx.stroke()
    ctx.setLineDash([])
    gridRef.current = ctx.getImageData(0, 0, width, width)
    const off = document.createElement('canvas')
    off.width = width; off.height = width
    off.getContext('2d')!.putImageData(gridRef.current, 0, 0)
    gridCanvasRef.current = off
  }, [getCtx, width])

  /** Save active canvas to per-char data store */
  function saveActive() {
    const ctx = getCtx()
    if (ctx) canvasDataRef.current[activeIdx] = ctx.getImageData(0, 0, width, width)
  }

  /** Restore a character's canvas data (or fresh grid) */
  function restoreChar(idx: number) {
    const ctx = getCtx()
    if (!ctx) return
    const data = canvasDataRef.current[idx]
    if (data) {
      ctx.putImageData(data, 0, 0)
    } else {
      drawGrid()
    }
  }

  /** Update thumbnail from main canvas (user handwriting) */
  function updateThumb(idx: number) {
    const main = canvasRef.current
    const thumb = thumbRefs.current[idx]
    if (!main || !thumb) return
    const tCtx = thumb.getContext('2d')
    if (!tCtx) return
    tCtx.clearRect(0, 0, THUMB_SIZE, THUMB_SIZE)
    tCtx.drawImage(main, 0, 0, THUMB_SIZE, THUMB_SIZE)
  }

  /** Render a HanziWriter character into a thumbnail's parent container */
  function renderThumbChar(idx: number, char: string, strokeColor = 'rgba(96, 165, 250, 0.7)') {
    const thumbCanvas = thumbRefs.current[idx]
    if (!thumbCanvas) return
    const parent = thumbCanvas.parentElement
    if (!parent || !window.HanziWriter) return
    // Hide the canvas, show HanziWriter SVG instead
    thumbCanvas.style.display = 'none'
    // Remove any previous HanziWriter wrapper
    const prev = parent.querySelector('.a5-thumb-hw')
    if (prev) prev.remove()
    const wrapper = document.createElement('div')
    wrapper.className = 'a5-thumb-hw'
    wrapper.style.width = '100%'
    wrapper.style.height = '100%'
    wrapper.style.display = 'flex'
    wrapper.style.alignItems = 'center'
    wrapper.style.justifyContent = 'center'
    parent.appendChild(wrapper)
    const size = Math.min(parent.clientWidth, parent.clientHeight) * 0.85
    try {
      window.HanziWriter.create(wrapper, char, {
        width: size,
        height: size,
        padding: 1,
        showCharacter: true,
        showOutline: false,
        strokeColor,
      })
    } catch { /* char not in db */ }
  }

  /** Switch to a different character */
  function switchChar(idx: number) {
    if (idx === activeIdx || submitted || showHint) return
    saveActive()
    updateThumb(activeIdx)
    setActiveIdx(idx)
  }

  // When activeIdx changes, restore canvas
  useEffect(() => {
    restoreChar(activeIdx)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx])

  // Reset everything when answer changes
  useEffect(() => {
    canvasDataRef.current = new Array(charCount).fill(null)
    strokeFlagsRef.current = new Array(charCount).fill(false)
    setActiveIdx(0)
    drawGrid()
    setTool('pen')
    hintWriters.current = []
    if (hintContainerRef.current) hintContainerRef.current.innerHTML = ''
    // Clear thumbnails — remove HanziWriter SVG wrappers and restore canvas
    for (let i = 0; i < thumbRefs.current.length; i++) {
      const t = thumbRefs.current[i]
      if (!t) continue
      t.getContext('2d')?.clearRect(0, 0, THUMB_SIZE, THUMB_SIZE)
      t.style.display = ''  // restore canvas visibility (renderThumbChar hides it)
      const hw = t.parentElement?.querySelector('.a5-thumb-hw')
      if (hw) hw.remove()
    }
    onStrokesChange?.(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawGrid, answer])

  // Detect orientation + compute optimal square sizes
  useEffect(() => {
    const area = areaRef.current
    if (!area) return
    const GAP = 6
    function measure() {
      // Use viewport dimensions for orientation (container dims are circular when layout changes)
      const vw = window.visualViewport?.width ?? window.innerWidth
      const vh = window.visualViewport?.height ?? window.innerHeight
      const landscape = vw > vh * 1.2
      setIsLandscape(landscape)
      onLayoutChange?.(landscape)

      const rect = area!.getBoundingClientRect()
      const availW = rect.width
      const availH = rect.height
      const n = charCount > 1 ? charCount : 0
      let S: number, T: number

      if (n === 0) {
        S = Math.min(availW, availH)
        T = 0
      } else if (landscape) {
        // Landscape: canvas by height, thumbs scroll vertically if needed
        S = Math.min(availH, (availW - GAP) / 1.5)
        T = S / 2
        if (S + GAP + T > availW) S = availW - GAP - T
      } else {
        // Portrait: thumbs below canvas, scroll horizontally if needed
        S = Math.min(availW, (availH - GAP) / 1.5)
        T = S / 2
        if (S + GAP + T > availH) S = availH - GAP - T
      }
      setSizes({ canvas: Math.floor(Math.max(S, 50)), thumb: Math.floor(Math.max(T, 20)) })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(area)
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('resize', measure)
    }
  }, [charCount])

  // Block native gestures on canvas
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const prevent = (e: Event) => e.preventDefault()
    el.addEventListener('contextmenu', prevent)
    el.addEventListener('selectstart', prevent)
    el.addEventListener('touchstart', prevent, { passive: false })
    el.addEventListener('touchmove', prevent, { passive: false })
    return () => {
      el.removeEventListener('contextmenu', prevent)
      el.removeEventListener('selectstart', prevent)
      el.removeEventListener('touchstart', prevent)
      el.removeEventListener('touchmove', prevent)
    }
  }, [])

  // Answer display — show ALL characters stacked in one view via HanziWriter
  useEffect(() => {
    if (!submitted || !answer || !window.HanziWriter) return
    const container = hintContainerRef.current
    if (!container) return
    container.innerHTML = ''

    const chars = answer.split('')
    // 1~2 chars: single column; 3~4 chars: 2×2 grid
    const cols = chars.length >= 3 ? 2 : 1
    const rows = Math.ceil(chars.length / cols)

    // Save user handwriting to thumbnails before clearing
    saveActive()
    updateThumb(activeIdx)

    // Clear the main canvas for answer display
    const ctx = getCtx()
    if (ctx) {
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(0, 0, width, width)
    }

    // Use CSS grid for layout
    const grid = document.createElement('div')
    grid.style.display = 'grid'
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`
    grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`
    grid.style.width = '100%'
    grid.style.height = '100%'
    container.appendChild(grid)

    const rect = container.getBoundingClientRect()
    for (const char of chars) {
      const cell = document.createElement('div')
      cell.style.display = 'flex'
      cell.style.alignItems = 'center'
      cell.style.justifyContent = 'center'
      grid.appendChild(cell)

      try {
        const cellW = rect.width / cols
        const cellHPx = rect.height / rows
        const size = Math.min(cellW * 0.85, cellHPx * 0.85, 280)
        window.HanziWriter!.create(cell, char, {
          width: size,
          height: size,
          padding: 2,
          showCharacter: true,
          showOutline: false,
          strokeColor: 'rgba(220, 38, 38, 0.5)',
        })
      } catch { /* char not in HanziWriter db */ }
    }
  }, [submitted, answer])

  // Hint flow: per-character animate → quiz
  useEffect(() => {
    const container = hintContainerRef.current
    if (!container) return
    container.innerHTML = ''
    hintWriters.current = []

    if (!showHint || !answer || !window.HanziWriter) return

    const chars = answer.split('')
    let totalMistakes = 0
    let totalStrokes = 0
    let cancelled = false

    const startIdx = activeIdx
    async function runHintSequence() {
      if (!container) return
      for (let i = startIdx; i < chars.length; i++) {
        if (cancelled) return
        setActiveIdx(i)
        container.innerHTML = ''

        const cell = document.createElement('div')
        cell.style.width = '100%'
        cell.style.height = '100%'
        cell.style.display = 'flex'
        cell.style.alignItems = 'center'
        cell.style.justifyContent = 'center'
        container.appendChild(cell)

        const rect = container.getBoundingClientRect()
        const size = Math.min(rect.width, rect.height) * 0.85
        let writer: ReturnType<NonNullable<typeof window.HanziWriter>['create']>
        try {
          writer = window.HanziWriter!.create(cell, chars[i], {
            width: size,
            height: size,
            padding: 2,
            showCharacter: false,
            showOutline: true,
            strokeColor: color,
            outlineColor: 'rgba(96, 165, 250, 0.25)',
            drawingColor: color,
            highlightColor: '#60a5fa',
            drawingWidth: thickness * 4,
            strokeAnimationSpeed: 1,
            delayBetweenStrokes: 120,
            showHintAfterMisses: 2,
          })
          hintWriters.current.push(writer)
        } catch { continue }

        // Animate
        await new Promise<void>(resolve => {
          writer.animateCharacter({ onComplete: () => resolve() })
        })
        if (cancelled) return

        // Quiz
        await new Promise<void>(resolve => {
          writer.quiz({
            onCorrectStroke: () => { totalStrokes++ },
            onMistake: () => { totalMistakes++ },
            onComplete: () => resolve(),
          })
        })
        if (cancelled) return
        // Update thumbnail with HanziWriter character (consistent font)
        renderThumbChar(i, chars[i])
      }

      if (!cancelled) {
        onHintQuizComplete?.(totalMistakes, totalStrokes)
      }
    }

    runHintSequence()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHint, answer, width])

  function getPos(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = width / rect.width
    const scaleY = width / rect.height
    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches[0]
      return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY }
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    if (submitted || showHint) return
    e.preventDefault()
    setIsDrawing(true)
    lastPoint.current = getPos(e)
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing || submitted || showHint) return
    e.preventDefault()
    const ctx = getCtx()
    if (!ctx || !lastPoint.current) return
    const pos = getPos(e)
    const size = tool === 'eraser' ? thickness * 3 : thickness

    if (tool === 'eraser') {
      ctx.save()
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2)
      ctx.clip()
      if (gridCanvasRef.current) {
        ctx.drawImage(gridCanvasRef.current, 0, 0)
      } else {
        ctx.fillStyle = '#f8fafc'
        ctx.fillRect(pos.x - size, pos.y - size, size * 2, size * 2)
      }
      ctx.restore()
    } else {
      ctx.strokeStyle = color
      ctx.lineWidth = size
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(lastPoint.current.x, lastPoint.current.y)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
      if (!strokeFlagsRef.current[activeIdx]) {
        strokeFlagsRef.current[activeIdx] = true
        onStrokesChange?.(true)
      }
    }

    lastPoint.current = pos
  }

  function endDraw() {
    setIsDrawing(false)
    lastPoint.current = null
    updateThumb(activeIdx)
  }

  function clearCanvas() {
    drawGrid()
    strokeFlagsRef.current[activeIdx] = false
    onStrokesChange?.(strokeFlagsRef.current.some(Boolean))
    updateThumb(activeIdx)
  }

  function selectEraser() {
    setTool(t => t === 'eraser' ? 'pen' : 'eraser')
  }

  const toolsDisabled = !!submitted
  const chars = answer ? answer.split('') : ['']

  return (
    <div ref={areaRef} className={`a5-writing-area${isLandscape ? ' a5-writing-area--landscape' : ''}`}>
      <div ref={wrapRef} className="a5-canvas-wrap" style={sizes.canvas > 0 ? { width: sizes.canvas, height: sizes.canvas } : undefined}>
        <canvas
          ref={(el) => { canvasRef.current = el; if (canvasElRef) canvasElRef.current = el }}
          width={width}
          height={width}
          className={`a5-canvas${tool === 'eraser' ? ' a5-canvas--eraser' : ''}`}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        <div className="a5-hint-overlay" ref={hintContainerRef} style={{ display: (showHint || submitted) ? 'flex' : 'none' }} />
        {progressText && (
          <div className="a5-progress-overlay">
            <span>{progressText}</span>
            {comboText && <span className="a5-combo-overlay">{comboText}</span>}
          </div>
        )}
        {/* Toolbar overlaid inside canvas, bottom-left */}
        <div className="a5-side-toolbar">
          <div className="a5-side-group a5-palette-wrap">
            <button
              className="a5-color-btn a5-color-btn--trigger"
              style={{ background: color }}
              onClick={() => !toolsDisabled && setPaletteOpen(v => !v)}
              disabled={toolsDisabled}
              aria-label="選顏色"
            />
            {paletteOpen && (
              <div className="a5-palette">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    className={`a5-palette-swatch${c === color ? ' a5-palette-swatch--active' : ''}`}
                    style={{ background: c }}
                    onClick={() => { setColor(c); setTool('pen'); setPaletteOpen(false) }}
                    aria-label="顏色"
                  />
                ))}
              </div>
            )}
          </div>
          <div className="a5-side-group">
            {THICKNESSES.map((t) => (
              <button
                key={t}
                className={`a5-thick-btn${thickness === t ? ' a5-thick-btn--active' : ''}`}
                onClick={() => setThickness(t)}
                disabled={toolsDisabled}
                aria-label="筆畫粗細"
              >
                <span className="a5-thick-dot" style={{ width: t * 2, height: t * 2 }} />
              </button>
            ))}
          </div>
          <div className="a5-side-group">
            <button className={`a5-tool-btn${tool === 'eraser' ? ' a5-tool-btn--active' : ''}`} onClick={selectEraser} disabled={toolsDisabled} aria-label="橡皮擦">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>
            </button>
            <button className="a5-tool-btn" onClick={clearCanvas} disabled={toolsDisabled} aria-label="全部清除">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M5 6v14h14V6"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Thumbnail navigation bar */}
      {charCount > 1 && (
        <>
          <div className="a5-thumb-bar" style={isLandscape && sizes.canvas > 0 ? { maxHeight: sizes.canvas } : undefined}>
            {chars.map((_, i) => (
              <button
                key={i}
                className={`a5-thumb${i === activeIdx ? ' a5-thumb--active' : ''}${strokeFlagsRef.current[i] ? ' a5-thumb--written' : ''}`}
                onClick={() => switchChar(i)}
                style={sizes.thumb > 0 ? { width: sizes.thumb, height: sizes.thumb } : undefined}
              >
                <canvas
                  ref={el => { thumbRefs.current[i] = el }}
                  width={THUMB_SIZE}
                  height={THUMB_SIZE}
                  className="a5-thumb-canvas"
                />
                <span className="a5-thumb-idx">{i + 1}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
