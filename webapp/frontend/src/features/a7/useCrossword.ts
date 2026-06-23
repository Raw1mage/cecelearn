import { useCallback, useMemo, useState } from 'react'
import type { A7CrosswordPuzzle, A7Slot } from '../../shared/api/client'

/**
 * useCrossword —— 成語交叉填字的填字狀態 hook。
 *
 * Taxonomy：
 *  - fillState: Map<"r,c", string>  小朋友目前填在各 blank 格的字（given 格不入此 map）。
 *  - lockedCells: Set<"r,c">        提示揭示並鎖定的格（不可再清除/覆寫）。
 *  - solvedSlots: Set<number>       已正確完成的 slot idx。
 *  - trayUsed: boolean[]            tray 各字塊是否已被用（index 對齊 puzzle.tray）。
 *  - selectedTrayIdx: number|null   目前選中的 tray 字塊（待點空格填入）。
 *  - selectedCell: "r,c"|null       目前選中的空格（發光，待點字塊填入）。與 selectedTrayIdx 互斥。
 *
 * 雙向互動（DD-8，免切換模式）：兩種填字順序同時成立。
 *  - 先選字再選格：tapTray 設 selectedTrayIdx → tapCell 直接填入。
 *  - 先選格再選字：tapCell 設 selectedCell（發光）→ tapTray 直接填入。
 *  - 任一邊已有 pending 選取時，點另一邊即時填入並清掉兩邊選取。
 *  - 不變式 INV-CELL：selectedTrayIdx 與 selectedCell 不會同時非 null（互斥）。
 *
 * 規則：
 *  - 校驗以 slot 為單位：該 slot 所有 cell（given + 已填）拼字 == idiom 才標 solved（DD-5）。
 *  - 提示 hint()：挑一個「尚未正確填入」的 blank，填正解並鎖定（DD-7）。
 *  - reset()：清空所有非鎖定的填字、還原 tray、清 solved（同一關卡）。
 */

function key(r: number, c: number): string {
  return `${r},${c}`
}

export type CrosswordState = {
  fillState: Map<string, string>
  lockedCells: Set<string>
  solvedSlots: Set<number>
  trayUsed: boolean[]
  selectedTrayIdx: number | null
  selectedCell: string | null
  allSolved: boolean
  /** 取某格目前顯示字：given→正解；blank→已填字或 null。 */
  charAt: (r: number, c: number) => string | null
  /** 某 slot 是否已正確完成。 */
  isSlotSolved: (idx: number) => boolean
  selectTray: (idx: number | null) => void
  /** 點某 blank 格：若有選中 tray 字則填入；該格已有字則先退回再填。回傳剛完成的 slot（供教學揭曉）。 */
  placeAt: (r: number, c: number) => A7Slot | null
  /** 雙向互動入口——點某 blank 格：若已選字塊則填入；否則切換該格發光選取（待選字）。回傳剛完成的 slot。 */
  tapCell: (r: number, c: number) => A7Slot | null
  /** 雙向互動入口——點某 tray 字塊：若已選格則填入；否則切換字塊選取（待選格）。回傳剛完成的 slot。 */
  tapTray: (idx: number) => A7Slot | null
  /** 清除某 blank 格（退回 tray）。鎖定格不可清。 */
  clearAt: (r: number, c: number) => void
  /** 免費提示：揭一個未填對的 blank 並鎖定。回傳剛完成的 slot（若提示讓某 slot 完成）。 */
  hint: () => A7Slot | null
  /** 重置本關（清非鎖定填字、還原 tray、清 solved）。 */
  reset: () => void
}

