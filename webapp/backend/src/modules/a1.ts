import type { WordLookupProvider } from '../contracts/providers.js'

export function createA1Module(provider: WordLookupProvider) {
  return {
    lookup(query: string) {
      return provider.lookup(query)
    },
  }
}
