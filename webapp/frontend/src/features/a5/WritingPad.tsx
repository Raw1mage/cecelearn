import { useRef, useEffect, useState, useCallback } from 'react'

type Props = {
  width?: number
  height?: number
  onSubmit: (imageData: ImageData) => void
  answer?: string
  showHint: boolean
}

const COLORS = ['#1e293b', '#dc2626', '#2563eb', '#16a34a']
const THICKNESSES = [3, 6, 10]

export function WritingPad({ width = 320, height = 320, onSubmit, answer, showHint }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [color, setColor] = useState(COLORS[0])
  const [thickness, setThickness] = useState(THICKNESSES[1])
  const [hasStrokes, setHasStrokes] = useState(false)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)

  const getCtx = useCallback(() => canvasRef.current?.getContext('2d') ?? null, [])

  useEffect(() => {
    const ctx = getCtx()
    if (!ctx) return
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, width, height)
    // Draw grid lines
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(width / 2, 0); ctx.lineTo(width / 2, height)
    ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2)
    ctx.stroke()
    ctx.setLineDash([])
    setHasStrokes(false)
  }, [width, height, getCtx, answer]) // reset when answer changes (new question)

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
    ctx.strokeStyle = color
    ctx.lineWidth = thickness
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastPoint.current = pos
    setHasStrokes(true)
  }

  function endDraw() {
    setIsDrawing(false)
    lastPoint.current = null
  }

  function clearCanvas() {
    const ctx = getCtx()
    if (!ctx) return
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, width, height)
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(width / 2, 0); ctx.lineTo(width / 2, height)
    ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2)
    ctx.stroke()
    ctx.setLineDash([])
    setHasStrokes(false)
  }

  function handleSubmit() {
    const ctx = getCtx()
    if (!ctx) return
    onSubmit(ctx.getImageData(0, 0, width, height))
  }

  return (
    <div className="a5-writing-pad">
      <div className="a5-canvas-wrap">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="a5-canvas"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {showHint && answer && (
          <div className="a5-hint-overlay">{answer}</div>
        )}
      </div>
      <div className="a5-toolbar">
        <div className="a5-toolbar-group">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`a5-color-btn${color === c ? ' a5-color-btn--active' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`顏色 ${c}`}
            />
          ))}
        </div>
        <div className="a5-toolbar-group">
          {THICKNESSES.map((t) => (
            <button
              key={t}
              className={`a5-thick-btn${thickness === t ? ' a5-thick-btn--active' : ''}`}
              onClick={() => setThickness(t)}
              aria-label={`筆畫粗細 ${t}`}
            >
              <span className="a5-thick-dot" style={{ width: t * 2, height: t * 2 }} />
            </button>
          ))}
        </div>
        <div className="a5-toolbar-group">
          <button className="a5-tool-btn" onClick={clearCanvas} aria-label="擦除">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M5 6v14h14V6"/></svg>
          </button>
          <button className="a5-tool-btn a5-tool-btn--submit" onClick={handleSubmit} disabled={!hasStrokes} aria-label="提交">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
        </div>
      </div>
    </div>
  )
}
