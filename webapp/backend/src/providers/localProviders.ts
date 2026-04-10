import type { A1LookupResponse, A2QuizItem, A2QuizResponse, IdiomQuizProvider, WordLookupProvider } from '../contracts/providers.js'

type DictEntry = {
  bopomofo: string
  words: { term: string; bopomofo: string }[]
  idioms: { term: string; bopomofo: string }[]
}

const dictionary: Record<string, DictEntry> = {
  字: {
    bopomofo: 'ㄗˋ',
    words: [
      { term: '文字', bopomofo: 'ㄨㄣˊ ㄗˋ' },
      { term: '字典', bopomofo: 'ㄗˋ ㄉㄧㄢˇ' },
      { term: '寫字', bopomofo: 'ㄒㄧㄝˇ ㄗˋ' },
      { term: '字體', bopomofo: 'ㄗˋ ㄊㄧˇ' },
      { term: '字詞', bopomofo: 'ㄗˋ ㄘˊ' },
      { term: '識字', bopomofo: 'ㄕˋ ㄗˋ' },
    ],
    idioms: [
      { term: '字字珠璣', bopomofo: 'ㄗˋ ㄗˋ ㄓㄨ ㄐㄧ' },
      { term: '一字千金', bopomofo: 'ㄧ ㄗˋ ㄑㄧㄢ ㄐㄧㄣ' },
      { term: '字斟句酌', bopomofo: 'ㄗˋ ㄓㄣ ㄐㄩˋ ㄓㄨㄛˊ' },
      { term: '咬文嚼字', bopomofo: 'ㄧㄠˇ ㄨㄣˊ ㄐㄧㄠˊ ㄗˋ' },
      { term: '金字招牌', bopomofo: 'ㄐㄧㄣ ㄗˋ ㄓㄠ ㄆㄞˊ' },
      { term: '十字路口', bopomofo: 'ㄕˊ ㄗˋ ㄌㄨˋ ㄎㄡˇ' },
    ],
  },
  學: {
    bopomofo: 'ㄒㄩㄝˊ',
    words: [
      { term: '學習', bopomofo: 'ㄒㄩㄝˊ ㄒㄧˊ' },
      { term: '學生', bopomofo: 'ㄒㄩㄝˊ ㄕㄥ' },
      { term: '學校', bopomofo: 'ㄒㄩㄝˊ ㄒㄧㄠˋ' },
      { term: '學問', bopomofo: 'ㄒㄩㄝˊ ㄨㄣˋ' },
      { term: '科學', bopomofo: 'ㄎㄜ ㄒㄩㄝˊ' },
      { term: '自學', bopomofo: 'ㄗˋ ㄒㄩㄝˊ' },
    ],
    idioms: [
      { term: '學以致用', bopomofo: 'ㄒㄩㄝˊ ㄧˇ ㄓˋ ㄩㄥˋ' },
      { term: '勤學不倦', bopomofo: 'ㄑㄧㄣˊ ㄒㄩㄝˊ ㄅㄨˋ ㄐㄩㄢˋ' },
      { term: '好學不倦', bopomofo: 'ㄏㄠˋ ㄒㄩㄝˊ ㄅㄨˋ ㄐㄩㄢˋ' },
      { term: '學富五車', bopomofo: 'ㄒㄩㄝˊ ㄈㄨˋ ㄨˇ ㄐㄩ' },
      { term: '牙牙學語', bopomofo: 'ㄧㄚˊ ㄧㄚˊ ㄒㄩㄝˊ ㄩˇ' },
      { term: '活到老學到老', bopomofo: 'ㄏㄨㄛˊ ㄉㄠˋ ㄌㄠˇ ㄒㄩㄝˊ ㄉㄠˋ ㄌㄠˇ' },
    ],
  },
  勇: {
    bopomofo: 'ㄩㄥˇ',
    words: [
      { term: '勇敢', bopomofo: 'ㄩㄥˇ ㄍㄢˇ' },
      { term: '勇氣', bopomofo: 'ㄩㄥˇ ㄑㄧˋ' },
      { term: '勇士', bopomofo: 'ㄩㄥˇ ㄕˋ' },
      { term: '英勇', bopomofo: 'ㄧㄥ ㄩㄥˇ' },
      { term: '勇猛', bopomofo: 'ㄩㄥˇ ㄇㄥˇ' },
      { term: '奮勇', bopomofo: 'ㄈㄣˋ ㄩㄥˇ' },
    ],
    idioms: [
      { term: '勇往直前', bopomofo: 'ㄩㄥˇ ㄨㄤˇ ㄓˊ ㄑㄧㄢˊ' },
      { term: '見義勇為', bopomofo: 'ㄐㄧㄢˋ ㄧˋ ㄩㄥˇ ㄨㄟˊ' },
      { term: '自告奮勇', bopomofo: 'ㄗˋ ㄍㄠˋ ㄈㄣˋ ㄩㄥˇ' },
      { term: '急流勇退', bopomofo: 'ㄐㄧˊ ㄌㄧㄡˊ ㄩㄥˇ ㄊㄨㄟˋ' },
      { term: '智勇雙全', bopomofo: 'ㄓˋ ㄩㄥˇ ㄕㄨㄤ ㄑㄩㄢˊ' },
      { term: '匹夫之勇', bopomofo: 'ㄆㄧˇ ㄈㄨ ㄓ ㄩㄥˇ' },
    ],
  },
  百: {
    bopomofo: 'ㄅㄞˇ',
    words: [
      { term: '百合', bopomofo: 'ㄅㄞˇ ㄏㄜˊ' },
      { term: '百分', bopomofo: 'ㄅㄞˇ ㄈㄣ' },
      { term: '百貨', bopomofo: 'ㄅㄞˇ ㄏㄨㄛˋ' },
      { term: '百姓', bopomofo: 'ㄅㄞˇ ㄒㄧㄥˋ' },
      { term: '百科', bopomofo: 'ㄅㄞˇ ㄎㄜ' },
      { term: '百年', bopomofo: 'ㄅㄞˇ ㄋㄧㄢˊ' },
    ],
    idioms: [
      { term: '百發百中', bopomofo: 'ㄅㄞˇ ㄈㄚ ㄅㄞˇ ㄓㄨㄥˋ' },
      { term: '百折不撓', bopomofo: 'ㄅㄞˇ ㄓㄜˊ ㄅㄨˋ ㄋㄠˊ' },
      { term: '千奇百怪', bopomofo: 'ㄑㄧㄢ ㄑㄧˊ ㄅㄞˇ ㄍㄨㄞˋ' },
      { term: '百花齊放', bopomofo: 'ㄅㄞˇ ㄏㄨㄚ ㄑㄧˊ ㄈㄤˋ' },
      { term: '百聞不如一見', bopomofo: 'ㄅㄞˇ ㄨㄣˊ ㄅㄨˋ ㄖㄨˊ ㄧ ㄐㄧㄢˋ' },
      { term: '百尺竿頭', bopomofo: 'ㄅㄞˇ ㄔˇ ㄍㄢ ㄊㄡˊ' },
    ],
  },
  山: {
    bopomofo: 'ㄕㄢ',
    words: [
      { term: '高山', bopomofo: 'ㄍㄠ ㄕㄢ' },
      { term: '山谷', bopomofo: 'ㄕㄢ ㄍㄨˇ' },
      { term: '山脈', bopomofo: 'ㄕㄢ ㄇㄞˋ' },
      { term: '山頂', bopomofo: 'ㄕㄢ ㄉㄧㄥˇ' },
      { term: '登山', bopomofo: 'ㄉㄥ ㄕㄢ' },
      { term: '山水', bopomofo: 'ㄕㄢ ㄕㄨㄟˇ' },
    ],
    idioms: [
      { term: '山明水秀', bopomofo: 'ㄕㄢ ㄇㄧㄥˊ ㄕㄨㄟˇ ㄒㄧㄡˋ' },
      { term: '開門見山', bopomofo: 'ㄎㄞ ㄇㄣˊ ㄐㄧㄢˋ ㄕㄢ' },
      { term: '排山倒海', bopomofo: 'ㄆㄞˊ ㄕㄢ ㄉㄠˇ ㄏㄞˇ' },
      { term: '翻山越嶺', bopomofo: 'ㄈㄢ ㄕㄢ ㄩㄝˋ ㄌㄧㄥˇ' },
      { term: '愚公移山', bopomofo: 'ㄩˊ ㄍㄨㄥ ㄧˊ ㄕㄢ' },
      { term: '山窮水盡', bopomofo: 'ㄕㄢ ㄑㄩㄥˊ ㄕㄨㄟˇ ㄐㄧㄣˋ' },
    ],
  },
  心: {
    bopomofo: 'ㄒㄧㄣ',
    words: [
      { term: '開心', bopomofo: 'ㄎㄞ ㄒㄧㄣ' },
      { term: '心情', bopomofo: 'ㄒㄧㄣ ㄑㄧㄥˊ' },
      { term: '用心', bopomofo: 'ㄩㄥˋ ㄒㄧㄣ' },
      { term: '心意', bopomofo: 'ㄒㄧㄣ ㄧˋ' },
      { term: '細心', bopomofo: 'ㄒㄧˋ ㄒㄧㄣ' },
      { term: '愛心', bopomofo: 'ㄞˋ ㄒㄧㄣ' },
    ],
    idioms: [
      { term: '心想事成', bopomofo: 'ㄒㄧㄣ ㄒㄧㄤˇ ㄕˋ ㄔㄥˊ' },
      { term: '專心致志', bopomofo: 'ㄓㄨㄢ ㄒㄧㄣ ㄓˋ ㄓˋ' },
      { term: '心花怒放', bopomofo: 'ㄒㄧㄣ ㄏㄨㄚ ㄋㄨˋ ㄈㄤˋ' },
      { term: '一心一意', bopomofo: 'ㄧ ㄒㄧㄣ ㄧ ㄧˋ' },
      { term: '三心二意', bopomofo: 'ㄙㄢ ㄒㄧㄣ ㄦˋ ㄧˋ' },
      { term: '心曠神怡', bopomofo: 'ㄒㄧㄣ ㄎㄨㄤˋ ㄕㄣˊ ㄧˊ' },
    ],
  },
}

