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

type IdiomEntry = { idiom: string; examples?: string[] }

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

/** Fetch a definition/example sentence for a word from MOE dictionary */
async function fetchSentence(word: string): Promise<string> {
  try {
    const url = `https://dict.concised.moe.edu.tw/search.jsp?md=1&word=${encodeURIComponent(word)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    const html = await res.text()
    // Look for example sentences in ［例］ patterns
    const exMatch = html.match(/\[例\](.*?)(?:\n|<|。)/s)
    if (exMatch) {
      const sentence = stripTags(exMatch[1]).trim()
      if (sentence.length > 3) return sentence.endsWith('。') ? sentence : sentence + '。'
    }
    // Fallback: extract first definition line
    const defMatch = html.match(/<td[^>]*>([^<]*[\u4e00-\u9fff][^<]{5,})/s)
    if (defMatch) {
      const def = stripTags(defMatch[1]).trim().split('。')[0]
      if (def.length > 4) return def + '。'
    }
    return ''
  } catch {
    return ''
  }
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
  private idiomExamples: Map<string, string[]>

  constructor() {
    const db = loadJson<VocabDb>('../../data/vocabulary.json')
    this.db = db ?? { stats: { lessons: 0, totalChars: 0, uniqueChars: 0 }, lessons: [] }
    this.allChars = [...new Set(this.db.lessons.flatMap(l => l.characters))]
    console.log(`[VocabQuiz] loaded ${this.allChars.length} unique chars from ${this.db.stats.lessons} lessons`)

    // Build idiom index by character (with examples)
    this.idiomsByChar = new Map()
    this.idiomExamples = new Map()
    const idioms = loadJson<IdiomEntry[]>('../../data/idioms.json') ?? []
    for (const entry of idioms) {
      for (const char of new Set(entry.idiom.split(''))) {
        const list = this.idiomsByChar.get(char) ?? []
        list.push(entry.idiom)
        this.idiomsByChar.set(char, list)
      }
      if (entry.examples && entry.examples.length > 0) {
        this.idiomExamples.set(entry.idiom, entry.examples)
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

  getSemesters(publisher: string, grade: string): string[] {
    const years = this.db.lessons
      .filter(l => l.version === publisher && l.grade === grade)
      .map(l => l.year)
    return [...new Set(years)].sort().reverse()
  }

  getLessons(publisher: string, grade: string, semester?: string): string[] {
    return this.db.lessons
      .filter(l => l.version === publisher && l.grade === grade && (!semester || l.year === semester))
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
        (!options.semester || l.year.includes(options.semester)) &&
        (!options.lessons || options.lessons.length === 0 || options.lessons.includes(l.lesson))
      )
      const chars = [...new Set(lessons.flatMap(l => l.characters))]
      return chars.length > 0 ? chars : this.allChars
    }

    return this.allChars
  }

  /**
   * Build a word/idiom + example sentence for a character.
   */
  private async makeWordWithSentence(char: string): Promise<{ word: string; sentence: string }> {
    // 30% chance: pick an idiom containing this character
    const idioms = this.idiomsByChar.get(char)
    if (idioms && idioms.length > 0 && Math.random() < 0.3) {
      const idiom = idioms[Math.floor(Math.random() * idioms.length)]
      const examples = this.idiomExamples.get(idiom)
      const sentence = examples && examples.length > 0
        ? examples[Math.floor(Math.random() * examples.length)]
        : `請寫出「${idiom}」。`
      return { word: idiom, sentence }
    }

    // 70% chance: fetch a 2-char compound word from MOE dictionary
    const words = await fetchCompoundWords(char)
    if (words.length > 0) {
      const word = words[Math.floor(Math.random() * words.length)]
      // Try to get an example sentence for this word
      const sentence = await fetchSentence(word)
      return { word, sentence: sentence || `請寫出「${word}」。` }
    }

    // Fallback: try idiom
    if (idioms && idioms.length > 0) {
      const idiom = idioms[Math.floor(Math.random() * idioms.length)]
      const examples = this.idiomExamples.get(idiom)
      const sentence = examples && examples.length > 0
        ? examples[Math.floor(Math.random() * examples.length)]
        : `請寫出「${idiom}」。`
      return { word: idiom, sentence }
    }

    return { word: char, sentence: `請寫出「${char}」。` }
  }

  async generate(options: A5QuizOptions): Promise<A5QuizResponse> {
    const pool = this.filterChars(options)
    if (pool.length === 0) {
      return { ok: false, quizId: '', items: [] } as A5QuizResponse & { ok: false }
    }

    const selected = pickRandom(pool, Math.min(options.questionCount, pool.length))

    // Fetch words + sentences in parallel
    const results = await Promise.all(selected.map(char => this.makeWordWithSentence(char)))

    const items: A5QuizItem[] = results.map((r, i) => ({
      id: `q-${i + 1}`,
      word: r.word,
      bopomofo: '',
      characters: r.word.split(''),
      sentence: r.sentence,
    }))

    return {
      ok: true,
      quizId: `vocab-${Date.now()}`,
      items,
    }
  }
}
