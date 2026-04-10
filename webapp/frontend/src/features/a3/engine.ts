export type Operation = '+' | '-' | '*' | '/'

export type VRow = {
  kind: 'operand' | 'operator-line' | 'partial' | 'carry' | 'answer' | 'remainder'
  digits: string[]
  label?: string
  lineAbove?: boolean
  lineBelow?: boolean
}

export type AnimCell = { row: number; col: number }
export type AnimStep = {
  cells: AnimCell[]
  note: string
  highlight?: AnimCell[]
  /** Dynamic carry display — array of digits aligned to operand columns. null = clear all. */
  carryDisplay?: string[] | null
  /** Temporarily override a cell's displayed value. null = clear all overrides. */
  overrides?: Record<string, string> | null
  /** Column index of carry digit being pulled down (triggers drop animation). */
  carryPull?: number
  /** Target row index for carry pull animation (to calculate distance). */
  carryPullRow?: number
}

export type VerticalResult = {
  rows: VRow[]
  steps: AnimStep[]
  answer: string
  error?: string
}

function toDigits(n: number | string): string[] {
  return String(n).split('')
}

function padLeft(digits: string[], width: number): string[] {
  const pad = width - digits.length
  return pad > 0 ? Array(pad).fill('').concat(digits) : digits
}

function cellKey(row: number, col: number) {
  return `${row}-${col}`
}

/** Push two setup steps: first reveal operand A, then operand B (with operator + line) */
function pushSetupSteps(steps: AnimStep[], rows: VRow[], operandRowIdx: number, operatorRowIdx: number, a: number, b: number, opSymbol: string) {
  const aCells: AnimCell[] = []
  const bCells: AnimCell[] = []
  for (let c = 0; c < rows[operandRowIdx].digits.length; c++) {
    if (rows[operandRowIdx].digits[c] !== '') aCells.push({ row: operandRowIdx, col: c })
  }
  for (let c = 0; c < rows[operatorRowIdx].digits.length; c++) {
    if (rows[operatorRowIdx].digits[c] !== '') bCells.push({ row: operatorRowIdx, col: c })
  }
  steps.push({ cells: aCells, note: `第一個數：${a}` })
  steps.push({ cells: bCells, note: `${opSymbol} ${b}` })
}

const PLACE_NAMES = ['個', '十', '百', '千', '萬', '十萬', '百萬']
function placeName(col: number, width: number): string {
  const place = width - 1 - col
  return place < PLACE_NAMES.length ? PLACE_NAMES[place] + '位' : `第${place + 1}位`
}

export function buildVertical(a: number, b: number, op: Operation): VerticalResult {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return { rows: [], steps: [], answer: '-', error: '請先輸入兩個有效數字。' }
  }

  switch (op) {
    case '+': return buildAddition(a, b)
    case '-': return buildSubtraction(a, b)
    case '*': return buildMultiplication(a, b)
    case '/': return buildDivision(a, b)
  }
}

