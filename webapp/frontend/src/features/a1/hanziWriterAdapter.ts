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
    throw new Error('HanziWriter script is not available in the current runtime.')
  }

  return constructor.create(target, character, {
    width: 180,
    height: 180,
    padding: 5,
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
