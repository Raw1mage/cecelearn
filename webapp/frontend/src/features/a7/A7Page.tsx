import { useCallback, useEffect, useState } from 'react'
import { apiClient, type A7CrosswordPuzzle, type A7Slot, type QuizSummary } from '../../shared/api/client'
import { celebrate } from '../../shared/celebrate'
import { Button } from '../../shared/components/Button'
import { Panel } from '../../shared/components/Panel'
import { useScore } from '../../shared/ScoreContext'
import { speak } from '../../shared/speech/tts'
import { CrosswordBoard } from './components/CrosswordBoard'
import { CharTray } from './components/CharTray'
import { useCrossword } from './useCrossword'

/**
 * A7Page —— 成語填字闖關。
 * 狀態機：loading / play / result / error。演算法生成關卡（零後端成本）。
 * 完成單條成語揭曉教學（例句＋釋義兜底＋TTS）；全部完成 celebrate + 加分 + 下一關。
 * 沿用 overlay 契約（onClose/onComplete），亦可獨立 route。
 */

type Phase = 'loading' | 'play' | 'result' | 'error'

type A7PageProps = {
  onClose?: () => void
  onComplete?: (summary: QuizSummary) => void
}

export function A7Page({ onClose, onComplete }: A7PageProps = {}) {
  const { addScore } = useScore()
  const [phase, setPhase] = useState<Phase>('loading')
  const [puzzle, setPuzzle] = useState<A7CrosswordPuzzle | null>(null)
  const [level, setLevel] = useState(1)
  const [error, setError] = useState('')
  const [solvedSlotsCount, setSolvedSlotsCount] = useState(0)
  // 最近完成的成語教學卡（單槽完成時揭曉）
  const [teaching, setTeaching] = useState<A7Slot | null>(null)
  // 揭曉成語的適齡解釋（按需查，DD-10）。'' = 尚未取得/查無；loading 區分查詢中。
  const [explainText, setExplainText] = useState<string>('')
  const [explainLoading, setExplainLoading] = useState(false)
  // 整盤過關但留在盤面複習（需求：通關後不馬上收掉題目畫面）
  const [cleared, setCleared] = useState(false)

  const state = useCrossword(puzzle)

  const loadPuzzle = useCallback(async (lvl: number) => {
    setPhase('loading')
    setError('')
    setTeaching(null)
    setExplainText('')
    setExplainLoading(false)
    setCleared(false)
    setSolvedSlotsCount(0)
    try {
      const res = await apiClient.getCrosswordPuzzle(lvl, 'normal')
      if (!res.ok) {
        setError(res.message || '題目正在準備中，再試一次好嗎？')
        setPhase('error')
        return
      }
      // shape 防禦（PUZZLE_SHAPE_INVALID）：不信任直接 render
      if (!res.puzzle?.slots?.length || !res.puzzle?.cells?.length || !Array.isArray(res.puzzle.tray)) {
        setError('題目怪怪的，換一題吧！')
        setPhase('error')
        return
      }
      setPuzzle(res.puzzle)
      setPhase('play')
    } catch {
      setError('連不上題目，再試一次！')
      setPhase('error')
    }
  }, [])

  useEffect(() => {
    void loadPuzzle(1)
  }, [loadPuzzle])

  // puzzle 換新時，reset hook 狀態（依 puzzleId）
  useEffect(() => {
    if (puzzle) state.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle?.puzzleId])

  // 揭曉某 slot 的教學卡並朗讀；同時按需查適齡解釋（DD-10）並在到位後朗讀解釋
  const revealTeaching = useCallback((slot: A7Slot) => {
    setTeaching(slot)
    setExplainText('')
    setExplainLoading(true)
    // 先朗讀成語 + 例句（解釋還在查時不空等）
    speak(`${slot.idiom}。${slot.example}`, { id: `a7-${slot.idiom}` })

    const wanted = slot.idiom
    void apiClient
      .explainIdiom(wanted)
      .then((res) => {
        // 期間若已換成語（連填多條），丟棄過期結果
        setTeaching((cur) => {
          if (cur?.idiom !== wanted) return cur
          if (res.ok) {
            setExplainText(res.meaning)
            speak(`${wanted}的意思是，${res.meaning}`, { id: `a7-explain-${wanted}` })
          }
          return cur
        })
      })
      .catch(() => {
        /* 顯式失敗：UI 用例句兜底，不 silent fallback 假裝有解釋 */
      })
      .finally(() => setExplainLoading(false))
  }, [])

  // 過關處理：留在盤面複習（需求：通關後不馬上收掉題目畫面）。
  // 灑花 + 加分 + 顯示過關橫幅，但 phase 仍維持 'play'，盤面與教學卡都保留。
  const finishLevel = useCallback(() => {
    celebrate()
    addScore(20)
    setCleared(true)
    onComplete?.({ mode: 'idiom', correct: puzzle?.slots.length ?? 0, total: puzzle?.slots.length ?? 0 })
  }, [addScore, onComplete, puzzle])

  // 點某格（雙向互動）：已選字塊→填入；已填字且兩邊都無 pending→清除；否則切換該格發光選取
  const handleCellClick = useCallback(
    (r: number, c: number) => {
      const cell = puzzle?.cells.find((x) => x.r === r && x.c === c)
      if (!cell) return
      // blank 已有字、且兩邊都沒有 pending 選取 → 視為清除
      if (
        !cell.given &&
        state.charAt(r, c) &&
        state.selectedTrayIdx === null &&
        state.selectedCell === null
      ) {
        state.clearAt(r, c)
        return
      }
      const newlySolved = state.tapCell(r, c)
      if (newlySolved) {
        setSolvedSlotsCount((n) => n + 1)
        revealTeaching(newlySolved)
      }
    },
    [puzzle, state, revealTeaching],
  )

  // 點某字塊（雙向互動）：已選格→填入；否則切換字塊選取
  const handleTrayTap = useCallback(
    (idx: number) => {
      const newlySolved = state.tapTray(idx)
      if (newlySolved) {
        setSolvedSlotsCount((n) => n + 1)
        revealTeaching(newlySolved)
      }
    },
    [state, revealTeaching],
  )

  // 提示
  const handleHint = useCallback(() => {
    const newlySolved = state.hint()
    if (newlySolved) {
      setSolvedSlotsCount((n) => n + 1)
      revealTeaching(newlySolved)
    }
  }, [state, revealTeaching])

  // 偵測整盤完成 → 過關（用 allSolved，避免漏算）。cleared 後不再重觸（留盤複習）。
  useEffect(() => {
    if (phase === 'play' && state.allSolved && !cleared) {
      finishLevel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.allSolved, phase, cleared])

  const nextLevel = useCallback(() => {
    const lvl = level + 1
    setLevel(lvl)
    void loadPuzzle(lvl)
  }, [level, loadPuzzle])

  return (
    <div className="feature-page a7-page">
      {phase === 'loading' && (
        <Panel>
          <p>題目出題中…</p>
        </Panel>
      )}

      {phase === 'error' && (
        <Panel>
          <h3>🐣 成語填字</h3>
          <p className="error-text">{error}</p>
          <div className="toolbar-row">
            <Button onClick={() => loadPuzzle(level)}>再試一次</Button>
            {onClose && <Button variant="secondary" onClick={onClose}>回到小雞老師</Button>}
          </div>
        </Panel>
      )}

      {phase === 'play' && puzzle && (
        <Panel>
          <div className="a7-topbar">
            <span className="muted">第 {puzzle.level} 關</span>
            <span className="muted">
              完成 {solvedSlotsCount} / {puzzle.slots.length} 個成語
            </span>
          </div>

          {cleared ? (
            <div className="a7-clear-banner">
              <span className="a7-clear-banner__title">🎉 全部拼出來了！第 {puzzle.level} 關過關！</span>
              <span className="a7-clear-banner__hint">慢慢看、點成語複習，準備好再進下一關。</span>
            </div>
          ) : (
            <p className="a7-hint-text">把下面的字填進空格，拼出完整的成語！</p>
          )}

          <CrosswordBoard puzzle={puzzle} state={state} onCellClick={handleCellClick} />

          {!cleared && <CharTray tray={puzzle.tray} state={state} onTileTap={handleTrayTap} />}

          {teaching && (
            <div className="a7-teaching">
              <div className="a7-teaching__head">
                <strong>{teaching.idiom}</strong>
                <button
                  type="button"
                  className="a1-quick-chip"
                  onClick={() =>
                    speak(
                      explainText
                        ? `${teaching.idiom}的意思是，${explainText}`
                        : `${teaching.idiom}。${teaching.example}`,
                      { id: `a7-${teaching.idiom}` },
                    )
                  }
                  aria-label="唸成語"
                >
                  🔊
                </button>
              </div>
              {explainLoading && <p className="a7-teaching__meaning a7-teaching__meaning--loading">解釋出來囉…</p>}
              {!explainLoading && explainText && <p className="a7-teaching__meaning">意思：{explainText}</p>}
              <p className="a7-teaching__example">例句：{teaching.example}</p>
            </div>
          )}

          <div className="toolbar-row">
            {cleared ? (
              <>
                <Button onClick={nextLevel}>下一關 →</Button>
                {onClose && <Button variant="secondary" onClick={onClose}>結束</Button>}
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={handleHint}>💡 提示</Button>
                <Button variant="secondary" onClick={() => state.reset()}>重置本關</Button>
                {onClose && <Button variant="secondary" onClick={onClose}>結束</Button>}
              </>
            )}
          </div>
        </Panel>
      )}

      {phase === 'result' && puzzle && (
        <Panel>
          <h3>過關啦！🎉</h3>
          <p className="score-text">你完成了第 {puzzle.level} 關的 {puzzle.slots.length} 個成語！</p>
          <div className="toolbar-row">
            <Button onClick={nextLevel}>下一關 →</Button>
            {onClose && <Button variant="secondary" onClick={onClose}>回到小雞老師</Button>}
          </div>
        </Panel>
      )}
    </div>
  )
}
