/**
 * Simple handwriting grader: renders the answer character(s) to a hidden canvas,
 * then compares pixel overlap with the student's handwriting.
 *
 * Returns a score between 0 and 1 (percentage of overlap).
 */

/** Render answer text to an offscreen canvas and return its pixel data */
function renderAnswer(answer: string, width: number, height: number): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  const chars = answer.split('')
  const cellH = height / chars.length
  const fontSize = Math.min(width * 0.7, cellH * 0.75)

  ctx.fillStyle = '#000000'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `bold ${fontSize}px serif`

  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], width / 2, i * cellH + cellH / 2)
  }

  return ctx.getImageData(0, 0, width, height)
}

/** Check if a pixel is "ink" (dark enough to be a stroke) */
function isInk(data: Uint8ClampedArray, offset: number, threshold: number): boolean {
  const r = data[offset]
  const g = data[offset + 1]
  const b = data[offset + 2]
  const a = data[offset + 3]
  // For the answer: black text on transparent bg → check alpha and darkness
  // For handwriting: colored strokes on white bg → check if significantly different from white
  const brightness = (r + g + b) / 3
  return a > 50 && brightness < threshold
}

/**
 * Grade handwriting by comparing with rendered answer.
 *
 * Strategy:
 * 1. Find all "ink pixels" in the answer rendering
 * 2. Check what percentage of those pixels are covered by handwriting
 * 3. Also penalize writing that's far outside the answer area (noise)
 *
 * Returns { score: 0-1, coverage: 0-1, precision: 0-1 }
 */
export function gradeHandwriting(
  handwritingCanvas: HTMLCanvasElement,
  answer: string,
): { score: number; coverage: number; precision: number } {
  const width = handwritingCanvas.width
  const height = handwritingCanvas.height
  const hwCtx = handwritingCanvas.getContext('2d')
  if (!hwCtx) return { score: 0, coverage: 0, precision: 0 }

  const hwData = hwCtx.getImageData(0, 0, width, height).data
  const answerData = renderAnswer(answer, width, height).data
  const totalPixels = width * height

  let answerInkCount = 0
  let hwInkCount = 0
  let overlapCount = 0

  // Expand answer area slightly (tolerance zone)
  // Create a dilated version of the answer for overlap checking
  const answerMask = new Uint8Array(totalPixels)
  const dilateRadius = Math.max(8, Math.round(width * 0.025))

  // First pass: mark answer ink pixels
  for (let i = 0; i < totalPixels; i++) {
    if (isInk(answerData, i * 4, 128)) {
      answerMask[i] = 1
      answerInkCount++
    }
  }

  // Dilate the answer mask (expand by radius)
  const dilatedMask = new Uint8Array(totalPixels)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (answerMask[y * width + x]) {
        for (let dy = -dilateRadius; dy <= dilateRadius; dy++) {
          for (let dx = -dilateRadius; dx <= dilateRadius; dx++) {
            const ny = y + dy
            const nx = x + dx
            if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
              if (dx * dx + dy * dy <= dilateRadius * dilateRadius) {
                dilatedMask[ny * width + nx] = 1
              }
            }
          }
        }
      }
    }
  }

  // Second pass: check handwriting overlap with dilated answer
  let hwInAnswer = 0
  for (let i = 0; i < totalPixels; i++) {
    const hwIsInk = isInk(hwData, i * 4, 200) // white bg = 255, ink < 200
    if (hwIsInk) {
      hwInkCount++
      if (dilatedMask[i]) {
        hwInAnswer++
        overlapCount++
      }
    }
  }

  if (answerInkCount === 0 || hwInkCount === 0) {
    return { score: 0, coverage: 0, precision: 0 }
  }

  // Coverage: how much of the answer is covered by handwriting
  const coverage = Math.min(1, overlapCount / answerInkCount)

  // Precision: how much of the handwriting is within the answer area
  const precision = hwInAnswer / hwInkCount

  // Combined score: geometric mean of coverage and precision
  const score = Math.sqrt(coverage * precision)

  return { score, coverage, precision }
}

/** Convert score to pass/fail with thresholds */
export function isPassingScore(score: number): boolean {
  return score >= 0.25 // ~25% overlap = roughly recognizable
}
