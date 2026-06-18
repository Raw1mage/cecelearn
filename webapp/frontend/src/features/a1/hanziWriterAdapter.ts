export type HanziWriterInstance = {
  animateCharacter: (options?: { onComplete?: () => void }) => void
  quiz: (options?: { onComplete?: () => void; onMistake?: () => void; onCorrectStroke?: () => void }) => void
  hideCharacter: () => void
  showCharacter: () => void
  showOutline: () => void
  hideOutline: () => void
}

declare global {
  interface Window {
    HanziWriter?: {
      create: (target: HTMLElement, character: string, options: Record<string, unknown>) => HanziWriterInstance
    }
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
}

export function createHanziWriter(
  target: HTMLElement,
  character: string,
  /** SVG 邊長（px）——應等於容器實際渲染尺寸，避免 SVG 比框大而偏移/被裁 */
  size = 300,
): HanziWriterInstance {
  const constructor = window.HanziWriter
  if (!constructor) {
    throw new Error('筆順元件尚未載入，請重新整理頁面。')
  }

  return constructor.create(target, character, {
    width: size,
    height: size,
    padding: Math.max(8, Math.round(size * 0.05)),
    showOutline: true,
    strokeAnimationSpeed: 1.2,
    delayBetweenStrokes: 150,
    strokeColor: '#60a5fa',
    outlineColor: '#cbd5e1',
    drawingColor: '#3b82f6',
    drawingWidth: 6,
    showHintAfterMisses: 2,
  })
}

export function getSpeechRecognitionConstructor() {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}