export function useCrossword(puzzle: A7CrosswordPuzzle | null): CrosswordState {
  const [fillState, setFillState] = useState<Map<string, string>>(new Map())
  const [lockedCells, setLockedCells] = useState<Set<string>>(new Set())
  const [solvedSlots, setSolvedSlots] = useState<Set<number>>(new Set())
  const [trayUsed, setTrayUsed] = useState<boolean[]>([])
  const [selectedTrayIdx, setSelectedTrayIdx] = useState<number | null>(null)
  const [selectedCell, setSelectedCell] = useState<string | null>(null)

  // 索引：given cell 的正解字 + blank cell 的正解字（由 slot.idiom 推回）。
  const { givenChar, solutionChar, blankKeys } = useMemo(() => {
    const given = new Map<string, string>()
    const solution = new Map<string, string>()
    const blanks = new Set<string>()
    if (puzzle) {
      for (const cell of puzzle.cells) {
        if (cell.given && cell.char) {
          given.set(key(cell.r, cell.c), cell.char)
          solution.set(key(cell.r, cell.c), cell.char)
        } else {
          blanks.add(key(cell.r, cell.c))
        }
      }
      // 用每條 slot 的 idiom 補齊 blank 的正解字
      for (const slot of puzzle.slots) {
        const chars = [...slot.idiom]
        slot.cells.forEach((cc, i) => {
          if (chars[i]) solution.set(key(cc.r, cc.c), chars[i])
        })
      }
    }
    return { givenChar: given, solutionChar: solution, blankKeys: blanks }
  }, [puzzle])

  const charAt = useCallback(
    (r: number, c: number): string | null => {
      const k = key(r, c)
      if (givenChar.has(k)) return givenChar.get(k)!
      return fillState.get(k) ?? null
    },
    [givenChar, fillState],
  )

  /** 用一個給定的 fill map 算某 slot 是否拼成 idiom。 */
  const slotSolvedWith = useCallback(
    (slot: A7Slot, fill: Map<string, string>): boolean => {
      const chars = [...slot.idiom]
      for (let i = 0; i < slot.cells.length; i++) {
        const cc = slot.cells[i]
        const k = key(cc.r, cc.c)
        const ch = givenChar.get(k) ?? fill.get(k)
        if (ch !== chars[i]) return false
      }
      return true
    },
    [givenChar],
  )

  /** 重算所有 slot 的 solved 集合（依新 fill map）。回傳新增完成的 slot（取第一個供教學）。 */
  const recomputeSolved = useCallback(
    (fill: Map<string, string>): A7Slot | null => {
      if (!puzzle) return null
      const next = new Set<number>()
      let newlySolved: A7Slot | null = null
      for (const slot of puzzle.slots) {
        if (slotSolvedWith(slot, fill)) {
          next.add(slot.idx)
          if (!solvedSlots.has(slot.idx) && !newlySolved) newlySolved = slot
        }
      }
      setSolvedSlots(next)
      return newlySolved
    },
    [puzzle, slotSolvedWith, solvedSlots],
  )

  const selectTray = useCallback((idx: number | null) => {
    setSelectedTrayIdx(idx)
    setSelectedCell(null)
  }, [])

  /** 共用填字核心：把 tray[trayIdx] 填到 (r,c)。前置檢查由呼叫端確保。回傳新完成的 slot。 */
  const fillCellWithTray = useCallback(
    (r: number, c: number, trayIdx: number): A7Slot | null => {
      if (!puzzle) return null
      const k = key(r, c)
      const ch = puzzle.tray[trayIdx]
      const nextFill = new Map(fillState)
      const nextUsed = [...trayUsed]

      // 該格已有字 → 先退回原字到 tray
      const prev = nextFill.get(k)
      if (prev !== undefined) {
        const freeIdx = nextUsed.findIndex((u, i) => u && puzzle.tray[i] === prev)
        if (freeIdx >= 0) nextUsed[freeIdx] = false
      }

      nextFill.set(k, ch)
      nextUsed[trayIdx] = true

      setFillState(nextFill)
      setTrayUsed(nextUsed)
      setSelectedTrayIdx(null)
      setSelectedCell(null)
      return recomputeSolved(nextFill)
    },
    [puzzle, trayUsed, fillState, recomputeSolved],
  )

  /** 格是否可填（blank、未鎖定）。 */
  const cellFillable = useCallback(
    (r: number, c: number): boolean => {
      const k = key(r, c)
      return blankKeys.has(k) && !lockedCells.has(k)
    },
    [blankKeys, lockedCells],
  )

  const placeAt = useCallback(
    (r: number, c: number): A7Slot | null => {
      if (!cellFillable(r, c)) return null
      if (selectedTrayIdx === null) return null
      if (trayUsed[selectedTrayIdx]) return null
      return fillCellWithTray(r, c, selectedTrayIdx)
    },
    [cellFillable, selectedTrayIdx, trayUsed, fillCellWithTray],
  )

  /** 雙向互動——點空格：已選字塊→填入；否則切換該格發光選取。 */
  const tapCell = useCallback(
    (r: number, c: number): A7Slot | null => {
      if (!cellFillable(r, c)) return null
      const k = key(r, c)
      // 已選字塊 → 直接填入
      if (selectedTrayIdx !== null && !trayUsed[selectedTrayIdx]) {
        return fillCellWithTray(r, c, selectedTrayIdx)
      }
      // 否則切換該格的發光選取（再點同格 = 取消）
      setSelectedCell((prev) => (prev === k ? null : k))
      setSelectedTrayIdx(null)
      return null
    },
    [cellFillable, selectedTrayIdx, trayUsed, fillCellWithTray],
  )

  /** 雙向互動——點字塊：已選格→填入；否則切換字塊選取。 */
  const tapTray = useCallback(
    (idx: number): A7Slot | null => {
      if (!puzzle) return null
      if (trayUsed[idx]) return null
      // 已選格 → 直接填入
      if (selectedCell !== null) {
        const [sr, sc] = selectedCell.split(',').map(Number)
        if (cellFillable(sr, sc)) return fillCellWithTray(sr, sc, idx)
      }
      // 否則切換字塊選取（再點同塊 = 取消）
      setSelectedTrayIdx((prev) => (prev === idx ? null : idx))
      setSelectedCell(null)
      return null
    },
    [puzzle, trayUsed, selectedCell, cellFillable, fillCellWithTray],
  )

  const clearAt = useCallback(
    (r: number, c: number) => {
      if (!puzzle) return
      const k = key(r, c)
      if (lockedCells.has(k)) return
      const prev = fillState.get(k)
      if (prev === undefined) return
      const nextFill = new Map(fillState)
      nextFill.delete(k)
      const nextUsed = [...trayUsed]
      const freeIdx = nextUsed.findIndex((u, i) => u && puzzle.tray[i] === prev)
      if (freeIdx >= 0) nextUsed[freeIdx] = false
      setFillState(nextFill)
      setTrayUsed(nextUsed)
      recomputeSolved(nextFill)
    },
    [puzzle, lockedCells, fillState, trayUsed, recomputeSolved],
  )

  const hint = useCallback((): A7Slot | null => {
    if (!puzzle) return null
    // 找一個「尚未正確填入」的 blank（含已填錯）
    let targetKey: string | null = null
    for (const bk of blankKeys) {
      if (lockedCells.has(bk)) continue
      const want = solutionChar.get(bk)
      if (want === undefined) continue
      const cur = fillState.get(bk)
      if (cur !== want) {
        targetKey = bk
        break
      }
    }
    if (!targetKey) return null

    const want = solutionChar.get(targetKey)!
    const nextFill = new Map(fillState)
    const nextUsed = [...trayUsed]

    // 退回該格原有錯字
    const prev = nextFill.get(targetKey)
    if (prev !== undefined) {
      const usedIdx = nextUsed.findIndex((u, i) => u && puzzle.tray[i] === prev)
      if (usedIdx >= 0) nextUsed[usedIdx] = false
    }
    // 從 tray 消耗一個 want 字（標記已用）
    const wantIdx = nextUsed.findIndex((u, i) => !u && puzzle.tray[i] === want)
    if (wantIdx >= 0) nextUsed[wantIdx] = true

    nextFill.set(targetKey, want)
    const nextLocked = new Set(lockedCells)
    nextLocked.add(targetKey)

    setFillState(nextFill)
    setTrayUsed(nextUsed)
    setLockedCells(nextLocked)
    setSelectedTrayIdx(null)
    setSelectedCell(null)
    return recomputeSolved(nextFill)
  }, [puzzle, blankKeys, lockedCells, solutionChar, fillState, trayUsed, recomputeSolved])

  const reset = useCallback(() => {
    if (!puzzle) return
    setFillState(new Map())
    setLockedCells(new Set())
    setSolvedSlots(new Set())
    setTrayUsed(puzzle.tray.map(() => false))
    setSelectedTrayIdx(null)
    setSelectedCell(null)
  }, [puzzle])

  const isSlotSolved = useCallback((idx: number) => solvedSlots.has(idx), [solvedSlots])

  const allSolved = useMemo(
    () => puzzle != null && puzzle.slots.length > 0 && solvedSlots.size === puzzle.slots.length,
    [puzzle, solvedSlots],
  )

  return {
    fillState,
    lockedCells,
    solvedSlots,
    trayUsed,
    selectedTrayIdx,
    selectedCell,
    allSolved,
    charAt,
    isSlotSolved,
    selectTray,
    placeAt,
    tapCell,
    tapTray,
    clearAt,
    hint,
    reset,
  }
}
