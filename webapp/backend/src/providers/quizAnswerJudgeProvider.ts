const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent'

export type QuizAnswerJudgeRequest = {
  subject: string
  type: 'fill' | 'choice' | 'make_word' | 'read_aloud'
  stem: string
  answer: string
  acceptableAnswers?: string[]
  choices?: string[]
  studentAnswer: string
}

export type QuizAnswerJudgeResponse =
  | { ok: true; correct: boolean; normalizedAnswer: string; feedback: string }
  | { ok: false; error: string; message: string }

const PROMPT = `你是台灣國小老師，正在批改 6-9 歲小朋友的練習題答案。

請只判斷「小朋友答案是否可接受」，不要重新出題。
規則：
- 數學題：重點是數值/單位是否等價。語音辨識可能把「十二」寫成中文數字，也可能多出「答案是」。合理等價就算對。
- 選擇題：若小朋友說的是正確選項的內容、編號或語音近似，也可以算對；若語意對不上才算錯。
- 若答案缺少必要單位但題目明確要求單位，只有在標準答案/可接受答案允許無單位時才算對。
- feedback 給一句短短、適合小孩聽的回饋。

只回 JSON：{"correct": boolean, "normalizedAnswer": string, "feedback": string}`

let keyIndex = 0

export class QuizAnswerJudgeProvider {
  private apiKeys: string[]

  constructor(apiKeys: string[] = []) {
    this.apiKeys = apiKeys
    if (apiKeys.length > 0) {
      console.log(`[QuizAnswerJudge] Gemini enabled with ${apiKeys.length} API key(s)`)
    } else {
      console.log('[QuizAnswerJudge] Gemini disabled (no API keys) — judge unavailable')
    }
  }

  async judge(input: QuizAnswerJudgeRequest): Promise<QuizAnswerJudgeResponse> {
    if (this.apiKeys.length === 0) {
      return { ok: false, error: 'QUIZ_JUDGE_UNAVAILABLE', message: 'AI 判題功能還沒準備好。' }
    }
    if (!input.stem.trim() || !input.answer.trim() || !input.studentAnswer.trim()) {
      return { ok: false, error: 'QUIZ_JUDGE_BAD_INPUT', message: '缺少題目、標準答案或小朋友答案。' }
    }

    const body = JSON.stringify({
      contents: [{ parts: [{ text: `${PROMPT}\n\n題目資料：${JSON.stringify(input)}` }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            correct: { type: 'BOOLEAN' },
            normalizedAnswer: { type: 'STRING' },
            feedback: { type: 'STRING' },
          },
          required: ['correct', 'normalizedAnswer', 'feedback'],
        },
        thinkingConfig: { thinkingBudget: 0 },
      },
    })

    for (let attempt = 0; attempt < this.apiKeys.length; attempt++) {
      const idx = (keyIndex + attempt) % this.apiKeys.length
      const key = this.apiKeys[idx]
      try {
        const res = await fetch(`${GEMINI_URL}?key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5000),
          body,
        })
        if (res.status === 429) {
          console.warn(`[QuizAnswerJudge] key #${idx} rate-limited, trying next`)
          continue
        }
        keyIndex = (idx + 1) % this.apiKeys.length
        if (!res.ok) {
          console.warn(`[QuizAnswerJudge] HTTP ${res.status}`)
          return { ok: false, error: 'QUIZ_JUDGE_UPSTREAM', message: 'AI 判題暫時不可用。' }
        }
        const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
        const out = data.candidates?.[0]?.content?.parts?.[0]?.text
        if (!out) return { ok: false, error: 'QUIZ_JUDGE_EMPTY', message: 'AI 判題暫時不可用。' }
        const parsed = JSON.parse(out) as { correct?: boolean; normalizedAnswer?: string; feedback?: string }
        if (typeof parsed.correct !== 'boolean') {
          return { ok: false, error: 'QUIZ_JUDGE_EMPTY', message: 'AI 判題暫時不可用。' }
        }
        return {
          ok: true,
          correct: parsed.correct,
          normalizedAnswer: parsed.normalizedAnswer?.trim() || input.studentAnswer.trim(),
          feedback: parsed.feedback?.trim() || (parsed.correct ? '答對了！' : '再想想看。'),
        }
      } catch (error) {
        console.warn(`[QuizAnswerJudge] key #${idx} failed:`, error instanceof Error ? error.message : error)
      }
    }

    return { ok: false, error: 'QUIZ_JUDGE_UPSTREAM', message: 'AI 判題暫時不可用。' }
  }
}
