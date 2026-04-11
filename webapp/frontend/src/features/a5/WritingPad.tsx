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
  onSubmit: (canvas: HTMLCanvasElement) => void
  answer?: string
  showHint: boolean
}

const COLORS = ['#1e293b', '#dc2626', '#2563eb', '#16a34a']
const THICKNESSES = [3, 6, 10]
type Tool = 'pen' | 'eraser'

export function WritingPad({ width = 360, height = 520, onSubmit, answer, showHint }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const gridRef = useRef<ImageData | null>(null)
  const hintContainerRef = useRef<HTMLDivElement | null>(null)
  const hintWriters = useRef<unknown[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(COLORS[0])
  const [thickness, setThickness] = useState(THICKNESSES[1])
  const [hasStrokes, setHasStrokes] = useState(false)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)

  const getCtx = useCallback(() => canvasRef.current?.getContext('2d') ?? null, [])

  const charCount = answer ? answer.length : 1

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
  }, [getCtx, width, height, charCount])

  useEffect(() => {
    drawGrid()
    setHasStrokes(false)
    setTool('pen')
    hintWriters.current = []
    if (hintContainerRef.current) hintContainerRef.current.innerHTML = ''
  }, [drawGrid, answer])

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
        // Animate with staggered delay per character
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
    e.preventDefault()
    setIsDrawing(true)
    lastPoint.current = getPos(e)
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing) return
    e.preventDefault()
    const ctx = getCtx()
    if (!ctx || !lastPoint.current) return
    const pos = getPos(e)
    const size = tool === 'eraser' ? thickness * 3 : thickness

    if (tool === 'eraser') {
      // Erase by painting the grid background over the stroke area
      ctx.save()
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2)
      ctx.clip()
      if (gridRef.current) {
        ctx.putImageData(gridRef.current, 0, 0)
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
      setHasStrokes(true)
    }

    lastPoint.current = pos
  }

  function endDraw() {
    setIsDrawing(false)
    lastPoint.current = null
  }

  function clearCanvas() {
    drawGrid()
    setHasStrokes(false)
  }

  function selectPen() {
    setTool('pen')
  }

  function selectEraser() {
    // Save current strokes to grid snapshot so eraser restores grid (not strokes)
    setTool(t => t === 'eraser' ? 'pen' : 'eraser')
  }

  return (
    <div className="a5-writing-pad">
      <div className="a5-canvas-wrap">
        <canvas
          ref={canvasRef}
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
      </div>
      <div className="a5-toolbar">
        <div className="a5-toolbar-group">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`a5-color-btn${color === c && tool === 'pen' ? ' a5-color-btn--active' : ''}`}
              style={{ background: c }}
              onClick={() => { setColor(c); setTool('pen') }}
              aria-label={`顏色`}
            />
          ))}
        </div>
        <div className="a5-toolbar-group">
          {THICKNESSES.map((t) => (
            <button
              key={t}
              className={`a5-thick-btn${thickness === t ? ' a5-thick-btn--active' : ''}`}
              onClick={() => setThickness(t)}
              aria-label={`筆畫粗細`}
            >
              <span className="a5-thick-dot" style={{ width: t * 2, height: t * 2 }} />
            </button>
          ))}
        </div>
        <div className="a5-toolbar-group">
          <button className={`a5-tool-btn${tool === 'eraser' ? ' a5-tool-btn--active' : ''}`} onClick={selectEraser} aria-label="橡皮擦">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>
          </button>
          <button className="a5-tool-btn" onClick={clearCanvas} aria-label="全部清除">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M5 6v14h14V6"/></svg>
          </button>
          <button className="a5-tool-btn a5-tool-btn--submit" onClick={onSubmit} disabled={!hasStrokes} aria-label="提交">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
        </div>
      </div>
    </div>
  )
}
