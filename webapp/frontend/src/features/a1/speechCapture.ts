import { createContext, useContext } from 'react'

/**
 * 跟讀「借用主辨識」契約（DD-跟讀）。
 *
 * 跟讀不再自己開第二個 SpeechRecognition——那會與 A1Page 常駐的中文辨識搶同一支
 * 麥克風／辨識器，互相弄聾（這就是原本的衝突）。改成借用「原本的聽音」那一支：
 * 暫時把它切到目標語言、攔下這一句辨識結果導回呼叫端（跟讀判斷），結束後語言切回。
 */
export type SpeechCapture = {
  /**
   * 借用主辨識聽一句話並回傳辨識文字。
   * 失敗（沒聲音/逾時/不支援/被新的跟讀取代）會 reject。
   */
  captureOnce: (opts?: { lang?: string; timeoutMs?: number }) => Promise<string>
  /** 主辨識是否已就緒（未就緒時 captureOnce 會 reject）。 */
  ready: boolean
}

const SpeechCaptureContext = createContext<SpeechCapture | null>(null)

/** 取得主辨識借用入口；不在 Provider 內時回 null（呼叫端可自行退回獨立辨識）。 */
export function useSpeechCapture(): SpeechCapture | null {
  return useContext(SpeechCaptureContext)
}

export { SpeechCaptureContext }
