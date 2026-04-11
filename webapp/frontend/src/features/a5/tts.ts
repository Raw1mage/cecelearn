/** Text-to-Speech utility for dictation */

let currentUtterance: SpeechSynthesisUtterance | null = null

export function speak(text: string, rate = 0.8): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis) {
      reject(new Error('TTS not supported'))
      return
    }

    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-TW'
    utterance.rate = rate
    utterance.pitch = 1
    utterance.onend = () => resolve()
    utterance.onerror = (e) => reject(e)
    currentUtterance = utterance
    window.speechSynthesis.speak(utterance)
  })
}

export function stopSpeaking() {
  window.speechSynthesis?.cancel()
  currentUtterance = null
}

export function isTTSSupported(): boolean {
  return 'speechSynthesis' in window
}
