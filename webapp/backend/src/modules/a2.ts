import type { IdiomQuizProvider } from '../contracts/providers.js'

export function createA2Module(provider: IdiomQuizProvider) {
  return {
    generateQuiz(idioms: string[], questionCount: number) {
      return provider.generate(idioms, questionCount)
    },
  }
}