/* ------------------------------------------------------------------ */
/*  Addition                                                          */
/* ------------------------------------------------------------------ */
function buildAddition(a: number, b: number): VerticalResult {
  const sum = a + b
  const aDigits = toDigits(a)
  const bDigits = toDigits(b)
  const sDigits = toDigits(sum)
  const width = Math.max(aDigits.length, bDigits.length, sDigits.length)

  const aP = padLeft(aDigits, width)
  const bP = padLeft(bDigits, width)
  const sP = padLeft(sDigits, width)

  // Compute carries per column
  const carries: string[] = Array(width).fill('')
  let carry = 0
  for (let i = width - 1; i >= 0; i--) {
    const da = Number(aP[i]) || 0
    const db = Number(bP[i]) || 0
    const total = da + db + carry
    if (total >= 10 && i > 0) {
      carries[i - 1] = String(Math.floor(total / 10))
    }
    carry = Math.floor(total / 10)
  }

  if (carry > 0 && sDigits.length > width) {
    carries.unshift(String(carry))
    aP.unshift('')
    bP.unshift('')
  }

  const finalWidth = sP.length
  const rows: VRow[] = []

  const hasCarries = carries.some(c => c !== '')
  const carryRowIdx = hasCarries ? 0 : -1
  if (hasCarries) {
    rows.push({ kind: 'carry', digits: padLeft(carries, finalWidth) })
  }
  const operandRowIdx = rows.length
  rows.push({ kind: 'operand', digits: padLeft(aP, finalWidth) })
  const operatorRowIdx = rows.length
  rows.push({ kind: 'operator-line', digits: padLeft(bP, finalWidth), label: '+', lineBelow: true })
  const answerRowIdx = rows.length
  rows.push({ kind: 'answer', digits: sP })

  const steps: AnimStep[] = []
  pushSetupSteps(steps, rows, operandRowIdx, operatorRowIdx, a, b, '+')

  // Per-column, right to left — sequential highlight
  for (let c = finalWidth - 1; c >= 0; c--) {
    const da = Number(rows[operandRowIdx].digits[c]) || 0
    const db = Number(rows[operatorRowIdx].digits[c]) || 0
    const aHas = rows[operandRowIdx].digits[c] !== ''
    const bHas = rows[operatorRowIdx].digits[c] !== ''
    const ansDigit = sP[c]
    const pn = placeName(c, finalWidth)
    const hasCarryIn = carryRowIdx >= 0 && rows[carryRowIdx].digits[c] !== ''
    const carryIn = hasCarryIn ? Number(rows[carryRowIdx].digits[c]) : 0

    if (!aHas && !bHas) {
      // Pure carry overflow column
      steps.push({
        cells: [{ row: answerRowIdx, col: c }],
        note: `${pn}：進位 ${ansDigit}`,
      })
      continue
    }

    // Step 1: highlight first number's digit
    if (aHas) {
      steps.push({
        cells: [],
        highlight: [{ row: operandRowIdx, col: c }],
        note: `${pn}：看第一個數 ${da}`,
      })
    }

    // Step 2: highlight both digits
    const bothHL: AnimCell[] = []
    if (aHas) bothHL.push({ row: operandRowIdx, col: c })
    if (bHas) bothHL.push({ row: operatorRowIdx, col: c })
    steps.push({
      cells: [],
      highlight: bothHL,
      note: `${pn}：${da} + ${db}`,
    })

    // Step 2.5: if carry into this column, highlight it too
    if (hasCarryIn) {
      steps.push({
        cells: [],
        highlight: [...bothHL, { row: carryRowIdx, col: c }],
        note: `${pn}：${da} + ${db} + ${carryIn}（進位）`,
      })
    }

    // Step 3: reveal result (and carry produced if any)
    const revealCells: AnimCell[] = [{ row: answerRowIdx, col: c }]
    if (hasCarryIn) revealCells.push({ row: carryRowIdx, col: c })
    const rawSum = da + db + carryIn
    const allHL = [...bothHL, { row: answerRowIdx, col: c }]
    if (hasCarryIn) allHL.push({ row: carryRowIdx, col: c })

    if (rawSum >= 10) {
      // Also reveal the carry digit for the next column
      if (carryRowIdx >= 0 && c > 0 && rows[carryRowIdx].digits[c - 1] !== '') {
        revealCells.push({ row: carryRowIdx, col: c - 1 })
      }
      const parts = hasCarryIn ? `${da} + ${db} + ${carryIn}` : `${da} + ${db}`
      steps.push({
        cells: revealCells,
        highlight: allHL,
        note: `${pn}：${parts} = ${rawSum}，寫 ${Number(ansDigit)} 進 ${Math.floor(rawSum / 10)}`,
      })
    } else {
      const parts = hasCarryIn ? `${da} + ${db} + ${carryIn}` : `${da} + ${db}`
      steps.push({
        cells: revealCells,
        highlight: allHL,
        note: `${pn}：${parts} = ${ansDigit}`,
      })
    }
  }

  return { rows, steps, answer: String(sum) }
}