function pickCharacter(query: string) {
  const normalized = query.replace(/\s+/g, '')
  for (const key of Object.keys(dictionary)) {
    if (normalized.includes(key)) return key
  }
  const match = normalized.match(/[\u4e00-\u9fff]/)
  return match?.[0] ?? '字'
}

export class LocalWordLookupProvider implements WordLookupProvider {
  lookup(query: string): A1LookupResponse {
    const character = pickCharacter(query)
    const entry = dictionary[character] ?? dictionary['字']
    return {
      ok: true,
      query,
      character,
      bopomofo: entry.bopomofo,
      words: entry.words,
      idioms: entry.idioms,
      note: undefined,
    }
  }
}

function makePrompt(idiom: string, index: number) {
  const prompts = [
    `請選出第一個字是「${idiom[0]}」、最後一個字是「${idiom[3]}」的成語。`,
    `請選出包含「${idiom[1]}」這個字的成語。`,
    `請選出成語「${idiom.slice(0, 2)}__」的完整答案。`,
  ]
  return prompts[index % prompts.length]
}

function rotateOptions(idioms: string[], correctIdiom: string, index: number) {
  const base = idioms.filter((item) => item !== correctIdiom).slice(index, index + 3)
  const fillers = base.length === 3 ? base : idioms.filter((item) => item !== correctIdiom).slice(0, 3)
  const options = [correctIdiom, ...fillers].slice(0, 4)
  const shift = index % options.length
  return options.map((_, optionIndex) => options[(optionIndex + shift) % options.length])
}

export class LocalIdiomQuizProvider implements IdiomQuizProvider {
  generate(idioms: string[], questionCount: number): A2QuizResponse {
    const uniqueIdioms = Array.from(new Set(idioms)).slice(0, Math.max(4, questionCount))
    const items: A2QuizItem[] = uniqueIdioms.slice(0, questionCount).map((idiom, index) => {
      const options = rotateOptions(uniqueIdioms, idiom, index)
      const correctAnswer = options.indexOf(idiom)
      return {
        id: `quiz-${index + 1}`,
        prompt: makePrompt(idiom, index),
        options,
        correctAnswer,
        explanation: `正確答案是 ${idiom}。這是 Milestone 4 的 backend-backed quiz contract。`,
      }
    })

    return {
      ok: true,
      quizId: `local-${Date.now()}`,
      items,
    }
  }
}
