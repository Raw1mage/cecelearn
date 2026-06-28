import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useEffect,
  useCallback,
} from 'react'

export interface EnglishWritingPadRef {
  clear: () => void
  verify: () => Promise<{ ok: boolean; coverage: number; outsideRatio: number; empty: boolean }>
}

interface Props {
  word: string
  showHint: boolean
  width?: number
  height?: number
  onStrokesChange?: (hasStrokes: boolean) => void
}

export const EnglishWritingPad = forwardRef<EnglishWritingPadRef, Props>(
  (
    { word, showHint, width = 560, height = 180, onStrokesChange },
    ref
  ) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const templateCanvasRef = useRef<HTMLCanvasElement | null>(null) // 離線目標範本
    const userCanvasRef = useRef<HTMLCanvasElement | null>(null)     // 離線使用者筆跡
    
    const [isDrawing, setIsDrawing] = useState(false)
    const lastPoint = useRef<{ x: number; y: number } | null>(null)
    const strokeCountRef = useRef(0)
    const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
    const [color, setColor] = useState<string>('#0f172a')

    // 🚀 新增筆劃點收集軌跡以進行 AI 手寫辨識
    const inkRef = useRef<number[][][]>([]) // 格式：[ [ [x1, x2...], [y1, y2...], [t1, t2...] ], stroke2, ... ]
    const startTimeRef = useRef<number>(Date.now())

    const getCtx = useCallback(() => {
      return canvasRef.current?.getContext('2d')
    }, [])

    // 繪製背景輔助「四線三格」線條
    const drawGuidelines = (ctx: CanvasRenderingContext2D) => {
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(0, 0, width, height)

      // 計算四線三格的 Y 座標
      const lineSpacing = height / 5
      const y1 = lineSpacing * 1.3 // 頂線
      const y2 = lineSpacing * 2.1 // 中虛線
      const y3 = lineSpacing * 2.9 // 基準底線 (深色)
      const y4 = lineSpacing * 3.7 // 最下底線

      // 畫格線背景
      ctx.lineWidth = 1.5

      // Line 1: 頂線 (淺紅 / 橘紅)
      ctx.strokeStyle = '#fca5a5'
      ctx.beginPath()
      ctx.moveTo(0, y1)
      ctx.lineTo(width, y1)
      ctx.stroke()

      // Line 2: 中虛線 (淺藍虛線)
      ctx.strokeStyle = '#cbd5e1'
      ctx.setLineDash([6, 6])
      ctx.beginPath()
      ctx.moveTo(0, y2)
      ctx.lineTo(width, y2)
      ctx.stroke()
      ctx.setLineDash([]) // 恢復實線

      // Line 3: 基準底線 (深藍基線，手寫對齊用)
      ctx.strokeStyle = '#94a3b8'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(0, y3)
      ctx.lineTo(width, y3)
      ctx.stroke()
      ctx.lineWidth = 1.5

      // Line 4: 最下底線 (淺紅 / 橘紅)
      ctx.strokeStyle = '#fca5a5'
      ctx.beginPath()
      ctx.moveTo(0, y4)
      ctx.lineTo(width, y4)
      ctx.stroke()
    }

    // 計算自適應字體大小以貼合手寫格線
    const getFontSizeAndFont = (ctx: CanvasRenderingContext2D, text: string) => {
      // 基準大小為 90px，Comic Sans MS 為英文手寫體
      let fontSize = 90
      ctx.font = `bold ${fontSize}px "Comic Sans MS", "Arial", sans-serif`
      
      const wordWidth = ctx.measureText(text).width
      const maxWidth = width - 60
      if (wordWidth > maxWidth) {
        fontSize = Math.floor(fontSize * (maxWidth / wordWidth))
      }
      return `bold ${fontSize}px "Comic Sans MS", "Arial", sans-serif`
    }

    // 建立離線 Canvas 繪製對比範本
    const drawTemplate = useCallback((txt: string) => {
      if (!templateCanvasRef.current) {
        templateCanvasRef.current = document.createElement('canvas')
      }
      if (!userCanvasRef.current) {
        userCanvasRef.current = document.createElement('canvas')
      }
      
      const tCanvas = templateCanvasRef.current
      const uCanvas = userCanvasRef.current
      
      tCanvas.width = width
      tCanvas.height = height
      uCanvas.width = width
      uCanvas.height = height
      
      const tCtx = tCanvas.getContext('2d')
      const uCtx = uCanvas.getContext('2d')
      if (!tCtx || !uCtx) return
      
      tCtx.clearRect(0, 0, width, height)
      uCtx.clearRect(0, 0, width, height)
      
      // 繪製目標單字於離線模版 Canvas 上（黑底，用於比對）
      tCtx.fillStyle = '#000000'
      tCtx.textAlign = 'center'
      tCtx.textBaseline = 'middle'
      tCtx.font = getFontSizeAndFont(tCtx, txt)
      
      // 微調字體 Y 座標，使其字底基準完美壓在基準底線（line3）上
      tCtx.fillText(txt, width / 2, height / 2 + height * 0.05)
    }, [width, height])

    const clearCanvas = useCallback(() => {
      const ctx = getCtx()
      if (!ctx) return
      ctx.clearRect(0, 0, width, height)
      
      // 滿填背景色
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(0, 0, width, height)
      
      // 繪製四線三格
      drawGuidelines(ctx)
      
      // 顯示虛線單字提示
      if (showHint) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.22)' // 淺灰色虛線提示
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.font = getFontSizeAndFont(ctx, word)
        ctx.fillText(word, width / 2, height / 2 + height * 0.05)
      }
      
      // 清空使用者筆跡 Canvas
      if (userCanvasRef.current) {
        const uCtx = userCanvasRef.current.getContext('2d')
        uCtx?.clearRect(0, 0, width, height)
      }
      
      strokeCountRef.current = 0
      inkRef.current = [] // 重置筆劃軌跡
      startTimeRef.current = Date.now()
      onStrokesChange?.(false)
    }, [getCtx, width, height, showHint, word, onStrokesChange])

    const redrawScreen = useCallback(() => {
      const ctx = getCtx()
      if (!ctx) return
      
      // 1. 滿填背景色
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(0, 0, width, height)
      
      // 2. 繪製四線三格
      drawGuidelines(ctx)
      
      // 3. 顯示虛線單字提示
      if (showHint) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.22)' // 淺灰色虛線提示
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.font = getFontSizeAndFont(ctx, word)
        ctx.fillText(word, width / 2, height / 2 + height * 0.05)
      }

      // 4. 從離線畫布複製使用者筆劃還原至螢幕上
      if (userCanvasRef.current) {
        ctx.drawImage(userCanvasRef.current, 0, 0)
      }
    }, [getCtx, width, height, showHint, word])

    useEffect(() => {
      drawTemplate(word)
      clearCanvas()
    }, [word, drawTemplate, clearCanvas])

    useEffect(() => {
      redrawScreen()
    }, [showHint, redrawScreen])

    // 暴露方法給父組件
    useImperativeHandle(ref, () => ({
      clear() {
        clearCanvas()
      },
      async verify() {
        if (!templateCanvasRef.current || !userCanvasRef.current) {
          return { ok: false, coverage: 0, outsideRatio: 0, empty: true }
        }

        const ink = inkRef.current
        const empty = ink.length === 0
        if (empty) {
          return { ok: false, coverage: 0, outsideRatio: 0, empty: true }
        }

        const target = word.trim().toLowerCase()

        // 🚀 優先使用線上 AI 手寫辨識模組 (Google Handwriting API)
        try {
          const response = await fetch('https://inputtools.google.com/request?itc=en-t-i0-handwrit&app=translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              input_type: 0,
              requests: [{
                writing_guide: {
                  writing_area_width: width,
                  writing_area_height: height
                },
                pre_context: '',
                max_num_results: 10,
                max_completions: 0,
                language: 'en',
                ink: ink
              }]
            })
          })
          
          const data = await response.json()
          if (data && data[0] === 'SUCCESS' && Array.isArray(data[1]?.[0]?.[1])) {
            const candidates = data[1][0][1] as string[]
            console.log('[Handwriting OCR Candidates]', candidates)
            
            // 比對候選字 (不限大小寫，只要有任何一個能辨識為 target 即可)
            const match = candidates.some(c => c.trim().toLowerCase() === target)
            if (match) {
              console.log(`[Handwriting Match Success] Word "${word}" recognized successfully via Google Handwriting API!`)
              return { ok: true, coverage: 1.0, outsideRatio: 0, empty: false }
            }
          }
        } catch (err) {
          console.error('Google Handwriting API failed, falling back to pixel matching:', err)
        }

        // 🚀 如果辨識沒中或網路斷線，則落到 Bounding Box 像素重疊比對做備援 (Fail-Soft Backup)
        const tCtx = templateCanvasRef.current.getContext('2d', { willReadFrequently: true })
        const uCtx = userCanvasRef.current.getContext('2d', { willReadFrequently: true })
        if (!tCtx || !uCtx) {
          return { ok: false, coverage: 0, outsideRatio: 0, empty: true }
        }
        
        const uData = uCtx.getImageData(0, 0, width, height).data

        // 1. 掃描使用者筆跡的邊界方框 (Bounding Box)
        let uMinX = width, uMaxX = 0, uMinY = height, uMaxY = 0
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4
            if (uData[idx + 3] > 10) {
              if (x < uMinX) uMinX = x
              if (x > uMaxX) uMaxX = x
              if (y < uMinY) uMinY = y
              if (y > uMaxY) uMaxY = y
            }
          }
        }

        const uWidth = uMaxX - uMinX
        const uHeight = uMaxY - uMinY

        // 提供 3 種大小寫變體進行對齊核對
        const variants = Array.from(new Set([
          word.toLowerCase(),
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
          word.toUpperCase()
        ]))

        let bestResult = { ok: false, coverage: 0, outsideRatio: 999, empty: false }

        for (const variant of variants) {
          drawTemplate(variant)
          const tCtxForVariant = templateCanvasRef.current.getContext('2d', { willReadFrequently: true })
          if (!tCtxForVariant) continue
          const tData = tCtxForVariant.getImageData(0, 0, width, height).data

          let tMinX = width, tMaxX = 0, tMinY = height, tMaxY = 0
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const idx = (y * width + x) * 4
              if (tData[idx + 3] > 10) {
                if (x < tMinX) tMinX = x
                if (x > tMaxX) tMaxX = x
                if (y < tMinY) tMinY = y
                if (y > tMaxY) tMaxY = y
              }
            }
          }

          const tWidth = tMaxX - tMinX
          const tHeight = tMaxY - tMinY

          if (tWidth > 0 && uWidth > 0 && tHeight > 0 && uHeight > 0) {
            const minExpectedWidth = variant.length * 10
            if (uWidth < minExpectedWidth) {
              continue
            }

            const tempCanvas = document.createElement('canvas')
            tempCanvas.width = width
            tempCanvas.height = height
            const tempCtx = tempCanvas.getContext('2d')
            if (!tempCtx) continue

            tempCtx.clearRect(0, 0, width, height)
            tempCtx.drawImage(
              userCanvasRef.current,
              uMinX, uMinY, uWidth, uHeight,
              tMinX, tMinY, tWidth, tHeight
            )

            const scaledUserData = tempCtx.getImageData(0, 0, width, height).data

            let targetPixels = 0
            let collidedPixels = 0
            let outsidePixels = 0

            for (let i = 0; i < tData.length; i += 4) {
              const isTarget = tData[i + 3] > 10
              const isUser = scaledUserData[i + 3] > 10

              if (isTarget) {
                targetPixels++
                if (isUser) collidedPixels++
              } else {
                if (isUser) outsidePixels++
              }
            }

            if (targetPixels > 0) {
              const coverage = collidedPixels / targetPixels
              const outsideRatio = outsidePixels / targetPixels
              
              const ok = coverage >= 0.40 && outsideRatio <= 3.5

              console.log(`[Handwriting Pixel Match Fallback: "${variant}"] Target: ${targetPixels}, Collided: ${collidedPixels}, Outside: ${outsidePixels}, Coverage: ${(coverage * 100).toFixed(1)}%, Outside Ratio: ${(outsideRatio * 100).toFixed(1)}%, Result: ${ok}`)

              if (ok) {
                return { ok: true, coverage, outsideRatio, empty: false }
              }

              if (coverage > bestResult.coverage) {
                bestResult = { ok: false, coverage, outsideRatio, empty: false }
              }
            }
          }
        }

        drawTemplate(word)
        return bestResult
      }
    }))

    const handleStart = (x: number, y: number) => {
      setIsDrawing(true)
      lastPoint.current = { x, y }
      strokeCountRef.current++
      onStrokesChange?.(true)

      // 只有非橡皮擦時，才紀錄起筆軌跡給 AI 手寫辨識
      if (tool !== 'eraser') {
        if (inkRef.current.length === 0) {
          startTimeRef.current = Date.now()
        }
        inkRef.current.push([
          [Math.round(x)],
          [Math.round(y)],
          [Date.now() - startTimeRef.current]
        ])
      }
    }

    const handleMove = (x: number, y: number) => {
      if (!isDrawing || !lastPoint.current) return
      
      const ctx = getCtx()
      const uCtx = userCanvasRef.current?.getContext('2d')
      if (!ctx || !uCtx) return
      
      const from = lastPoint.current
      const to = { x, y }
      
      if (tool === 'eraser') {
        // 🧼 橡皮擦模式
        uCtx.globalCompositeOperation = 'destination-out'
        uCtx.lineWidth = 28 // 稍微寬一點的橡皮擦範圍
        uCtx.lineCap = 'round'
        uCtx.lineJoin = 'round'
        uCtx.beginPath()
        uCtx.moveTo(from.x, from.y)
        uCtx.lineTo(to.x, to.y)
        uCtx.stroke()
        uCtx.globalCompositeOperation = 'source-over'
        
        // 呼叫重繪，將背景格線、虛線單字與橡皮擦更新後的使用者線條重新渲染至螢幕
        redrawScreen()
      } else {
        // ✏️ 畫筆模式
        // 繪製於螢幕 Canvas
        ctx.strokeStyle = color
        ctx.lineWidth = 8
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.lineTo(to.x, to.y)
        ctx.stroke()
        
        // 繪製於離線比對 Canvas (固定紅色 #ff0000 保持特徵比對的完全正確性)
        uCtx.globalCompositeOperation = 'source-over'
        uCtx.strokeStyle = '#ff0000'
        uCtx.lineWidth = 8
        uCtx.lineCap = 'round'
        uCtx.lineJoin = 'round'
        uCtx.beginPath()
        uCtx.moveTo(from.x, from.y)
        uCtx.lineTo(to.x, to.y)
        uCtx.stroke()

        // 收集筆跡點座標以供 AI 辨識
        const currentStroke = inkRef.current[inkRef.current.length - 1]
        if (currentStroke) {
          currentStroke[0].push(Math.round(x))
          currentStroke[1].push(Math.round(y))
          currentStroke[2].push(Date.now() - startTimeRef.current)
        }
      }
      
      lastPoint.current = to
    }

    const handleEnd = () => {
      if (!isDrawing) return
      setIsDrawing(false)
      lastPoint.current = null
    }

    const getMouseCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()
      return {
        x: (e.clientX - rect.left) * (canvas.width / rect.width),
        y: (e.clientY - rect.top) * (canvas.height / rect.height),
      }
    }

    const getTouchCoords = (e: React.TouchEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas || e.touches.length === 0) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()
      return {
        x: (e.touches[0].clientX - rect.left) * (canvas.width / rect.width),
        y: (e.touches[0].clientY - rect.top) * (canvas.height / rect.height),
      }
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: `${width}px` }}>
        {/* 畫布容器 */}
        <div 
          style={{ 
            border: '4px solid #cbd5e1', 
            borderRadius: '16px', 
            overflow: 'hidden', 
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
            cursor: 'crosshair',
            touchAction: 'none',
            backgroundColor: '#f8fafc',
            width: '100%',
            height: `${height}px`
          }}
        >
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            style={{ width: '100%', height: '100%' }}
            onMouseDown={(e) => {
              const { x, y } = getMouseCoords(e)
              handleStart(x, y)
            }}
            onMouseMove={(e) => {
              const { x, y } = getMouseCoords(e)
              handleMove(x, y)
            }}
            onMouseUp={handleEnd}
            onMouseLeave={handleEnd}
            onTouchStart={(e) => {
              const { x, y } = getTouchCoords(e)
              handleStart(x, y)
            }}
            onTouchMove={(e) => {
              const { x, y } = getTouchCoords(e)
              handleMove(x, y)
            }}
            onTouchEnd={handleEnd}
          />
        </div>

        {/* ✏️ 畫筆/橡皮擦 與 調色盤工具列 */}
        <div className="a6-pad-tools">
          <div className="a6-tool-toggle">
            <button
              type="button"
              className={`a6-tool-btn ${tool === 'pen' ? 'active' : ''}`}
              onClick={() => setTool('pen')}
              title="Pen"
            >
              ✏️ Pen
            </button>
            <button
              type="button"
              className={`a6-tool-btn ${tool === 'eraser' ? 'active' : ''}`}
              onClick={() => setTool('eraser')}
              title="Eraser"
            >
              🧼 Eraser
            </button>
          </div>

          {tool === 'pen' && (
            <div className="a6-color-palette">
              {['#0f172a', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#f97316'].map(c => (
                <button
                  key={c}
                  type="button"
                  className={`a6-color-dot ${color === c ? 'active' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                  title={c}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }
)

EnglishWritingPad.displayName = 'EnglishWritingPad'