/* ------------------------------------------------------------------ */
/*  Subtraction                                                       */
/* ------------------------------------------------------------------ */
function buildSubtraction(a: number, b: number): VerticalResult {
  if (a < b) {
    return { rows: [], steps: [], answer: '錯誤', error: '目前版本只支援被減數大於或等於減數。' }
  }
  const diff = a - b
  const aDigits = toDigits(a)
  const bDigits = toDigits(b)
  const dDigits = toDigits(diff)
  const width = Math.max(aDigits.length, bDigits.length, dDigits.length)

  const aP = padLeft(aDigits, width)
  const bP = padLeft(bDigits, width)
  const dP = padLeft(dDigits, width)

  const borrows: string[] = Array(width).fill('')
  const aCopy = aP.map(d => Number(d) || 0)
  for (let i = width - 1; i >= 0; i--) {
    const db = Number(bP[i]) || 0
    if (aCopy[i] < db && i > 0) {
      borrows[i] = '借'
      aCopy[i] += 10
      aCopy[i - 1] -= 1
    }
  }

  const rows: VRow[] = []
  const hasBorrows = borrows.some(b => b !== '')
  const borrowRowIdx = hasBorrows ? 0 : -1
  if (hasBorrows) {
    rows.push({ kind: 'carry', digits: borrows })
  }
  const operandRowIdx = rows.length
  rows.push({ kind: 'operand', digits: aP })
  const operatorRowIdx = rows.length
  rows.push({ kind: 'operator-line', digits: bP, label: '-', lineBelow: true })
  const answerRowIdx = rows.length
  rows.push({ kind: 'answer', digits: dP })

  const steps: AnimStep[] = []
  pushSetupSteps(steps, rows, operandRowIdx, operatorRowIdx, a, b, '-')

  const aCopyForNotes = aP.map(d => Number(d) || 0)
  for (let c = width - 1; c >= 0; c--) {
    const da = aCopyForNotes[c]
    const db = Number(bP[c]) || 0
    const result = dP[c]
    const pn = placeName(c, width)

    // Step 1: highlight first number
    steps.push({
      cells: [],
      highlight: [{ row: operandRowIdx, col: c }],
      note: `${pn}：看被減數 ${da}`,
    })

    // Step 2: highlight both
    const bothHL: AnimCell[] = [{ row: operandRowIdx, col: c }]
    if (bP[c] !== '') bothHL.push({ row: operatorRowIdx, col: c })
    steps.push({
      cells: [],
      highlight: bothHL,
      note: `${pn}：${da} - ${db}`,
    })

    // Step 3: reveal result
    const revealCells: AnimCell[] = [{ row: answerRowIdx, col: c }]
    if (da < db && c > 0) {
      if (borrowRowIdx >= 0) {
        revealCells.push({ row: borrowRowIdx, col: c })
      }
      const borrowed = da + 10
      steps.push({
        cells: revealCells,
        highlight: [...bothHL, { row: answerRowIdx, col: c }],
        note: `${pn}：${da} 不夠減 ${db}，向前借位 → ${borrowed} - ${db} = ${result}`,
      })
      aCopyForNotes[c] += 10
      aCopyForNotes[c - 1] -= 1
    } else {
      steps.push({
        cells: revealCells,
        highlight: [...bothHL, { row: answerRowIdx, col: c }],
        note: `${pn}：${da} - ${db} = ${result}`,
      })
    }
  }

  return { rows, steps, answer: String(diff) }
}

