declare global {
  interface Window {
    HanziWriter?: {
      create: (target: HTMLElement, character: string, options: Record<string, unknown>) => { animateCharacter: () => void }
    }
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
}

export function createHanziWriter(target: HTMLElement, character: string) {
  const constructor = window.HanziWriter
  if (!constructor) {
    throw new Error('筆順元件尚未載入，請重新整理頁面。')
  }

  return constructor.create(target, character, {
    width: 200,
    height: 200,
    padding: 10,
    showOutline: true,
    strokeAnimationSpeed: 1.2,
    delayBetweenStrokes: 150,
    strokeColor: '#60a5fa',
    outlineColor: '#cbd5e1',
  })
}

export function getSpeechRecognitionConstructor() {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}
