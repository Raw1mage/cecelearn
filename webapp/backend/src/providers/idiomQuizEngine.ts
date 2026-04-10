import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { A2QuizItem, A2QuizResponse, IdiomQuizProvider } from '../contracts/providers.js'

type IdiomEntry = {
  idiom: string
  examples: string[]
}

/** Load the scraped idiom database */
function loadIdiomDb(): IdiomEntry[] {
  try {
    const dir = dirname(fileURLToPath(import.meta.url))
    const path = resolve(dir, '../../data/idioms.json')
    const raw = readFileSync(path, 'utf-8')
    const db = JSON.parse(raw) as IdiomEntry[]
    console.log(`[IdiomQuiz] loaded ${db.length} idioms, ${db.reduce((s, e) => s + e.examples.length, 0)} examples`)
    return db
  } catch (error) {
    console.warn('[IdiomQuiz] failed to load idioms.json:', error instanceof Error ? error.message : error)
    return []
  }
}

/** Shuffle array in-place (Fisher-Yates) */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** Pick n random items from array without replacement */
function pickRandom<T>(arr: T[], n: number): T[] {
  return shuffle([...arr]).slice(0, n)
}

/**
 * Generate a fill-in-blank question from an idiom + example sentence.
 * The idiom is masked in the sentence, and 4 options are provided.
 */
function makeQuestion(
  entry: IdiomEntry,
  distractors: string[],
  id: string,
): A2QuizItem | null {
  // Pick a random example sentence
  const example = entry.examples[Math.floor(Math.random() * entry.examples.length)]
  if (!example) return null

  // Mask the idiom in the sentence
  const idiom = entry.idiom
  const masked = example.replace(idiom, '＿＿＿＿')
  if (masked === example) return null // idiom not found in example

  // Build options: correct + 3 distractors
  const options = shuffle([idiom, ...pickRandom(distractors, 3)])
  const correctAnswer = options.indexOf(idiom)

  return {
    id,
    prompt: masked,
    options,
    correctAnswer,
    explanation: `正確答案是「${idiom}」。原句：${example}`,
  }
}

export class IdiomQuizEngine implements IdiomQuizProvider {
  private db: IdiomEntry[]

  constructor() {
    this.db = loadIdiomDb()
  }

  /**
   * Generate quiz from the full database (random mode).
   */
  generateRandom(questionCount: number): A2QuizResponse {
    if (this.db.length < 4) {
      return { ok: false, quizId: '', items: [] } as A2QuizResponse & { ok: false }
    }

    const selected = pickRandom(this.db, Math.min(questionCount, this.db.length))
    const allIdioms = this.db.map(e => e.idiom)
    const items: A2QuizItem[] = []

    for (const entry of selected) {
      const distractors = allIdioms.filter(i => i !== entry.idiom)
      const q = makeQuestion(entry, distractors, `q-${items.length + 1}`)
      if (q) items.push(q)
    }

    return {
      ok: true,
      quizId: `random-${Date.now()}`,
      items,
    }
  }

  /**
   * Generate quiz from a custom idiom list (parent-selected mode).
   * Idioms not in the database get simple "which is correct" questions.
   */
  generate(idioms: string[], questionCount: number): A2QuizResponse {
    // If no custom list provided, use random mode
    if (idioms.length === 0) {
      return this.generateRandom(questionCount)
    }

    const allIdioms = this.db.length > 0
      ? this.db.map(e => e.idiom)
      : idioms

    // Match custom idioms against database for example sentences
    const matched: IdiomEntry[] = []
    const unmatched: string[] = []

    for (const idiom of idioms) {
      const found = this.db.find(e => e.idiom === idiom)
      if (found) {
        matched.push(found)
      } else {
        unmatched.push(idiom)
      }
    }

    const items: A2QuizItem[] = []
    const toUse = shuffle([...matched]).slice(0, questionCount)

    // Generate fill-in-blank from matched entries
    for (const entry of toUse) {
      const distractors = allIdioms.filter(i => i !== entry.idiom)
      const q = makeQuestion(entry, distractors, `q-${items.length + 1}`)
      if (q) items.push(q)
    }

    // If not enough questions from matched, add simple questions from unmatched
    const remaining = questionCount - items.length
    if (remaining > 0 && unmatched.length > 0) {
      const extras = shuffle([...unmatched]).slice(0, remaining)
      for (const idiom of extras) {
        const distractors = allIdioms.filter(i => i !== idiom)
        const options = shuffle([idiom, ...pickRandom(distractors, 3)])
        items.push({
          id: `q-${items.length + 1}`,
          prompt: `請選出正確的成語：「${idiom.slice(0, 2)}＿＿」`,
          options,
          correctAnswer: options.indexOf(idiom),
          explanation: `正確答案是「${idiom}」。`,
        })
      }
    }

    return {
      ok: true,
      quizId: `custom-${Date.now()}`,
      items: items.slice(0, questionCount),
    }
  }
}