/* ------------------------------------------------------------------ */
/*  Multiplication — digit-by-digit, carry shown in notes             */
/* ------------------------------------------------------------------ */
function buildMultiplication(a: number, b: number): VerticalResult {
  const product = a * b
  const aDigits = toDigits(a)
  const bDigits = toDigits(b)
  const pDigits = toDigits(product)

  const rows: VRow[] = []
  const operandRowIdx = 0
  rows.push({ kind: 'operand', digits: aDigits })
  const operatorRowIdx = 1
  rows.push({ kind: 'operator-line', digits: bDigits, label: '×', lineBelow: true })

  const steps: AnimStep[] = []
  pushSetupSteps(steps, rows, operandRowIdx, operatorRowIdx, a, b, '×')

  // Partial products — computed digit by digit
  for (let i = bDigits.length - 1; i >= 0; i--) {
    const bDigit = Number(bDigits[i])
    const shift = bDigits.length - 1 - i
    const bCell: AnimCell = { row: operatorRowIdx, col: i }

    // Compute partial product digit-by-digit
    const partialResultDigits: number[] = []
    let mulCarry = 0
    for (let j = aDigits.length - 1; j >= 0; j--) {
      const aD = Number(aDigits[j])
      const prod = aD * bDigit + mulCarry
      partialResultDigits.unshift(prod % 10)
      mulCarry = Math.floor(prod / 10)
    }
    if (mulCarry > 0) partialResultDigits.unshift(mulCarry)

    // Trailing shifted positions are blank (not '0')
    const partialDigitsStr = partialResultDigits.map(String).concat(Array(shift).fill(''))

    const rowIdx = rows.length
    rows.push({
      kind: 'partial',
      digits: partialDigitsStr,
      lineAbove: false,
    })

    // Carry display indexed by OUTPUT column position
    // resultCol for A-digit j = j + (partialResultDigits.length - aDigits.length)
    // carry from resultCol goes to resultCol - 1
    const carryWidth = partialDigitsStr.length
    const carryState = Array(carryWidth).fill('')

    function setCarry(col: number, val: string) {
      if (col >= 0 && col < carryState.length) carryState[col] = val
    }
    function clearCarry(col: number) {
      if (col >= 0 && col < carryState.length) carryState[col] = ''
    }

    // Step: highlight B digit first, clear previous carries
    steps.push({
      cells: [],
      highlight: [bCell],
      carryDisplay: [...carryState],
      note: `看乘數的${placeName(i, bDigits.length)}：${bDigit}`,
    })

    // Digit-by-digit, right to left through A
    let digitCarry = 0
    for (let j = aDigits.length - 1; j >= 0; j--) {
      const aD = Number(aDigits[j])
      const aCell: AnimCell = { row: operandRowIdx, col: j }
      const rawProduct = aD * bDigit
      const withCarry = rawProduct + digitCarry
      const finalDigit = withCarry % 10
      const newCarry = Math.floor(withCarry / 10)
      const rawDigit = rawProduct % 10
      const rawNextCarry = Math.floor(rawProduct / 10)
      const resultCol = j + (partialResultDigits.length - aDigits.length)
      const carryCol = resultCol - 1  // carry goes one column to the left
      const cellId = cellKey(rowIdx, resultCol)

      // Step A: highlight both source digits
      steps.push({
        cells: [],
        highlight: [bCell, aCell],
        note: `${bDigit} × ${aD}`,
      })

      const revealCells: AnimCell[] = [{ row: rowIdx, col: resultCol }]
      const allHL: AnimCell[] = [bCell, aCell, { row: rowIdx, col: resultCol }]

      if (digitCarry > 0) {
        // === Two-phase: show raw result, then pull carry down ===

        // Phase 1: show raw product with override (temporary digit)
        if (rawNextCarry > 0) setCarry(carryCol, String(rawNextCarry))
        steps.push({
          cells: revealCells,
          highlight: allHL,
          overrides: { [cellId]: String(rawDigit) },
          carryDisplay: [...carryState],
          note: rawNextCarry > 0
            ? `${bDigit} × ${aD} = ${rawProduct}，寫 ${rawDigit} 進 ${rawNextCarry}`
            : `${bDigit} × ${aD} = ${rawProduct}，寫 ${rawDigit}`,
        })

        // Phase 2a: pull animation — carry flies down, override stays (raw digit visible)
        const pullDisplay = [...carryState] // carry still present for animation
        const pullNote = `拉下進位 ${digitCarry}`
        steps.push({
          cells: [],
          highlight: allHL,
          carryDisplay: pullDisplay,
          carryPull: resultCol,
          carryPullRow: rowIdx,
          note: pullNote,
        })

        // Phase 2b: merge — carry lands, override cleared (digit updates to final)
        clearCarry(resultCol) // consumed
        if (newCarry > 0) setCarry(carryCol, String(newCarry))
        else if (rawNextCarry === 0) clearCarry(carryCol)
        const mergeNote = newCarry > 0
          ? `${rawProduct} + ${digitCarry} = ${withCarry}，寫 ${finalDigit} 進 ${newCarry}`
          : `${rawProduct} + ${digitCarry} = ${withCarry}，寫 ${finalDigit}`
        steps.push({
          cells: [],
          highlight: allHL,
          overrides: null,
          carryDisplay: [...carryState],
          note: mergeNote,
        })
      } else {
        // === Single phase: no incoming carry, just show result ===
        if (newCarry > 0) setCarry(carryCol, String(newCarry))
        const note = newCarry > 0
          ? `${bDigit} × ${aD} = ${rawProduct}，寫 ${finalDigit} 進 ${newCarry}`
          : `${bDigit} × ${aD} = ${rawProduct}，寫 ${finalDigit}`
        steps.push({
          cells: revealCells,
          highlight: allHL,
          carryDisplay: [...carryState],
          note,
        })
      }

      digitCarry = newCarry
    }

    // Final carry overflow digit
    if (digitCarry > 0 && partialResultDigits.length > aDigits.length) {
      steps.push({
        cells: [{ row: rowIdx, col: 0 }],
        highlight: [{ row: rowIdx, col: 0 }],
        carryDisplay: null,
        overrides: null,
        note: `最高位進位 ${digitCarry}`,
      })
    }
  }

  // Clear carry/overrides after all partials (but don't destroy pull animation on last step)
  const lastStep = steps[steps.length - 1]
  if (lastStep.carryPull === undefined) {
    steps[steps.length - 1] = { ...lastStep, carryDisplay: null, overrides: null }
  } else {
    // Last step has a pull animation — add a cleanup step after it
    steps.push({ cells: [], note: '', carryDisplay: null, overrides: null })
  }

  // Final answer — add partial products with sequential highlight
  if (bDigits.length > 1) {
    const answerRowIdx = rows.length
    rows.push({ kind: 'answer', digits: pDigits, lineAbove: true })

    // Collect all partial product row indices
    const partialRowIndices: number[] = []
    for (let r = 0; r < rows.length; r++) {
      if (rows[r].kind === 'partial') partialRowIndices.push(r)
    }

    // For each column right to left, highlight each partial product digit then reveal answer
    for (let c = pDigits.length - 1; c >= 0; c--) {
      const pn = placeName(c, pDigits.length)

      // Sequentially highlight each partial product's digit at this column
      const colHighlights: AnimCell[] = []
      for (const pr of partialRowIndices) {
        if (c < rows[pr].digits.length && rows[pr].digits[c] !== '') {
          colHighlights.push({ row: pr, col: c })
          steps.push({
            cells: [],
            highlight: [...colHighlights],
            note: `${pn}：看 ${rows[pr].digits[c]}`,
          })
        }
      }

      // Reveal answer digit
      steps.push({
        cells: [{ row: answerRowIdx, col: c }],
        highlight: [...colHighlights, { row: answerRowIdx, col: c }],
        note: `${pn}：相加 = ${pDigits[c]}`,
      })
    }
  } else {
    rows[rows.length - 1].kind = 'answer'
  }

  return { rows, steps, answer: String(product) }
}

