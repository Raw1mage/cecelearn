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

const GEMINI_SENTENCE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent'

/** Generate an example sentence for a word using Gemini */
async function geminiSentence(word: string, apiKeys: string[]): Promise<string> {
  if (apiKeys.length === 0) return ''
  const body = JSON.stringify({
    contents: [{ parts: [{ text: `用「${word}」造一個適合國小學生的短句（15字以內），直接回覆句子，不要加引號。` }] }],
  })
  for (const key of apiKeys) {
    try {
      const res = await fetch(`${GEMINI_SENTENCE_URL}?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(4000),
        body,
      })
      if (res.status === 429) continue
      if (!res.ok) return ''
      const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
      if (text && text.length > 3) {
        return text.endsWith('。') ? text : text + '。'
      }
      return ''
    } catch { continue }
  }
  return ''
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
  private allSentences: string[]
  private apiKeys: string[]

  constructor(apiKeys: string[] = []) {
    this.apiKeys = apiKeys
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
    // Build flat sentence pool for word-level lookups
    this.allSentences = []
    for (const entry of idioms) {
      if (entry.examples) {
        for (const ex of entry.examples) {
          this.allSentences.push(ex)
        }
      }
    }
    console.log(`[VocabQuiz] indexed ${idioms.length} idioms, ${this.allSentences.length} sentences`)
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

  /** Find a sentence from the idiom examples pool that contains the word, or any of its characters */
  private findSentenceContaining(word: string): string | null {
    // First try: exact word match
    let matches = this.allSentences.filter(s => s.includes(word))
    if (matches.length > 0) {
      return matches[Math.floor(Math.random() * matches.length)]
    }
    // Second try: match any character in the word
    for (const char of word.split('')) {
      matches = this.allSentences.filter(s => s.includes(char))
      if (matches.length > 0) {
        return matches[Math.floor(Math.random() * matches.length)]
      }
    }
    return null
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
      // Try local idiom examples that contain this word
      const localSentence = this.findSentenceContaining(word)
      if (localSentence) return { word, sentence: localSentence }
      // Last resort: Gemini
      const aiSentence = await geminiSentence(word, this.apiKeys)
      return { word, sentence: aiSentence || `請寫出「${word}」。` }
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
