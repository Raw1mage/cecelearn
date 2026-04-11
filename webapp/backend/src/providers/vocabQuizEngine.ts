import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { A5QuizItem, A5QuizOptions, A5QuizResponse } from '../contracts/providers.js'
import { fetchWords as moeFetchWords, fetchIdioms as moeFetchIdioms } from './moeProvider.js'

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

type MoeTerms = { idioms: string[]; words: string[] }

/** Fetch validated words + idioms from MOE dictionaries (cached) */
async function fetchMoeTerms(char: string, cache: Map<string, MoeTerms>): Promise<MoeTerms> {
  if (cache.has(char)) return cache.get(char)!
  try {
    const [dictResult, moeIdioms] = await Promise.all([
      moeFetchWords(char, 10),
      moeFetchIdioms(char, 10),
    ])
    const result: MoeTerms = {
      idioms: moeIdioms.map(i => i.term),
      words: dictResult.words.map(w => w.term),
    }
    cache.set(char, result)
    return result
  } catch {
    const empty: MoeTerms = { idioms: [], words: [] }
    cache.set(char, empty)
    return empty
  }
}

export class VocabQuizEngine {
  private db: VocabDb
  private allChars: string[]
  private idiomsByChar: Map<string, string[]>
  private idiomExamples: Map<string, string[]>
  private allSentences: string[]
  private apiKeys: string[]
  private wordCache = new Map<string, MoeTerms>()

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
   * Word selection pipeline — all terms must be MOE-dictionary-validated.
   *
   * 1. Fetch validated words + idioms from MOE (reuses A1 module)
   * 2. Also include local idiom DB entries
   * 3. For each term, try to find an example sentence in our library
   * 4. No example found → ask Gemini to generate a sentence
   * 5. No terms at all → single character + Gemini sentence
   */
  private async makeWordWithSentence(char: string, wordType: 'word' | 'idiom' | 'mixed' = 'mixed'): Promise<{ word: string; sentence: string }> {
    // 1. Gather validated terms — separate idioms from compound words
    const moe = await fetchMoeTerms(char, this.wordCache)
    const localIdioms = this.idiomsByChar.get(char) ?? []
    const idioms = [...new Set([...localIdioms, ...moe.idioms])]
    const words = [...moe.words]  // compound words from MOE dictionary (2~3 chars)

    // 2. Order by user preference
    let ordered: string[]
    if (wordType === 'word') {
      ordered = [...words, ...idioms]
    } else {
      ordered = [...idioms, ...words]
    }
    // Deduplicate
    const seen = new Set<string>()
    const allTerms: string[] = []
    for (const t of ordered) {
      if (!seen.has(t)) { seen.add(t); allTerms.push(t) }
    }

    // 3. Try to find a term with an example sentence
    for (const term of allTerms) {
      // Direct idiom examples from our DB (guaranteed match)
      const examples = this.idiomExamples.get(term)
      if (examples && examples.length > 0) {
        console.log(`[A5出題] ${char} → ${term}（成語例句）`)
        return { word: term, sentence: examples[Math.floor(Math.random() * examples.length)] }
      }
      // Search all sentences — with word boundary check for short terms
      const matching = this.allSentences.filter(s => {
        const idx = s.indexOf(term)
        if (idx < 0) return false
        if (term.length >= 4) return true  // idiom-length: safe
        // Short term: check surrounding chars aren't CJK (prevent "豔照" in "光豔照人")
        const before = idx > 0 ? s[idx - 1] : ''
        const after = idx + term.length < s.length ? s[idx + term.length] : ''
        const cjk = /[\u4e00-\u9fff]/
        return !cjk.test(before) && !cjk.test(after)
      })
      if (matching.length > 0) {
        console.log(`[A5出題] ${char} → ${term}（例句搜尋）`)
        return { word: term, sentence: matching[Math.floor(Math.random() * matching.length)] }
      }
    }

    // 4. No example sentence — pick first available term + Gemini sentence
    if (allTerms.length > 0) {
      const word = allTerms[0]
      console.log(`[A5出題] ${char} → ${word}（Gemini造句）`)
      const aiSentence = await geminiSentence(word, this.apiKeys)
      if (aiSentence) return { word, sentence: aiSentence }
      return { word, sentence: `請寫出「${word}」。` }
    }

    // 5. No terms at all — single character + Gemini sentence
    console.log(`[A5出題] ${char} → ${char}（單字）`)
    const aiSentence = await geminiSentence(char, this.apiKeys)
    if (aiSentence) return { word: char, sentence: aiSentence }
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
  async generateOne(char: string, index: number, wordType: 'word' | 'idiom' | 'mixed' = 'mixed'): Promise<A5QuizItem> {
    const result = await this.makeWordWithSentence(char, wordType)
    return {
      id: `q-${index + 1}`,
      word: result.word,
      bopomofo: '',
      characters: result.word.split(''),
      sentence: result.sentence,
    }
  }
}
