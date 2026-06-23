import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  A7Cell,
  A7CrosswordPuzzle,
  A7PuzzleOptions,
  A7PuzzleResponse,
  A7Slot,
  IdiomCrosswordProvider,
} from '../contracts/providers.js'

/* ────────────────────────────────────────────────────────────────────────
 * 成語交叉填字生成器（idiomCrosswordProvider）
 * 對齊 plans/a7_idiom_crossword/design.md 演算法與 taxonomy。
 *
 * 名詞（taxonomy）：
 *  - IdiomEntry：{idiom(4字), examples[]}，idioms.json 一筆。
 *  - charIndex：Map<char, IdiomEntry[]> 反向索引（字→含此字的成語清單）。
 *  - Placement：一條成語放在盤上的 {idiom, dir:'H'|'V', r0, c0}。
 *  - SolutionCell：解答盤一格 {char, owners:placementIdx[]}（owners 長度 2 = 交叉點）。
 *  - Board：{cells: Map<"r,c", SolutionCell>, placements: Placement[]}。
 *  - crossOK：判斷 placement 與既有盤相容（重疊格字相同、不平行黏連）。
 * ──────────────────────────────────────────────────────────────────────── */

type IdiomEntry = {
  idiom: string
  examples: string[]
}

type Dir = 'H' | 'V'

type Placement = {
  idiom: string
  dir: Dir
  r0: number
  c0: number
}

type SolutionCell = {
  char: string
  owners: number[]   // placement index 清單
}

type Board = {
  cells: Map<string, SolutionCell>
  placements: Placement[]
}

const MAX_ATTEMPTS = 200

/** 難度 → 目標成語條數與每條挖空字數範圍。 */
const DIFFICULTY = {
  easy: { minIdioms: 2, maxIdioms: 3, blankMin: 1, blankMax: 1 },
  normal: { minIdioms: 3, maxIdioms: 4, blankMin: 1, blankMax: 2 },
  hard: { minIdioms: 4, maxIdioms: 5, blankMin: 2, blankMax: 2 },
} as const

