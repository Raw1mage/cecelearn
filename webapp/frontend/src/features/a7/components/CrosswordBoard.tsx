import type { A7CrosswordPuzzle } from '../../../shared/api/client'
import type { CrosswordState } from '../useCrossword'

/**
 * CrosswordBoard —— 用 CSS grid 渲染交叉盤。
 * given 格直接顯示字；blank 格顯示已填字或空框（可點）；交叉點與已完成槽有視覺標記。
 */

type Props = {
  puzzle: A7CrosswordPuzzle
  state: CrosswordState
  onCellClick: (r: number, c: number) => void
}

function key(r: number, c: number): string {
  return `${r},${c}`
}

export function CrosswordBoard({ puzzle, state, onCellClick }: Props) {
  const { minRow, maxRow, minCol, maxCol } = puzzle.gridBounds
  const rows = maxRow - minRow + 1
  const cols = maxCol - minCol + 1

  // 哪些格屬於已完成的 slot（用於高亮）
  const solvedCellKeys = new Set<string>()
  for (const slot of puzzle.slots) {
    if (state.isSlotSolved(slot.idx)) {
      for (const cc of slot.cells) solvedCellKeys.add(key(cc.r, cc.c))
    }
  }

  // 盤面格座標集合（稀疏：只有 puzzle.cells 列出的座標是真格）
  const cellMap = new Map(puzzle.cells.map((cell) => [key(cell.r, cell.c), cell]))

  const grid: React.ReactNode[] = []
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const k = key(r, c)
      const cell = cellMap.get(k)
      const gridCol = c - minCol + 1
      const gridRow = r - minRow + 1
      if (!cell) {
        // 無格（盤面以外）：留白
        grid.push(<div key={k} className="a7-cell a7-cell--empty" style={{ gridColumn: gridCol, gridRow }} />)
        continue
      }
      const ch = state.charAt(r, c)
      const isBlank = !cell.given
      const isIntersection = cell.slotIdxs.length >= 2
      const isLocked = state.lockedCells.has(k)
      const isSolved = solvedCellKeys.has(k)
      const isSelected = state.selectedCell === k
      const classNames = [
        'a7-cell',
        isBlank ? 'a7-cell--blank' : 'a7-cell--given',
        isIntersection ? 'a7-cell--cross' : '',
        isSolved ? 'a7-cell--solved' : '',
        isLocked ? 'a7-cell--locked' : '',
        isBlank && !ch ? 'a7-cell--open' : '',
        isSelected ? 'a7-cell--selected' : '',
      ]
        .filter(Boolean)
        .join(' ')
      grid.push(
        <button
          key={k}
          type="button"
          className={classNames}
          style={{ gridColumn: gridCol, gridRow }}
          disabled={!isBlank || isLocked}
          onClick={() => onCellClick(r, c)}
          aria-label={isBlank ? (ch ? `已填 ${ch}` : '空格') : `提示字 ${ch}`}
        >
          {ch ?? ''}
        </button>,
      )
    }
  }

  return (
    <div
      className="a7-board"
      style={{
        gridTemplateColumns: `repeat(${cols}, var(--a7-cell-size))`,
        gridTemplateRows: `repeat(${rows}, var(--a7-cell-size))`,
      }}
    >
      {grid}
    </div>
  )
}
