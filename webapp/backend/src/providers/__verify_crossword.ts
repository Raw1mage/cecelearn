/**
 * A7 交叉填字生成器驗證腳本（一次性）。
 * 跑 N 次生成，斷言 INV-1..4 + 可解性 oracle，並量測失敗率。
 * 執行：bun run src/providers/__verify_crossword.ts
 */
import { IdiomCrosswordEngine } from './idiomCrosswordProvider.js'

const N = 300
const engine = new IdiomCrosswordEngine()

let ok = 0
let fail = 0
const blankCounts: number[] = []
const intersectionCounts: number[] = []
const slotCounts: number[] = []
const violations: string[] = []

for (let i = 0; i < N; i++) {
  const res = engine.generate({ level: i + 1, difficulty: 'normal' })
  if (!res.ok) {
    fail++
    continue
  }
  ok++
  const p = res.puzzle

  // 索引 cells by "r,c"
  const cellMap = new Map<string, (typeof p.cells)[number]>()
  for (const c of p.cells) cellMap.set(`${c.r},${c.c}`, c)

  // INV-4: tray 字數 == blank 數
  const blanks = p.cells.filter((c) => !c.given)
  if (p.tray.length !== blanks.length) {
    violations.push(`#${i} INV-4 fail: tray=${p.tray.length} blanks=${blanks.length}`)
  }
  blankCounts.push(blanks.length)
  slotCounts.push(p.slots.length)

  // INV-2/INV-3: 交叉點一致 + given；用 solution（把 blank 填回）建可解 oracle
  // 解答字：given cell 直接用 char；blank cell 的解答字必須能從 slot 推回
  const solutionChar = new Map<string, string>()
  for (const c of p.cells) {
    if (c.given && c.char) solutionChar.set(`${c.r},${c.c}`, c.char)
  }

  // 用每條 slot 的 idiom 把該 slot 各格的正解字補齊（blank 也補上）
  for (const slot of p.slots) {
    const chars = [...slot.idiom]
    if (slot.cells.length !== chars.length) {
      violations.push(`#${i} slot ${slot.idx} length mismatch: cells=${slot.cells.length} idiom=${chars.length}`)
      continue
    }
    for (let k = 0; k < chars.length; k++) {
      const ck = `${slot.cells[k].r},${slot.cells[k].c}`
      const existing = solutionChar.get(ck)
      if (existing !== undefined && existing !== chars[k]) {
        // INV-2 違反：兩條成語在同格要求不同字
        violations.push(`#${i} INV-2 fail at ${ck}: ${existing} vs ${chars[k]} (slot ${slot.idx} ${slot.idiom})`)
      }
      solutionChar.set(ck, chars[k])
    }
  }

  // INV-3: 交叉點（slotIdxs>=2）必為 given
  let inter = 0
  for (const c of p.cells) {
    if (c.slotIdxs.length >= 2) {
      inter++
      if (!c.given) violations.push(`#${i} INV-3 fail: intersection ${c.r},${c.c} not given`)
    }
  }
  intersectionCounts.push(inter)

  // INV-1: 每個 blank 的正解字必在 tray 中（多重集合包含）
  const trayPool = [...p.tray]
  for (const b of blanks) {
    const want = solutionChar.get(`${b.r},${b.c}`)
    if (want === undefined) {
      violations.push(`#${i} INV-1 fail: blank ${b.r},${b.c} has no solution char`)
      continue
    }
    const idx = trayPool.indexOf(want)
    if (idx === -1) {
      violations.push(`#${i} INV-1 fail: blank ${b.r},${b.c} char '${want}' not in tray`)
    } else {
      trayPool.splice(idx, 1)
    }
  }

  // 可解性 oracle：把 blank 填回後每條 slot 拼字 == idiom
  for (const slot of p.slots) {
    const built = slot.cells.map((cc) => solutionChar.get(`${cc.r},${cc.c}`) ?? '?').join('')
    if (built !== slot.idiom) {
      violations.push(`#${i} ORACLE fail: slot ${slot.idx} built='${built}' idiom='${slot.idiom}'`)
    }
  }
}

const avg = (a: number[]) => (a.length ? (a.reduce((s, x) => s + x, 0) / a.length).toFixed(2) : '0')
console.log('\n===== A7 Crossword Verification =====')
console.log(`runs=${N} ok=${ok} fail=${fail} failRate=${((fail / N) * 100).toFixed(1)}%`)
console.log(`avg slots=${avg(slotCounts)} avg blanks=${avg(blankCounts)} avg intersections=${avg(intersectionCounts)}`)
console.log(`violations=${violations.length}`)
if (violations.length > 0) {
  console.log('--- first 20 violations ---')
  for (const v of violations.slice(0, 20)) console.log('  ' + v)
  process.exit(1)
}
console.log('ALL INVARIANTS PASS ✓')
