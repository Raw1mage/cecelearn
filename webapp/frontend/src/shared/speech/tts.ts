/**
 * Minimal SpeechSynthesis wrapper (zh-TW).
 * 家教回覆朗讀；可開關，預設開（DD-9）。零後端成本。
 */

let enabled = true
let zhVoice: SpeechSynthesisVoice | null = null
let enVoice: SpeechSynthesisVoice | null = null

/** 最後一次 TTS 播放結束的時間戳（用於 echo 軟閘尾窗）。 */
let lastSpeechEndedAt = 0
/** TTS 結束後仍可能殘響進辨識器的尾窗（毫秒）。 */
const ECHO_TAIL_MS = 700
const SELF_ECHO_MEMORY_MS = 60_000
const SELF_ECHO_SIMILARITY = 0.72
const recentSpeech: Array<{ text: string; at: number }> = []

type SpeechEndListener = () => void
const speechEndListeners = new Set<SpeechEndListener>()

/** 訂閱「小雞老師朗讀結束」事件（供語音辨識在 TTS 後自我修復重啟）。回傳取消訂閱函式。 */
export function addSpeechEndListener(listener: SpeechEndListener): () => void {
  speechEndListeners.add(listener)
  return () => {
    speechEndListeners.delete(listener)
  }
}

function notifySpeechEnd(): void {
  for (const listener of speechEndListeners) {
    try {
      listener()
    } catch {
      /* listener 自己的錯誤不影響其他訂閱者 */
    }
  }
}

function normalizeSpeechText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s，。！？、,.!?；;：「」『』（）()《》〈〉\[\]【】\-—~～]/g, '')
}

function pruneRecentSpeech(now = Date.now()): void {
  while (recentSpeech.length > 0 && now - recentSpeech[0].at > SELF_ECHO_MEMORY_MS) {
    recentSpeech.shift()
  }
}

function recordSpeechText(text: string): void {
  const normalized = normalizeSpeechText(text)
  if (!normalized) return
  const now = Date.now()
  pruneRecentSpeech(now)
  recentSpeech.push({ text: normalized, at: now })
  if (recentSpeech.length > 8) recentSpeech.shift()
}

function diceSimilarity(left: string, right: string): number {
  if (left === right) return 1
  if (left.length < 2 || right.length < 2) return 0
  const counts = new Map<string, number>()
  for (let index = 0; index < left.length - 1; index += 1) {
    const bigram = left.slice(index, index + 2)
    counts.set(bigram, (counts.get(bigram) ?? 0) + 1)
  }
  let overlap = 0
  for (let index = 0; index < right.length - 1; index += 1) {
    const bigram = right.slice(index, index + 2)
    const count = counts.get(bigram) ?? 0
    if (count > 0) {
      overlap += 1
      counts.set(bigram, count - 1)
    }
  }
  return (2 * overlap) / (left.length + right.length - 2)
}

function longestCommonSubsequenceRatio(left: string, right: string): number {
  const shorter = left.length <= right.length ? left : right
  const longer = left.length <= right.length ? right : left
  if (shorter.length === 0) return 0
  const previous = new Array(shorter.length + 1).fill(0)
  const current = new Array(shorter.length + 1).fill(0)
  for (let longIndex = 1; longIndex <= longer.length; longIndex += 1) {
    for (let shortIndex = 1; shortIndex <= shorter.length; shortIndex += 1) {
      current[shortIndex] =
        longer[longIndex - 1] === shorter[shortIndex - 1]
          ? previous[shortIndex - 1] + 1
          : Math.max(previous[shortIndex], current[shortIndex - 1])
    }
    for (let shortIndex = 0; shortIndex <= shorter.length; shortIndex += 1) {
      previous[shortIndex] = current[shortIndex]
      current[shortIndex] = 0
    }
  }
  return previous[shorter.length] / shorter.length
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null
  const voices = window.speechSynthesis.getVoices()
  if (voices.length === 0) return null
  // 優先 zh-TW，其次任何 zh
  return (
    voices.find((v) => /zh[-_]TW/i.test(v.lang)) ??
    voices.find((v) => /^zh/i.test(v.lang)) ??
    null
  )
}

function pickEnVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null
  const voices = window.speechSynthesis.getVoices()
  if (voices.length === 0) return null
  return (
    voices.find((v) => /en[-_]US/i.test(v.lang)) ??
    voices.find((v) => /^en/i.test(v.lang)) ??
    null
  )
}

export function isTtsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/**
 * 朗讀一個英文單字／句子（英文跟讀練習用）。放慢給小朋友聽清楚。
 * 不受朗讀總開關 enabled 影響——這是使用者「明確點擊聆聽」的動作。
 */
export function speakEnglish(text: string): void {
  if (!text || !isTtsSupported()) return
  const synth = window.speechSynthesis
  synth.cancel()
  recordSpeechText(text)
  if (!enVoice) enVoice = pickEnVoice()
  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = 'en-US'
  if (enVoice) utter.voice = enVoice
  utter.rate = 0.8
  utter.pitch = 1.0
  utter.onend = () => {
    lastSpeechEndedAt = Date.now()
    notifySpeechEnd()
  }
  utter.onerror = () => {
    lastSpeechEndedAt = Date.now()
    notifySpeechEnd()
  }
  synth.speak(utter)
}

export function setTtsEnabled(value: boolean): void {
  enabled = value
  if (!value) cancelSpeech()
}

export function isTtsEnabled(): boolean {
  return enabled
}

export function cancelSpeech(): void {
  if (isTtsSupported()) window.speechSynthesis.cancel()
}

/** 小雞此刻是否正在朗讀（用於語音辨識的 echo 軟閘 + 重啟避讓）。 */
export function isSpeaking(): boolean {
  return isTtsSupported() && window.speechSynthesis.speaking
}

/**
 * echo 軟閘：小雞正在朗讀，或剛朗讀完的尾窗內（殘響可能竄入辨識器）。
 * 全雙工不暫停麥克風，但此期間辨識結果應被丟棄，擋掉自我迴圈。
 */
export function isWithinSpeechGuard(): boolean {
  if (!isTtsSupported()) return false
  if (window.speechSynthesis.speaking) return true
  return Date.now() - lastSpeechEndedAt < ECHO_TAIL_MS
}

export function isLikelySelfEcho(transcript: string): boolean {
  const normalized = normalizeSpeechText(transcript)
  if (normalized.length < 4) return false
  pruneRecentSpeech()
  return recentSpeech.some((item) => {
    if (item.text.includes(normalized) || normalized.includes(item.text)) return true
    return (
      diceSimilarity(item.text, normalized) >= SELF_ECHO_SIMILARITY ||
      longestCommonSubsequenceRatio(item.text, normalized) >= 0.82
    )
  })
}

/** 朗讀一段文字（若開啟且支援）。會先取消前一段，避免疊唸。 */
export function speak(text: string): void {
  if (!enabled || !text || !isTtsSupported()) return
  const synth = window.speechSynthesis
  synth.cancel()
  recordSpeechText(text)
  if (!zhVoice) zhVoice = pickVoice()
  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = 'zh-TW'
  if (zhVoice) utter.voice = zhVoice
  utter.rate = 0.95
  utter.pitch = 1.05
  utter.onend = () => {
    lastSpeechEndedAt = Date.now()
    notifySpeechEnd()
  }
  utter.onerror = () => {
    lastSpeechEndedAt = Date.now()
    notifySpeechEnd()
  }
  synth.speak(utter)
}

// voices 可能非同步載入
if (isTtsSupported()) {
  window.speechSynthesis.onvoiceschanged = () => {
    zhVoice = pickVoice()
    enVoice = pickEnVoice()
  }
}
