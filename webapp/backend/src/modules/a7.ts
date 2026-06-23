import type {
  A7ExplainResponse,
  A7PuzzleOptions,
  A7PuzzleResponse,
  IdiomCrosswordProvider,
  IdiomExplainProvider,
} from '../contracts/providers.js'

export function createA7Module(
  provider: IdiomCrosswordProvider,
  explainProvider: IdiomExplainProvider,
) {
  return {
    generatePuzzle(options: A7PuzzleOptions): A7PuzzleResponse {
      return provider.generate(options)
    },
    explainIdiom(idiom: string): Promise<A7ExplainResponse> {
      return explainProvider.explain(idiom)
    },
  }
}
