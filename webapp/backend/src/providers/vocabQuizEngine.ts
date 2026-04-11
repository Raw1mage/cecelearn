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
  private wordCache = new Map<string, string[]>()

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

  /**
   * Extract a known word/idiom containing the target character from a sentence.
   * Priority: known idiom > known compound word (from MOE) > 2-char extraction
   */
  private async extractWordFromSentence(sentence: string, char: string): Promise<string | null> {
    // 1. Check if any known idiom containing this char appears in the sentence
    const idioms = this.idiomsByChar.get(char) ?? []
    for (const idiom of idioms) {
      if (sentence.includes(idiom)) return idiom
    }

    // 2. Fetch compound words from MOE (cached) and check which ones appear in the sentence
    if (!this.wordCache.has(char)) {
      this.wordCache.set(char, await fetchCompoundWords(char))
    }
    const dictWords = this.wordCache.get(char)!
    for (const word of dictWords) {
      if (sentence.includes(word)) return word
    }

    // 3. Last resort: find the nearest 2-char CJK pair containing the char
    const idx = sentence.indexOf(char)
    if (idx >= 0) {
      // Try char + next
      if (idx + 1 < sentence.length && /[\u4e00-\u9fff]/.test(sentence[idx + 1])) {
        return sentence.slice(idx, idx + 2)
      }
      // Try prev + char
      if (idx > 0 && /[\u4e00-\u9fff]/.test(sentence[idx - 1])) {
        return sentence.slice(idx - 1, idx + 1)
      }
    }
    return null
  }

  /**
   * Sentence-first approach:
   * 1. Find a sentence containing the target character
   * 2. Extract the word/phrase from that sentence
   * This guarantees sentence and word are always related.
   */
  private async makeWordWithSentence(char: string): Promise<{ word: string; sentence: string }> {
    // Strategy 1: Find a sentence from 11258 idiom examples that contains this character
    const matchingSentences = this.allSentences.filter(s => s.includes(char))
    if (matchingSentences.length > 0) {
      // Try several sentences to find one with a good extractable word
      const candidates = pickRandom(matchingSentences, Math.min(5, matchingSentences.length))
      for (const sentence of candidates) {
        const word = await this.extractWordFromSentence(sentence, char)
        if (word && word !== char) {
          return { word, sentence }
        }
      }
      // If extraction failed, use the sentence with the char itself as word
      const sentence = candidates[0]
      return { word: char, sentence }
    }

    // Strategy 2: Use idiom with its own example
    const idioms = this.idiomsByChar.get(char)
    if (idioms && idioms.length > 0) {
      const idiom = idioms[Math.floor(Math.random() * idioms.length)]
      const examples = this.idiomExamples.get(idiom)
      if (examples && examples.length > 0) {
        return { word: idiom, sentence: examples[Math.floor(Math.random() * examples.length)] }
      }
      return { word: idiom, sentence: `請寫出「${idiom}」。` }
    }

    // Strategy 3: Fetch a compound word from MOE dictionary + Gemini sentence
    const words = await fetchCompoundWords(char)
    if (words.length > 0) {
      const word = words[Math.floor(Math.random() * words.length)]
      const aiSentence = await geminiSentence(word, this.apiKeys)
      if (aiSentence) return { word, sentence: aiSentence }
      return { word, sentence: `請寫出「${word}」。` }
    }

    return { word: char, sentence: `請寫出「${char}」。` }
  }

  /** Prepare the quiz: return shuffled character pool only (fast, no HTTP) */
  prepare(options: A5QuizOptions): { ok: boolean; quizId: string; chars: string[]; total: number } {
    const pool = this.filterChars(options)
    if (pool.length === 0) {
      return { ok: false, quizId: '', chars: [], total: 0 }
    }
    const count = options.questionCount >= 9999 ? pool.length : Math.min(options.questionCount, pool.length)
    const chars = pickRandom(pool, count)
    return { ok: true, quizId: `vocab-${Date.now()}`, chars, total: chars.length }
  }

  /** Generate a single question for one character (called per-question) */
  async generateOne(char: string, index: number): Promise<A5QuizItem> {
    const result = await this.makeWordWithSentence(char)
    return {
      id: `q-${index + 1}`,
      word: result.word,
      bopomofo: '',
      characters: result.word.split(''),
      sentence: result.sentence,
    }
  }
}
