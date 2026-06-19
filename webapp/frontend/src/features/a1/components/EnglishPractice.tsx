import { useState } from 'react'
import { type A1EnglishWord } from '../../../shared/api/client'
import { speakEnglish } from '../../../shared/speech/tts'
import { recognizeOnce } from '../../../shared/speech/recognizeOnce'
import { useSpeechCapture } from '../speechCapture'
import { celebrate } from '../../../shared/celebrate'
import { useScore } from '../../../shared/ScoreContext'

/** 比對小朋友唸的與目標單字：去掉非字母、小寫，包含或高相似即過。 */
function matches(spoken: string, target: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
  const a = norm(spoken)
  const b = norm(target)
  if (!a || !b) return false
  if (a === b || a.includes(b) || b.includes(a)) return true
  // 簡單字元重疊比例（容忍辨識小誤差）
  let hit = 0
  const pool = a.split('')
  for (const ch of b) {
    const i = pool.indexOf(ch)
    if (i >= 0) {
      hit += 1
      pool.splice(i, 1)
    }
  }
  return hit / b.length >= 0.8
}

type RowState = 'idle' | 'listening' | 'correct' | 'retry' | 'error'

function WordRow({ item }: { item: A1EnglishWord }) {
  const { addScore } = useScore()
  // 跟讀借用「原本的聽音」（A1 主辨識）；不在 Provider 內時退回獨立辨識。
  const capture = useSpeechCapture()
  const [state, setState] = useState<RowState>('idle')
  const [heard, setHeard] = useState('')

  async function practice() {
    setState('listening')
    setHeard('')
    try {
      // 按下「跟讀」→ 直接借用主辨識聽一句（避免與常駐中文辨識搶麥克風），
      // 結果再導進下面的 matches() 判斷路徑。
      const transcript = capture
        ? await capture.captureOnce({ lang: 'en-US' })
        : await recognizeOnce('en-US')
      setHeard(transcript)
      if (matches(transcript, item.word)) {
        setState('correct')
        celebrate()
        addScore(1)
      } else {
        setState('retry')
      }
    } catch {
      setState('error')
    }
  }

  return (
    <li className={`a1-en-row a1-en-row--${state}`}>
      <button
        className="a1-en-listen"
        onClick={() => speakEnglish(item.word)}
        aria-label={`聽 ${item.word} 怎麼唸`}
        title="聽聽看"
      >
        🔊
      </button>
      <div className="a1-en-text">
        <span className="a1-en-word">{item.word}</span>
        <span className="a1-en-meaning">{item.meaning}</span>
      </div>
      <button
        className={`a1-en-speak${state === 'listening' ? ' a1-en-speak--active' : ''}`}
        onClick={() => void practice()}
        disabled={state === 'listening'}
        aria-label={`跟著唸 ${item.word}`}
        title="跟著唸唸看"
      >
        {state === 'listening' ? '🎙️…' : '🎤 跟讀'}
      </button>
      <span className="a1-en-result">
        {state === 'correct' && '✓ 很棒！'}
        {state === 'retry' && (heard ? `我聽到「${heard}」，再試一次！` : '再試一次！')}
        {state === 'error' && '沒聽到，再按一次喔'}
      </span>
    </li>
  )
}

/** 英文跟讀練習（inline 在 explain 英文卡片下方）：每個單字可聽、可跟讀比對。 */
export function EnglishPractice({ words }: { words: A1EnglishWord[] }) {
  if (!words.length) return null
  return (
    <div className="a1-en-practice">
      <h4 className="a1-en-practice__title">跟著唸唸看 🗣️</h4>
      <ul className="a1-en-list">
        {words.map((w, i) => (
          <WordRow key={`${w.word}-${i}`} item={w} />
        ))}
      </ul>
    </div>
  )
}
