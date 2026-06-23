import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react'

type ScoreContextType = {
  score: number
  addScore: (points: number) => void
}

const ScoreContext = createContext<ScoreContextType>({ score: 0, addScore: () => {} })

/** 星星分數持久化 key（學習進度累積，reload 不歸零）。 */
const SCORE_KEY = 'cecelearn:score:v1'

/** 從 localStorage 讀回累積分數（壞值/不可用 fail-soft 回 0，不靜默吞功能）。 */
function loadScore(): number {
  try {
    const raw = localStorage.getItem(SCORE_KEY)
    if (!raw) return 0
    const n = Number(raw)
    return Number.isFinite(n) && n >= 0 ? n : 0
  } catch {
    return 0
  }
}

export function ScoreProvider({ children }: PropsWithChildren) {
  // lazy init：mount 時即還原累積分數，避免閃一下 0 再跳回。
  const [score, setScore] = useState(loadScore)
  const addScore = (points: number) => setScore((s) => s + points)
  // 分數變動即寫回 localStorage（隱私模式/配額用盡時略過，不擋功能）。
  useEffect(() => {
    try {
      localStorage.setItem(SCORE_KEY, String(score))
    } catch {
      /* localStorage 不可用：略過持久化，不影響當前 session 計分 */
    }
  }, [score])
  return (
    <ScoreContext.Provider value={{ score, addScore }}>
      {children}
    </ScoreContext.Provider>
  )
}

export function useScore() {
  return useContext(ScoreContext)
}
