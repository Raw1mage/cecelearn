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

/** Common 2-char words per character (fallback when no dict available) */
const COMMON_WORDS: Record<string, string> = {}

function loadVocabDb(): VocabDb {
  try {
    const dir = dirname(fileURLToPath(import.meta.url))
    const path = resolve(dir, '../../data/vocabulary.json')
    const raw = readFileSync(path, 'utf-8')
    const db = JSON.parse(raw) as VocabDb
    console.log(`[VocabQuiz] loaded ${db.stats.uniqueChars} unique chars from ${db.stats.lessons} lessons`)
    return db
  } catch (error) {
    console.warn('[VocabQuiz] failed to load vocabulary.json:', error instanceof Error ? error.message : error)
    return { stats: { lessons: 0, totalChars: 0, uniqueChars: 0 }, lessons: [] }
  }
}

function loadIdiomList(): string[] {
  try {
    const dir = dirname(fileURLToPath(import.meta.url))
    const path = resolve(dir, '../../data/idioms.json')
    const raw = readFileSync(path, 'utf-8')
    const db = JSON.parse(raw) as { idiom: string }[]
    return db.map(e => e.idiom)
  } catch {
    return []
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

export class VocabQuizEngine {
  private db: VocabDb
  private allChars: string[]
  private idiomList: string[]

  constructor() {
    this.db = loadVocabDb()
    this.allChars = [...new Set(this.db.lessons.flatMap(l => l.characters))]
    this.idiomList = loadIdiomList()
    if (this.idiomList.length > 0) {
      console.log(`[VocabQuiz] loaded ${this.idiomList.length} idioms for word generation`)
    }
  }

  /** Get available publishers */
  getPublishers(): string[] {
    return [...new Set(this.db.lessons.map(l => l.version))].sort()
  }

  /** Get grades for a publisher */
  getGrades(publisher: string): string[] {
    return [...new Set(this.db.lessons.filter(l => l.version === publisher).map(l => l.grade))].sort()
  }

  /** Get lessons for publisher + grade */
  getLessons(publisher: string, grade: string): string[] {
    return this.db.lessons
      .filter(l => l.version === publisher && l.grade === grade)
      .map(l => l.lesson)
  }

  /** Filter characters based on options */
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

  /** Build a word (2-char compound or idiom) containing the target character */
  private makeWord(char: string): { word: string; chars: string[] } {
    // Try to find an idiom containing this character
    const matchingIdioms = this.idiomList.filter(i => i.includes(char))
    if (matchingIdioms.length > 0 && Math.random() < 0.3) {
      const idiom = matchingIdioms[Math.floor(Math.random() * matchingIdioms.length)]
      return { word: idiom, chars: idiom.split('') }
    }

    // Default: just the single character (TTS will read it)
    return { word: char, chars: [char] }
  }

  generate(options: A5QuizOptions): A5QuizResponse {
    const pool = this.filterChars(options)
    if (pool.length === 0) {
      return { ok: false, quizId: '', items: [] } as A5QuizResponse & { ok: false }
    }

    const selected = pickRandom(pool, Math.min(options.questionCount, pool.length))
    const items: A5QuizItem[] = selected.map((char, i) => {
      const { word, chars } = this.makeWord(char)
      return {
        id: `q-${i + 1}`,
        word,
        bopomofo: '', // Will be filled by frontend TTS or looked up
        characters: chars,
      }
    })

    return {
      ok: true,
      quizId: `vocab-${Date.now()}`,
      items,
    }
  }
}
