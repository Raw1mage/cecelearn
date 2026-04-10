export type Operation = '+' | '-' | '*' | '/'

/**
 * A single row in the vertical layout.
 * - kind: what this row represents
 * - digits: array of single characters, right-aligned (index 0 = rightmost)
 * - label: optional prefix symbol shown left of digits (e.g. '+', '-')
 * - lineAbove: draw a horizontal line above this row
 * - note: optional explanation text for this step
 */
export type VRow = {
  kind: 'operand' | 'operator-line' | 'partial' | 'carry' | 'answer' | 'remainder'
  digits: string[]
  label?: string
  lineAbove?: boolean
  note?: string
}

export type VerticalResult = {
  rows: VRow[]
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

export function buildVertical(a: number, b: number, op: Operation): VerticalResult {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return { rows: [], answer: '-', error: '請先輸入兩個有效數字。' }
  }

  switch (op) {
    case '+': return buildAddition(a, b)
    case '-': return buildSubtraction(a, b)
    case '*': return buildMultiplication(a, b)
    case '/': return buildDivision(a, b)
  }
}

function buildAddition(a: number, b: number): VerticalResult {
  const sum = a + b
  const aDigits = toDigits(a)
  const bDigits = toDigits(b)
  const sDigits = toDigits(sum)
  const width = Math.max(aDigits.length, bDigits.length, sDigits.length)

  const aP = padLeft(aDigits, width)
  const bP = padLeft(bDigits, width)
  const sP = padLeft(sDigits, width)

  // Compute carries
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
  // If carry overflows leftmost
  if (carry > 0 && sDigits.length > width) {
    // answer is wider, pad carries
    carries.unshift(String(carry))
    aP.unshift('')
    bP.unshift('')
  }

  const rows: VRow[] = []

  const hasCarries = carries.some(c => c !== '')
  if (hasCarries) {
    rows.push({ kind: 'carry', digits: padLeft(carries, sP.length), note: '進位' })
  }
  rows.push({ kind: 'operand', digits: padLeft(aP, sP.length), note: `被加數 ${a}` })
  rows.push({ kind: 'operator-line', digits: padLeft(bP, sP.length), label: '+', note: `加數 ${b}` })
  rows.push({ kind: 'answer', digits: sP, lineAbove: true, note: `和 = ${sum}` })

  return { rows, answer: String(sum) }
}

function buildSubtraction(a: number, b: number): VerticalResult {
  if (a < b) {
    return { rows: [], answer: '錯誤', error: '目前版本只支援被減數大於或等於減數。' }
  }
  const diff = a - b
  const aDigits = toDigits(a)
  const bDigits = toDigits(b)
  const dDigits = toDigits(diff)
  const width = Math.max(aDigits.length, bDigits.length, dDigits.length)

  const aP = padLeft(aDigits, width)
  const bP = padLeft(bDigits, width)
  const dP = padLeft(dDigits, width)

  // Compute borrows
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
  if (hasBorrows) {
    rows.push({ kind: 'carry', digits: borrows, note: '借位' })
  }
  rows.push({ kind: 'operand', digits: aP, note: `被減數 ${a}` })
  rows.push({ kind: 'operator-line', digits: bP, label: '-', note: `減數 ${b}` })
  rows.push({ kind: 'answer', digits: dP, lineAbove: true, note: `差 = ${diff}` })

  return { rows, answer: String(diff) }
}

function buildMultiplication(a: number, b: number): VerticalResult {
  const product = a * b
  const aDigits = toDigits(a)
  const bDigits = toDigits(b)
  const pDigits = toDigits(product)

  const rows: VRow[] = []
  rows.push({ kind: 'operand', digits: aDigits, note: `被乘數 ${a}` })
  rows.push({ kind: 'operator-line', digits: bDigits, label: '×', note: `乘數 ${b}` })

  // Partial products (one per digit of b, right to left)
  const partials: number[] = []
  for (let i = bDigits.length - 1; i >= 0; i--) {
    const digit = Number(bDigits[i])
    const partial = a * digit
    const shift = bDigits.length - 1 - i
    partials.push(partial * Math.pow(10, shift))

    const partialDigits = toDigits(partial)
    // Add trailing zeros for shifted position
    const shifted = partialDigits.concat(Array(shift).fill('0'))
    rows.push({
      kind: 'partial',
      digits: shifted,
      lineAbove: i === bDigits.length - 1,
      note: `${a} × ${digit}${shift > 0 ? `（左移 ${shift} 位）` : ''}`,
    })
  }

  // If only one partial, answer is already shown; if multiple, show sum
  if (partials.length > 1) {
    rows.push({ kind: 'answer', digits: pDigits, lineAbove: true, note: `積 = ${product}` })
  } else {
    // Mark the single partial as the answer
    rows[rows.length - 1].kind = 'answer'
    rows[rows.length - 1].note = `積 = ${product}`
  }

  return { rows, answer: String(product) }
}

function buildDivision(a: number, b: number): VerticalResult {
  if (b === 0) {
    return { rows: [], answer: '錯誤', error: '除數不能是 0。' }
  }

  const quotient = Math.floor(a / b)
  const remainder = a % b
  const aDigits = toDigits(a)
  const qDigits = toDigits(quotient)

  const rows: VRow[] = []

  // Division layout: quotient on top, then divisor ) dividend, then long division steps
  rows.push({ kind: 'answer', digits: qDigits, note: `商 = ${quotient}` })
  rows.push({ kind: 'operator-line', digits: aDigits, label: `${b}⟌`, lineAbove: true, note: `${b} 除 ${a}` })

  // Long division steps
  let current = 0
  for (let i = 0; i < aDigits.length; i++) {
    current = current * 10 + Number(aDigits[i])
    const q = Math.floor(current / b)
    const sub = q * b
    if (sub > 0 || i === aDigits.length - 1) {
      const subDigits = toDigits(sub)
      const indent = i + 1 - subDigits.length
      const padded = Array(Math.max(0, indent)).fill('').concat(subDigits)
      rows.push({ kind: 'partial', digits: padded, note: `${b} × ${q} = ${sub}` })
      current = current - sub
      if (current > 0 || i < aDigits.length - 1) {
        const remDigits = current === 0 ? ['0'] : toDigits(current)
        const remIndent = i + 1 - remDigits.length + 1
        const remPadded = Array(Math.max(0, remIndent)).fill('').concat(remDigits)
        rows.push({ kind: 'partial', digits: remPadded, lineAbove: true, note: `餘 ${current}，拉下一位` })
      }
    }
  }

  if (remainder > 0) {
    rows.push({ kind: 'remainder', digits: toDigits(remainder), note: `餘數 = ${remainder}` })
  }

  const answerStr = remainder === 0 ? String(quotient) : `${quotient} 餘 ${remainder}`
  return { rows, answer: answerStr }
}
