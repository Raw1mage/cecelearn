export type Operation = '+' | '-' | '*' | '/'

export type StepResult = {
  steps: string[]
  answer: string
}

export function buildOperationSteps(a: number, b: number, op: Operation): StepResult {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return { steps: ['請先輸入兩個有效數字。'], answer: '-' }
  }

  switch (op) {
    case '+': {
      const answer = a + b
      return {
        answer: String(answer),
        steps: [
          `把 ${a} 和 ${b} 依位數對齊。`,
          `從個位數開始相加，逐位累加。`,
          `${a} + ${b} = ${answer}`,
        ],
      }
    }
    case '-': {
      if (a < b) {
        return { steps: ['目前版本只支援被減數大於或等於減數。'], answer: '錯誤' }
      }
      const answer = a - b
      return {
        answer: String(answer),
        steps: [
          `把 ${a} 和 ${b} 依位數對齊。`,
          '從個位數開始相減，必要時向前借位。',
          `${a} - ${b} = ${answer}`,
        ],
      }
    }
    case '*': {
      const answer = a * b
      return {
        answer: String(answer),
        steps: [
          `把 ${a} 乘上 ${b}。`,
          '逐位相乘，再把部分積相加。',
          `${a} × ${b} = ${answer}`,
        ],
      }
    }
    case '/': {
      if (b === 0) {
        return { steps: ['除數不能是 0。'], answer: '錯誤' }
      }
      const quotient = Math.floor(a / b)
      const remainder = a % b
      return {
        answer: remainder === 0 ? String(quotient) : `${quotient} ... ${remainder}`,
        steps: [
          `用 ${b} 去除 ${a}。`,
          '從最高位開始，逐步找出每一位商數。',
          remainder === 0 ? `${a} ÷ ${b} = ${quotient}` : `${a} ÷ ${b} = ${quotient} 餘 ${remainder}`,
        ],
      }
    }
  }
}