function key(r: number, c: number): string {
  return `${r},${c}`
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/** 載入 idioms.json，只留剛好四字的成語（盤面以四字為單位，DD-2）。 */
function loadIdiomDb(): IdiomEntry[] {
  try {
    const dir = dirname(fileURLToPath(import.meta.url))
    const path = resolve(dir, '../../data/idioms.json')
    const raw = readFileSync(path, 'utf-8')
    const db = JSON.parse(raw) as IdiomEntry[]
    const fourChar = db.filter(
      (e) => typeof e.idiom === 'string' && [...e.idiom].length === 4 && Array.isArray(e.examples) && e.examples.length > 0,
    )
    console.log(`[A7Crossword] a7.db.load total=${db.length} fourCharCount=${fourChar.length}`)
    return fourChar
  } catch (error) {
    console.warn('[A7Crossword] failed to load idioms.json:', error instanceof Error ? error.message : error)
    return []
  }
}

/** 反向索引：字 → 含此字的成語清單。 */
function buildCharIndex(db: IdiomEntry[]): Map<string, IdiomEntry[]> {
  const index = new Map<string, IdiomEntry[]>()
  for (const entry of db) {
    const seen = new Set<string>()
    for (const ch of entry.idiom) {
      if (seen.has(ch)) continue   // 同成語同字只記一次
      seen.add(ch)
      const list = index.get(ch)
      if (list) list.push(entry)
      else index.set(ch, [entry])
    }
  }
  return index
}

function emptyBoard(): Board {
  return { cells: new Map(), placements: [] }
}

/** 計算 placement 第 i 字（0-based）的座標。 */
function cellAt(p: Placement, i: number): { r: number; c: number } {
  return p.dir === 'H' ? { r: p.r0, c: p.c0 + i } : { r: p.r0 + i, c: p.c0 }
}

/**
 * crossOK：placement 是否能放進既有盤。
 * 規則（design DD-2/R-4）：
 *  - 對 placement 的每一格：若該座標既有 cell，字必須相同（交叉相容）；
 *    且該既有 cell 必須屬於「正交方向」的成語（避免同向重疊/黏連）。
 *  - placement 自身的格不可落在「與自己同向、僅相鄰」造成平行黏連 → 用周邊檢查。
 *  - 至少要有一個重疊格（保證是交叉而非孤立擺放）。
 */
function crossOK(board: Board, p: Placement): boolean {
  const len = [...p.idiom].length
  const chars = [...p.idiom]
  let overlaps = 0

  for (let i = 0; i < len; i++) {
    const { r, c } = cellAt(p, i)
    const existing = board.cells.get(key(r, c))
    if (existing) {
      // 重疊格：字必須相同
      if (existing.char !== chars[i]) return false
      // 既有格的所有 owner 必須是正交方向（不可同向重疊）
      for (const ownerIdx of existing.owners) {
        if (board.placements[ownerIdx].dir === p.dir) return false
      }
      overlaps++
    } else {
      // 空格：檢查正交相鄰是否會與「平行的別條成語」黏連
      // 對 H 擺放，檢查上下相鄰；對 V 擺放，檢查左右相鄰。
      const neighbors =
        p.dir === 'H'
          ? [{ r: r - 1, c }, { r: r + 1, c }]
          : [{ r, c: c - 1 }, { r, c: c + 1 }]
      for (const nb of neighbors) {
        const ncell = board.cells.get(key(nb.r, nb.c))
        if (ncell) {
          // 相鄰有字但此格非交叉 → 平行黏連，拒絕
          return false
        }
      }
      // 同向兩端的延伸格也不可緊貼別的字（避免頭尾接龍黏成長條）
      if (i === 0) {
        const before = p.dir === 'H' ? { r, c: c - 1 } : { r: r - 1, c }
        if (board.cells.get(key(before.r, before.c))) return false
      }
      if (i === len - 1) {
        const after = p.dir === 'H' ? { r, c: c + 1 } : { r: r + 1, c }
        if (board.cells.get(key(after.r, after.c))) return false
      }
    }
  }

  return overlaps >= 1
}

/** 把 placement 落盤（更新 cells + placements）。呼叫前須 crossOK。 */
function place(board: Board, p: Placement): void {
  const idx = board.placements.length
  board.placements.push(p)
  const chars = [...p.idiom]
  for (let i = 0; i < chars.length; i++) {
    const { r, c } = cellAt(p, i)
    const k = key(r, c)
    const existing = board.cells.get(k)
    if (existing) {
      existing.owners.push(idx)
    } else {
      board.cells.set(k, { char: chars[i], owners: [idx] })
    }
  }
}

/**
 * findCrossingCandidate：在既有盤上找一條可正交交叉擺放的成語。
 * 隨機挑既有 cell（字 X，屬某方向 dirA）→ 在 charIndex[X] 找另一成語 idiomB（X 在其位置 k）
 * → 令 idiomB 以正交方向擺放、第 k 字壓在該 cell → crossOK 才回傳。
 */
function findCrossingCandidate(
  board: Board,
  charIndex: Map<string, IdiomEntry[]>,
  usedIdioms: Set<string>,
): Placement | null {
  const cellKeys = shuffle([...board.cells.keys()])
  for (const ck of cellKeys) {
    const cell = board.cells.get(ck)!
    // 此格已是交叉點（owners>=2）就跳過，避免三線共點的複雜度（MVP）
    if (cell.owners.length >= 2) continue
    const ownerDir = board.placements[cell.owners[0]].dir
    const crossDir: Dir = ownerDir === 'H' ? 'V' : 'H'
    const [rStr, cStr] = ck.split(',')
    const r = Number(rStr)
    const c = Number(cStr)

    const candidates = charIndex.get(cell.char)
    if (!candidates) continue
    for (const entry of shuffle([...candidates])) {
      if (usedIdioms.has(entry.idiom)) continue
      const chars = [...entry.idiom]
      // entry 的哪些位置等於該交叉字
      for (let k = 0; k < chars.length; k++) {
        if (chars[k] !== cell.char) continue
        // 令 entry 第 k 字落在 (r,c)
        const p: Placement =
          crossDir === 'H'
            ? { idiom: entry.idiom, dir: 'H', r0: r, c0: c - k }
            : { idiom: entry.idiom, dir: 'V', r0: r - k, c0: c }
        if (crossOK(board, p)) return p
      }
    }
  }
  return null
}

/**
 * toPuzzle：把解答盤轉成對外 Puzzle。
 *  - 交叉點一律 given（DD-3/INV-3）。
 *  - 每條成語的非交叉字隨機挑 blankMin..blankMax 個設 blank。
 *  - tray = 所有 blank 字打散（無誘答，INV-4）。
 *  - 每槽附例句（DD-6），meaning=null（MVP 例句兜底）。
 */
function toPuzzle(
  board: Board,
  db: IdiomEntry[],
  diff: (typeof DIFFICULTY)[keyof typeof DIFFICULTY],
  level: number,
): A7CrosswordPuzzle {
  const exampleOf = new Map(db.map((e) => [e.idiom, e.examples]))

  // 決定每格 given / blank：先全標 given，再對每條成語挑 blank。
  const blankSet = new Set<string>()   // blank cell keys

  for (let pi = 0; pi < board.placements.length; pi++) {
    const p = board.placements[pi]
    const chars = [...p.idiom]
    // 該成語可挖空的位置（非交叉點）
    const nonCross: number[] = []
    for (let i = 0; i < chars.length; i++) {
      const { r, c } = cellAt(p, i)
      const cell = board.cells.get(key(r, c))!
      if (cell.owners.length < 2) nonCross.push(i)
    }
    const blankCount = Math.min(randInt(diff.blankMin, diff.blankMax), nonCross.length)
    const chosen = shuffle([...nonCross]).slice(0, Math.max(1, blankCount))
    for (const i of chosen) {
      const { r, c } = cellAt(p, i)
      blankSet.add(key(r, c))
    }
  }

  // 組對外 cells
  const cells: A7Cell[] = []
  for (const [k, sc] of board.cells.entries()) {
    const [rStr, cStr] = k.split(',')
    const r = Number(rStr)
    const c = Number(cStr)
    const isBlank = blankSet.has(k)
    cells.push({
      r,
      c,
      given: !isBlank,
      char: isBlank ? null : sc.char,
      slotIdxs: [...sc.owners],
    })
  }

  // 組 slots（教學資料）
  const slots: A7Slot[] = board.placements.map((p, idx) => {
    const chars = [...p.idiom]
    const cellsSeq = chars.map((_, i) => cellAt(p, i))
    const exs = exampleOf.get(p.idiom) ?? []
    const example = exs.length > 0 ? exs[Math.floor(Math.random() * exs.length)] : `這是「${p.idiom}」的成語。`
    return {
      idx,
      dir: p.dir,
      cells: cellsSeq,
      idiom: p.idiom,
      example,
      meaning: null,
    }
  })

  // tray = 所有 blank 字打散
  const tray: string[] = []
  for (const k of blankSet) {
    tray.push(board.cells.get(k)!.char)
  }
  shuffle(tray)

  // gridBounds
  let minRow = Infinity
  let maxRow = -Infinity
  let minCol = Infinity
  let maxCol = -Infinity
  for (const cell of cells) {
    if (cell.r < minRow) minRow = cell.r
    if (cell.r > maxRow) maxRow = cell.r
    if (cell.c < minCol) minCol = cell.c
    if (cell.c > maxCol) maxCol = cell.c
  }

  return {
    puzzleId: `xw-${Date.now()}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    level,
    cells,
    slots,
    tray,
    gridBounds: { minRow, maxRow, minCol, maxCol },
  }
}

export class IdiomCrosswordEngine implements IdiomCrosswordProvider {
  private db: IdiomEntry[]
  private charIndex: Map<string, IdiomEntry[]>

  constructor() {
    this.db = loadIdiomDb()
    this.charIndex = buildCharIndex(this.db)
  }

  generate(options: A7PuzzleOptions): A7PuzzleResponse {
    const level = options.level ?? 1
    const difficulty = options.difficulty ?? 'easy'
    const diff = DIFFICULTY[difficulty] ?? DIFFICULTY.easy

    if (this.db.length < 2) {
      console.warn('[A7Crossword] a7.puzzle.fail error=IDIOM_DB_EMPTY')
      return { ok: false, error: 'IDIOM_DB_EMPTY', message: '題目庫還沒準備好喔！' }
    }

    const startedAt = Date.now()
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const board = emptyBoard()
      const usedIdioms = new Set<string>()

      // seed 首條成語（水平，原點）
      const seed = this.db[Math.floor(Math.random() * this.db.length)]
      place(board, { idiom: seed.idiom, dir: 'H', r0: 0, c0: 0 })
      usedIdioms.add(seed.idiom)

      const target = randInt(diff.minIdioms, diff.maxIdioms)
      while (board.placements.length < target) {
        const cand = findCrossingCandidate(board, this.charIndex, usedIdioms)
        if (!cand) break
        place(board, cand)
        usedIdioms.add(cand.idiom)
      }

      // 合法盤：≥2 成語 + ≥1 交叉點
      const hasIntersection = [...board.cells.values()].some((c) => c.owners.length >= 2)
      if (board.placements.length >= 2 && hasIntersection) {
        const puzzle = toPuzzle(board, this.db, diff, level)
        const blankCount = puzzle.cells.filter((c) => !c.given).length
        const intersectionCount = puzzle.cells.filter((c) => c.slotIdxs.length >= 2).length
        console.log(
          `[A7Crossword] a7.puzzle.generate level=${level} difficulty=${difficulty} idiomCount=${puzzle.slots.length} blankCount=${blankCount} intersectionCount=${intersectionCount} attempts=${attempt} durationMs=${Date.now() - startedAt}`,
        )
        return { ok: true, puzzle }
      }
    }

    console.warn(
      `[A7Crossword] a7.puzzle.fail level=${level} difficulty=${difficulty} attempts=${MAX_ATTEMPTS} error=GENERATION_FAILED`,
    )
    return { ok: false, error: 'GENERATION_FAILED', message: '題目正在準備中，再試一次好嗎？' }
  }
}
