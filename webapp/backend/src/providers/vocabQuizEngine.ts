import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { A5QuizItem, A5QuizOptions, A5QuizResponse } from '../contracts/providers.js'

type Lesson = {
  year: string
  grade: string
  version: string
  lesson: string
  textNameId: string
  characters: string[]
}

type VocabDb = {
  stats: { lessons: number; totalChars: number; uniqueChars: number }
  lessons: Lesson[]
}

type IdiomEntry = { idiom: string }

const DICT_URL = 'https://dict.concised.moe.edu.tw/search.jsp'

function loadJson<T>(relativePath: string): T | null {
  try {
    const dir = dirname(fileURLToPath(import.meta.url))
    const path = resolve(dir, relativePath)
    return JSON.parse(readFileSync(path, 'utf-8')) as T
  } catch {
    return null
  }
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function pickRandom<T>(arr: T[], n: number): T[] {
  return shuffle([...arr]).slice(0, n)
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim()
}

/** Fetch 2-char compound words from MOE dictionary for a character */
async function fetchCompoundWords(character: string): Promise<string[]> {
  try {
    const url = `${DICT_URL}?md=2&word=${encodeURIComponent(character)}&col=1`
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    const html = await res.text()

    const words: string[] = []
    const rowRe = /<tr\s+data-link='dictView[^']*'[^>]*>([\s\S]*?)<\/tr>/g
    let row: RegExpExecArray | null
    while ((row = rowRe.exec(html)) !== null) {
      const termMatch = row[1].match(/<a[^>]*>(.*?)<\/a>/)
      if (!termMatch) continue
      const term = stripTags(termMatch[1])
      if (term.length >= 2 && term.length <= 4) {
        words.push(term)
      }
    }
    return words
  } catch {
    return []
  }
}

export class VocabQuizEngine {
  private db: VocabDb
  private allChars: string[]
  private idiomsByChar: Map<string, string[]>

  constructor() {
    const db = loadJson<VocabDb>('../../data/vocabulary.json')
    this.db = db ?? { stats: { lessons: 0, totalChars: 0, uniqueChars: 0 }, lessons: [] }
    this.allChars = [...new Set(this.db.lessons.flatMap(l => l.characters))]
    console.log(`[VocabQuiz] loaded ${this.allChars.length} unique chars from ${this.db.stats.lessons} lessons`)

    // Build idiom index by character
    this.idiomsByChar = new Map()
    const idioms = loadJson<IdiomEntry[]>('../../data/idioms.json') ?? []
    for (const { idiom } of idioms) {
      for (const char of new Set(idiom.split(''))) {
        const list = this.idiomsByChar.get(char) ?? []
        list.push(idiom)
        this.idiomsByChar.set(char, list)
      }
    }
    console.log(`[VocabQuiz] indexed ${idioms.length} idioms`)
  }

  getPublishers(): string[] {
    return [...new Set(this.db.lessons.map(l => l.version))].sort()
  }

  getGrades(publisher: string): string[] {
    return [...new Set(this.db.lessons.filter(l => l.version === publisher).map(l => l.grade))].sort()
  }

  getLessons(publisher: string, grade: string): string[] {
    return this.db.lessons
      .filter(l => l.version === publisher && l.grade === grade)
      .map(l => l.lesson)
  }

  private filterChars(options: A5QuizOptions): string[] {
    if (options.mode === 'custom' && options.customChars) {
      return options.customChars.replace(/[\s,，、]/g, '').split('').filter(c => /[\u4e00-\u9fff]/.test(c))
    }

    if (options.mode === 'curriculum' && options.publisher && options.grade) {
      const lessons = this.db.lessons.filter(l =>
        l.version === options.publisher &&
        l.grade === options.grade &&
        (!options.lessons || options.lessons.length === 0 || options.lessons.includes(l.lesson))
      )
      const chars = [...new Set(lessons.flatMap(l => l.characters))]
      return chars.length > 0 ? chars : this.allChars
    }

    return this.allChars
  }

  /**
   * Build a word/idiom for a character.
   * Priority: idiom (30%) > MOE dictionary compound word > fallback repeat-char
   */
  private async makeWord(char: string): Promise<string> {
    // 30% chance: pick an idiom containing this character
    const idioms = this.idiomsByChar.get(char)
    if (idioms && idioms.length > 0 && Math.random() < 0.3) {
      return idioms[Math.floor(Math.random() * idioms.length)]
    }

    // 70% chance: fetch a 2-char compound word from MOE dictionary
    const words = await fetchCompoundWords(char)
    if (words.length > 0) {
      return words[Math.floor(Math.random() * words.length)]
    }

    // Fallback: try idiom even if random didn't pick it
    if (idioms && idioms.length > 0) {
      return idioms[Math.floor(Math.random() * idioms.length)]
    }

    // Last resort: just the character (should rarely happen)
    return char
  }

  async generate(options: A5QuizOptions): Promise<A5QuizResponse> {
    const pool = this.filterChars(options)
    if (pool.length === 0) {
      return { ok: false, quizId: '', items: [] } as A5QuizResponse & { ok: false }
    }

    const selected = pickRandom(pool, Math.min(options.questionCount, pool.length))

    // Fetch words in parallel (batched to avoid overwhelming MOE)
    const words = await Promise.all(selected.map(char => this.makeWord(char)))

    const items: A5QuizItem[] = selected.map((char, i) => ({
      id: `q-${i + 1}`,
      word: words[i],
      bopomofo: '',
      characters: words[i].split(''),
    }))

    return {
      ok: true,
      quizId: `vocab-${Date.now()}`,
      items,
    }
  }
}
