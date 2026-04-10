import type { A1LookupResponse, WordLookupProvider } from '../contracts/providers.js'

export function createA1Module(provider: WordLookupProvider) {
  return {
    lookup(query: string): Promise<A1LookupResponse> {
      return Promise.resolve(provider.lookup(query))
    },
  }
}
