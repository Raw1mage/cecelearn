/** Text-to-Speech utility for dictation */

function speakOnce(text: string, rate: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-TW'
    utterance.rate = rate
    utterance.pitch = 1
    utterance.onend = () => resolve()
    utterance.onerror = (e) => reject(e)
    window.speechSynthesis.speak(utterance)
  })
}

function pause(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

/**
 * Speak a word for dictation: slow first, pause, then normal speed.
 * e.g., "學校" → (slow) "學...校" → pause → (normal) "學校"
 */
export async function speak(text: string, rate = 0.7): Promise<void> {
  if (!window.speechSynthesis) return

  window.speechSynthesis.cancel()

  // First pass: slow, character by character for multi-char words
  if (text.length > 1) {
    await speakOnce(text, 0.5)
    await pause(600)
  }

  // Second pass: normal speed
  await speakOnce(text, rate)
}

export function stopSpeaking() {
  window.speechSynthesis?.cancel()
}

export function isTTSSupported(): boolean {
  return 'speechSynthesis' in window
}
