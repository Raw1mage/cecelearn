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
  const u = new SpeechSynthesisUtterance(' ')
  u.volume = 0.01  // Android ignores volume=0
  u.lang = getChineseLang()
  window.speechSynthesis.speak(u)
  unlocked = true
}

/** Find the best available Chinese voice — zh-TW preferred, zh-CN fallback */
function getChineseLang(): string {
  try {
    const voices = window.speechSynthesis.getVoices()
    if (voices.some(v => v.lang.startsWith('zh-TW'))) return 'zh-TW'
    if (voices.some(v => v.lang.startsWith('zh-CN'))) return 'zh-CN'
    if (voices.some(v => v.lang.startsWith('zh'))) return 'zh'
  } catch { /* ignore */ }
  return 'zh-TW'  // default, let the system figure it out
}

function speakOnce(text: string, rate: number, volume = 1): Promise<void> {
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = getChineseLang()
    utterance.rate = rate
    utterance.pitch = 1
    utterance.volume = volume
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()
    // Android safety: some engines never fire onend — timeout fallback
    const maxWait = Math.max(3000, text.length * 800)
    const timer = setTimeout(() => resolve(), maxWait)
    const origEnd = utterance.onend
    utterance.onend = () => { clearTimeout(timer); origEnd?.call(utterance, new Event('end') as SpeechSynthesisEvent) }
    utterance.onerror = () => { clearTimeout(timer); resolve() }
    window.speechSynthesis.speak(utterance)
  })
}

function pause(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

let activeAbort: AbortController | null = null

export async function speak(text: string, rate = 0.7, signal?: AbortSignal): Promise<void> {
  if (!window.speechSynthesis) return

  window.speechSynthesis.cancel()
  await pause(200)

  if (signal?.aborted) return

  if (text.length > 1) {
    await speakOnce(text, 0.5)
    if (signal?.aborted) { window.speechSynthesis.cancel(); return }
    await pause(600)
    if (signal?.aborted) return
  }

  await speakOnce(text, rate)
}

/** Cancel any in-progress speech chain and return a new AbortSignal for the next one */
export function newSpeechSession(): AbortSignal {
  if (activeAbort) activeAbort.abort()
  activeAbort = new AbortController()
  stopSpeaking()
  return activeAbort.signal
}

export function stopSpeaking() {
  window.speechSynthesis?.cancel()
}

export function isTTSSupported(): boolean {
  return 'speechSynthesis' in window
}
