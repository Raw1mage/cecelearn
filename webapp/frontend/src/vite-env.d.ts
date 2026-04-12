/// <reference types="vite/client" />

declare interface SpeechRecognitionEventLike {
  results: ArrayLike<{ isFinal: boolean } & ArrayLike<{ transcript: string }>>
  error?: string
}

declare interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  onstart: null | (() => void)
  onend: null | (() => void)
  onerror: null | ((event: { error: string }) => void)
  onresult: null | ((event: SpeechRecognitionEventLike) => void)
}