/* ------------------------------------------------------------------ */
/*  Division — all rows padded to dividend width for proper alignment  */
/* ------------------------------------------------------------------ */
function buildDivision(a: number, b: number): VerticalResult {
  if (b === 0) {
    return { rows: [], steps: [], answer: '錯誤', error: '除數不能是 0。' }
  }

  const quotient = Math.floor(a / b)
  const remainder = a % b
  const aDigits = toDigits(a)
  const W = aDigits.length // fixed width for all rows

  // Pre-compute quotient digit positions
  // Each quotient digit aligns above the last dividend digit of its group
  const qPositions: { digit: string; col: number }[] = []
  let tmpCurrent = 0
  let qStarted = false
  for (let i = 0; i < aDigits.length; i++) {
    tmpCurrent = tmpCurrent * 10 + Number(aDigits[i])
    const q = Math.floor(tmpCurrent / b)
    const sub = q * b
    if (q > 0 || qStarted || i === aDigits.length - 1) {
      qPositions.push({ digit: String(q), col: i })
      tmpCurrent = tmpCurrent - sub
      qStarted = true
    }
  }

  // Build quotient row padded to W
  const qRow = Array(W).fill('')
  for (const qp of qPositions) qRow[qp.col] = qp.digit

  const rows: VRow[] = []
  const steps: AnimStep[] = []

  // Row 0: quotient (top)
  const qRowIdx = 0
  rows.push({ kind: 'answer', digits: qRow })

  // Row 1: dividend — uses 'operator-line' with label for divisor
  // The CSS division bracket is drawn via .vrow--division
  const divRowIdx = 1
  rows.push({ kind: 'operator-line', digits: aDigits, label: String(b) })

  // Setup: show dividend
  const divCells: AnimCell[] = []
  aDigits.forEach((_, c) => divCells.push({ row: divRowIdx, col: c }))
  steps.push({ cells: divCells, note: `${b} 除 ${a}` })

  /** Pad digits array to width W, content ending at endCol */
  function padToWidth(digits: string[], endCol: number): string[] {
    const row = Array(W).fill('')
    const startCol = endCol + 1 - digits.length
    for (let d = 0; d < digits.length; d++) {
      const col = startCol + d
      if (col >= 0 && col < W) row[col] = digits[d]
    }
    return row
  }

  let current = 0
  let qPosIdx = 0
  let divStarted = false
  let workStart = 0 // start column of current working number
  let workingRow = divRowIdx // which row holds the current working number
  for (let i = 0; i < aDigits.length; i++) {
    current = current * 10 + Number(aDigits[i])
    const q = Math.floor(current / b)
    const sub = q * b
    const shouldProcess = q > 0 || divStarted || i === aDigits.length - 1

    if (!shouldProcess) continue
    if (!divStarted) workStart = i - (toDigits(current).length - 1)
    divStarted = true

    // Highlight ALL digits of the working number in the CORRECT row
    const divHL: AnimCell[] = []
    for (let c = Math.max(0, workStart); c <= i; c++) {
      divHL.push({ row: workingRow, col: c })
    }

    // Step: highlight current working digits
    steps.push({ cells: [], highlight: divHL, note: `看被除數：${current}` })
    steps.push({ cells: [], highlight: divHL, note: `${current} ÷ ${b} = ${q}` })

    // Reveal quotient digit
    if (qPosIdx < qPositions.length) {
      const qCol = qPositions[qPosIdx].col
      steps.push({
        cells: [{ row: qRowIdx, col: qCol }],
        highlight: [...divHL, { row: qRowIdx, col: qCol }],
        note: q === 0 ? `不夠除，商寫 0` : `商寫 ${q}`,
      })
      qPosIdx++
    }

    if (sub > 0) {
      // Subtraction row — reveal all digits at once
      const subDigits = toDigits(sub)
      const subPadded = padToWidth(subDigits, i)
      const subRowIdx = rows.length
      rows.push({ kind: 'partial', digits: subPadded })

      const subCells: AnimCell[] = []
      for (let d = 0; d < W; d++) {
        if (subPadded[d] !== '') subCells.push({ row: subRowIdx, col: d })
      }
      steps.push({
        cells: subCells,
        highlight: [...subCells, ...divHL],
        note: `${b} × ${q} = ${sub}，減掉 ${sub}`,
      })

      current = current - sub

      // Remainder row — always show (even 0 on last digit, to complete the process)
      {
        const remDigits = current === 0 ? ['0'] : toDigits(current)
        const remPadded = padToWidth(remDigits, i)

        const hasNext = i < aDigits.length - 1
        if (hasNext) {
          remPadded[i + 1] = aDigits[i + 1]
        }

        const remRowIdx = rows.length
        rows.push({ kind: 'partial', digits: remPadded, lineAbove: true })

        // Step: draw line first (reveal empty col 0 to trigger lineAbove)
        steps.push({
          cells: [{ row: remRowIdx, col: 0 }],
          note: '',
        })

        // Step: reveal remainder digits
        for (let d = W - 1; d >= 0; d--) {
          if (d === i + 1 && hasNext) continue
          if (remPadded[d] !== '') {
            steps.push({
              cells: [{ row: remRowIdx, col: d }],
              highlight: [{ row: remRowIdx, col: d }],
              note: current === 0 ? '整除，餘 0' : `相減得 ${current}`,
            })
          }
        }

        // Pull down next digit with animation marker
        if (hasNext) {
          steps.push({
            cells: [{ row: remRowIdx, col: i + 1 }],
            highlight: [{ row: divRowIdx, col: i + 1 }, { row: remRowIdx, col: i + 1 }],
            note: `拉下一位 ${aDigits[i + 1]} → ${current}${aDigits[i + 1]}`,
            carryPull: i + 1,
            carryPullRow: remRowIdx,
          })
        }
        // Next working number lives in this remainder row
        const remLen = current === 0 ? 1 : toDigits(current).length
        workStart = i + 1 - remLen
        workingRow = remRowIdx
      }
    } else if (i < aDigits.length - 1) {
      // q=0, nothing to subtract — create a "remainder" row with current + next digit
      const remDigits = toDigits(current)
      const remPadded = padToWidth(remDigits, i)
      remPadded[i + 1] = aDigits[i + 1]
      const remRowIdx = rows.length
      rows.push({ kind: 'partial', digits: remPadded })

      steps.push({ cells: [], note: `${current} 不夠除，繼續往下` })

      // Reveal current digits
      for (let d = W - 1; d >= 0; d--) {
        if (d === i + 1) continue
        if (remPadded[d] !== '') {
          steps.push({
            cells: [{ row: remRowIdx, col: d }],
            highlight: [{ row: remRowIdx, col: d }],
            note: `保留 ${current}`,
          })
        }
      }

      // Pull down next digit
      steps.push({
        cells: [{ row: remRowIdx, col: i + 1 }],
        highlight: [{ row: divRowIdx, col: i + 1 }, { row: remRowIdx, col: i + 1 }],
        note: `拉下一位 ${aDigits[i + 1]} → ${current}${aDigits[i + 1]}`,
      })
      workingRow = remRowIdx
    } else {
      // Last digit, q=0, nothing to subtract
      steps.push({ cells: [], note: `${current} 不夠除` })
    }
  }

  if (remainder > 0) {
    steps.push({ cells: [], note: `餘數 = ${remainder}` })
  }


  const answerStr = remainder === 0 ? String(quotient) : `${quotient} 餘 ${remainder}`
  return { rows, steps, answer: answerStr }
}
