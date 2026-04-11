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

export function createHanziWriter(target: HTMLElement, character: string): HanziWriterInstance {
  const constructor = window.HanziWriter
  if (!constructor) {
    throw new Error('筆順元件尚未載入，請重新整理頁面。')
  }

  return constructor.create(target, character, {
    width: 340,
    height: 340,
    padding: 15,
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
