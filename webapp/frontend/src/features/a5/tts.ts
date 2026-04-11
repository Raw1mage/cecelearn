/**
 * Text-to-Speech utility for dictation.
 *
 * Mobile browsers require speechSynthesis.speak() to be called
 * within a user-gesture call stack. We "unlock" the audio on the
 * first user tap, then subsequent calls work freely.
 */

let unlocked = false

/** Call this once from a click/touch handler to unlock mobile TTS */
export function unlockTTS() {
  if (unlocked || !window.speechSynthesis) return
  const u = new SpeechSynthesisUtterance('')
  u.volume = 0
  window.speechSynthesis.speak(u)
  unlocked = true
}

function speakOnce(text: string, rate: number, volume = 1): Promise<void> {
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-TW'
    utterance.rate = rate
    utterance.pitch = 1
    utterance.volume = volume
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve() // don't block on error
    window.speechSynthesis.speak(utterance)
  })
}

function pause(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

/** Warm up the iOS audio session with a near-silent utterance */
async function prime(): Promise<void> {
  await speakOnce('。', 2, 0.01)
}

export async function speak(text: string, rate = 0.7): Promise<void> {
  if (!window.speechSynthesis) return

  window.speechSynthesis.cancel()
  await prime() // activate audio pipeline before real speech

  if (text.length > 1) {
    await speakOnce(text, 0.5)
    await pause(600)
  }

  await speakOnce(text, rate)
}

export function stopSpeaking() {
  window.speechSynthesis?.cancel()
}

export function isTTSSupported(): boolean {
  return 'speechSynthesis' in window
}
