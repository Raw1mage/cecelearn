import { useRef, useEffect, useState, useCallback } from 'react'

declare global {
  interface Window {
    HanziWriter?: {
      create: (target: HTMLElement, character: string, options: Record<string, unknown>) => {
        animateCharacter: () => void
        hideCharacter: () => void
        showOutline: () => void
      }
    }
  }
}

type Props = {
  width?: number
  height?: number
  answer?: string
  showHint: boolean
  submitted?: boolean
  progressText?: string
  comboText?: string
  onStrokesChange?: (has: boolean) => void
  canvasElRef?: React.MutableRefObject<HTMLCanvasElement | null>
}

const PALETTE = [
  '#000000', '#434343', '#666666', '#999999',
  '#dc2626', '#ea580c', '#ca8a04', '#16a34a',
  '#0d9488', '#2563eb', '#7c3aed', '#db2777',
  '#7f1d1d', '#78350f', '#1e3a5f', '#f8fafc',
]
const THICKNESSES = [3, 6, 10]
type Tool = 'pen' | 'eraser'

export function WritingPad({ width = 360, height = 520, answer, showHint, submitted, progressText, comboText, onStrokesChange, canvasElRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const gridRef = useRef<ImageData | null>(null)
  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null)  // offscreen grid for eraser
  const hintContainerRef = useRef<HTMLDivElement | null>(null)
  const hintWriters = useRef<unknown[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(PALETTE[0])
  const [thickness, setThickness] = useState(THICKNESSES[1])
  const [hasStrokes, setHasStrokes] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)

  const getCtx = useCallback(() => canvasRef.current?.getContext('2d') ?? null, [])

  const charCount = answer ? answer.length : 1

  function updateHasStrokes(v: boolean) {
    setHasStrokes(v)
    onStrokesChange?.(v)
  }

  /** Draw the grid (background + guide lines) and snapshot it */
  const drawGrid = useCallback(() => {
    const ctx = getCtx()
    if (!ctx) return
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, width, height)
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 1
    const cellH = height / charCount
    for (let i = 0; i < charCount; i++) {
      const y = i * cellH
      if (i > 0) {
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.moveTo(0, y); ctx.lineTo(width, y)
        ctx.stroke()
      }
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(width / 2, y); ctx.lineTo(width / 2, y + cellH)
      ctx.moveTo(0, y + cellH / 2); ctx.lineTo(width, y + cellH / 2)
      ctx.stroke()
    }
    ctx.setLineDash([])
    // Snapshot the clean grid for eraser restore
    gridRef.current = ctx.getImageData(0, 0, width, height)
    // Offscreen canvas copy — drawImage respects clip (putImageData does NOT)
    const off = document.createElement('canvas')
    off.width = width; off.height = height
    off.getContext('2d')!.putImageData(gridRef.current, 0, 0)
    gridCanvasRef.current = off
  }, [getCtx, width, height, charCount])

  useEffect(() => {
    drawGrid()
    updateHasStrokes(false)
    setTool('pen')
    hintWriters.current = []
    if (hintContainerRef.current) hintContainerRef.current.innerHTML = ''
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawGrid, answer])

  // Block ALL native gestures on canvas: context menu, text selection, callout
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const prevent = (e: Event) => e.preventDefault()
    el.addEventListener('contextmenu', prevent)
    el.addEventListener('selectstart', prevent)
    // Non-passive touch listeners — ensures preventDefault() actually works on iOS
    el.addEventListener('touchstart', prevent, { passive: false })
    el.addEventListener('touchmove', prevent, { passive: false })
    return () => {
      el.removeEventListener('contextmenu', prevent)
      el.removeEventListener('selectstart', prevent)
      el.removeEventListener('touchstart', prevent)
      el.removeEventListener('touchmove', prevent)
    }
  }, [])

  // Draw correct answer overlay when submitted
  useEffect(() => {
    if (!submitted || !answer) return
    const ctx = getCtx()
    if (!ctx) return
    const chars = answer.split('')
    const cellH = height / chars.length
    ctx.fillStyle = 'rgba(220, 38, 38, 0.38)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const fontSize = Math.min(width * 0.6, cellH * 0.7)
    ctx.font = `bold ${fontSize}px "Noto Sans TC", "Microsoft JhengHei", sans-serif`
    for (let i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], width / 2, i * cellH + cellH / 2)
    }
  }, [submitted, answer, width, height, getCtx])

  // Show/hide HanziWriter outlines as hint
  useEffect(() => {
    const container = hintContainerRef.current
    if (!container) return
    container.innerHTML = ''
    hintWriters.current = []

    if (!showHint || !answer || !window.HanziWriter) return

    const chars = answer.split('')
    const cellH = 100 / chars.length

    for (let i = 0; i < chars.length; i++) {
      const cell = document.createElement('div')
      cell.style.height = `${cellH}%`
      cell.style.display = 'flex'
      cell.style.alignItems = 'center'
      cell.style.justifyContent = 'center'
      container.appendChild(cell)

      try {
        const size = Math.min(width * 0.7, cellH / 100 * height * 0.8, 220)
        const writer = window.HanziWriter.create(cell, chars[i], {
          width: size,
          height: size,
          padding: 5,
          showCharacter: false,
          showOutline: true,
          strokeColor: '#60a5fa',
          outlineColor: 'rgba(96, 165, 250, 0.2)',
          strokeAnimationSpeed: 1,
          delayBetweenStrokes: 120,
        })
        setTimeout(() => writer.animateCharacter(), i * 800)
        hintWriters.current.push(writer)
      } catch { /* char not in HanziWriter db */ }
    }
  }, [showHint, answer, width])

  function getPos(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = width / rect.width
    const scaleY = height / rect.height
    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches[0]
      return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY }
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    if (submitted) return
    e.preventDefault()
    setIsDrawing(true)
    lastPoint.current = getPos(e)
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing || submitted) return
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
        ctx.drawImage(gridCanvasRef.current, 0, 0)  // drawImage respects clip region
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
      if (!hasStrokes) updateHasStrokes(true)
    }

    lastPoint.current = pos
  }

  function endDraw() {
    setIsDrawing(false)
    lastPoint.current = null
  }

  function clearCanvas() {
    drawGrid()
    updateHasStrokes(false)
  }

  function selectEraser() {
    setTool(t => t === 'eraser' ? 'pen' : 'eraser')
  }

  const toolsDisabled = !!submitted

  return (
    <div className="a5-writing-area">
      <div className="a5-canvas-wrap">
        <canvas
          ref={(el) => { canvasRef.current = el; if (canvasElRef) canvasElRef.current = el }}
          width={width}
          height={height}
          className={`a5-canvas${tool === 'eraser' ? ' a5-canvas--eraser' : ''}`}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        <div className="a5-hint-overlay" ref={hintContainerRef} style={{ display: showHint ? 'flex' : 'none' }} />
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
    </div>
  )
}
