import { getSpeechRecognitionConstructor } from '../../features/a1/hanziWriterAdapter'

/**
 * 單發語音辨識：開一個獨立、用完即丟的 SpeechRecognition 實例聽一句話，回傳辨識文字。
 *
 * 刻意「不」共用 A1Page 那套常駐中文辨識（它鎖 cmn-Hant-TW、有 VAD/echo/自我修復迴圈）。
 * 英文跟讀要 lang=en-US，與主對話的辨識語言不同；獨立實例最乾淨，開關不互相干擾。
 */
export function recognizeOnce(lang: string, timeoutMs = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    const Ctor = getSpeechRecognitionConstructor()
    if (!Ctor) {
      reject(new Error('這台裝置不支援語音辨識'))
      return
    }
    const rec = new Ctor()
    rec.lang = lang
    rec.continuous = false
    rec.interimResults = false
    rec.maxAlternatives = 1

    let settled = false
    const done = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        rec.abort()
      } catch {
        /* ok */
      }
      fn()
    }
    const timer = setTimeout(() => done(() => reject(new Error('沒聽到聲音，再試一次好嗎？'))), timeoutMs)

    rec.onresult = (event) => {
      const last = event.results[event.results.length - 1]
      const transcript = last?.[0]?.transcript ?? ''
      done(() => resolve(transcript.trim()))
    }
    rec.onerror = (event) => done(() => reject(new Error(event.error || '辨識失敗')))
    rec.onend = () => done(() => reject(new Error('沒聽到聲音，再試一次好嗎？')))

    try {
      rec.start()
    } catch (err) {
      done(() => reject(err instanceof Error ? err : new Error('無法開始辨識')))
    }
  })
}
