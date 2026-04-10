import { createContext, useContext, useState, type PropsWithChildren } from 'react'

type ScoreContextType = {
  score: number
  addScore: (points: number) => void
}

const ScoreContext = createContext<ScoreContextType>({ score: 0, addScore: () => {} })

export function ScoreProvider({ children }: PropsWithChildren) {
  const [score, setScore] = useState(0)
  const addScore = (points: number) => setScore((s) => s + points)
  return (
    <ScoreContext.Provider value={{ score, addScore }}>
      {children}
    </ScoreContext.Provider>
  )
}

export function useScore() {
  return useContext(ScoreContext)
}
