import type { A1LookupResponse, A2QuizItem, A2QuizResponse, IdiomQuizProvider, WordLookupProvider } from '../contracts/providers.js'

const dictionary: Record<string, { bopomofo: string; words: { term: string; bopomofo: string }[] }> = {
  字: { bopomofo: 'ㄗˋ', words: [{ term: '文字', bopomofo: 'ㄨㄣˊ ㄗˋ' }, { term: '字典', bopomofo: 'ㄗˋ ㄉㄧㄢˇ' }] },
  學: { bopomofo: 'ㄒㄩㄝˊ', words: [{ term: '學習', bopomofo: 'ㄒㄩㄝˊ ㄒㄧˊ' }, { term: '學生', bopomofo: 'ㄒㄩㄝˊ ㄕㄥ' }] },
  勇: { bopomofo: 'ㄩㄥˇ', words: [{ term: '勇敢', bopomofo: 'ㄩㄥˇ ㄍㄢˇ' }, { term: '勇氣', bopomofo: 'ㄩㄥˇ ㄑㄧˋ' }] },
  百: { bopomofo: 'ㄅㄞˇ', words: [{ term: '百合', bopomofo: 'ㄅㄞˇ ㄏㄜˊ' }, { term: '百分', bopomofo: 'ㄅㄞˇ ㄈㄣ' }] },
  山: { bopomofo: 'ㄕㄢ', words: [{ term: '高山', bopomofo: 'ㄍㄠ ㄕㄢ' }, { term: '山谷', bopomofo: 'ㄕㄢ ㄍㄨˇ' }] },
  心: { bopomofo: 'ㄒㄧㄣ', words: [{ term: '開心', bopomofo: 'ㄎㄞ ㄒㄧㄣ' }, { term: '心情', bopomofo: 'ㄒㄧㄣ ㄑㄧㄥˊ' }] },
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
      note: '目前使用本地 lookup provider；之後可替換成正式 AI / dictionary backend。',
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
