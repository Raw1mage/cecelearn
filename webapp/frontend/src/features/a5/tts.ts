/**
 * Text-to-Speech utility for dictation.
 *
 * Mobile browsers require speechSynthesis.speak() to be called
 * within a user-gesture call stack. We "unlock" the audio on the
 * first user tap, then subsequent calls work freely.
 */

let unlocked = false
let cachedLang = ''

// Eagerly trigger voice loading on module init (Samsung Chrome needs this)
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.getVoices()
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    cachedLang = '' // reset cache so next call picks up loaded voices
  })
}

let cachedVoice: SpeechSynthesisVoice | null = null

/** Find the best available Chinese voice object */
function getChineseVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice
  try {
    const voices = window.speechSynthesis.getVoices()
    for (const prefix of ['zh-TW', 'zh-CN', 'zh', 'cmn']) {
      const v = voices.find(v => v.lang.startsWith(prefix))
      if (v) { cachedVoice = v; cachedLang = v.lang; return v }
    }
  } catch { /* ignore */ }
  return null
}

function getChineseLang(): string {
  const v = getChineseVoice()
  return v ? v.lang : 'zh-TW'
}

/** Diagnostic info for debugging TTS issues */
export function getTTSDiagnostics(): string {
  if (!window.speechSynthesis) return 'speechSynthesis not available'
  const voices = window.speechSynthesis.getVoices()
  const zhVoices = voices.filter(v => v.lang.startsWith('zh') || v.lang.startsWith('cmn'))
  return `voices: ${voices.length}, zh: ${zhVoices.length} [${zhVoices.map(v => v.lang + (v.localService ? '(local)' : '')).join(', ')}], unlocked: ${unlocked}`
}

/** Call this once from a click/touch handler to unlock mobile TTS — MUST be synchronous */
export function unlockTTS() {
  if (unlocked || !window.speechSynthesis) return
  const u = new SpeechSynthesisUtterance(' ')
  u.volume = 0.01
  u.lang = getChineseLang()
  window.speechSynthesis.speak(u)
  unlocked = true
}

function speakOnce(text: string, rate: number, pitch = 1, volume = 1): Promise<void> {
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text)
    const voice = getChineseVoice()
    if (voice) utterance.voice = voice
    utterance.lang = getChineseLang()
    utterance.rate = rate
    utterance.pitch = pitch
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

export async function speak(text: string, rate = 0.7, signal?: AbortSignal, pitch = 1): Promise<void> {
  if (!window.speechSynthesis) return

  window.speechSynthesis.cancel()
  await pause(200)

  if (signal?.aborted) return

  await speakOnce(text, rate, pitch)
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
