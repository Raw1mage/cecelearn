import type {
  A1ChatMessage,
  A1ChatResponse,
  A1ErrorResponse,
  A1IllustrateResponse,
  A1LookupResponse,
  DialogueChatProvider,
  SceneIllustrationProvider,
  WordLookupProvider,
} from '../contracts/providers.js'

export function createA1Module(
  provider: WordLookupProvider,
  chatProvider?: DialogueChatProvider,
  illustrationProvider?: SceneIllustrationProvider,
) {
  return {
    lookup(query: string): Promise<A1LookupResponse> {
      return Promise.resolve(provider.lookup(query))
    },
    chat(
      messages: A1ChatMessage[],
      hint?: 'lookup',
    ): Promise<A1ChatResponse | A1ErrorResponse> {
      if (!chatProvider) {
        return Promise.resolve({
          ok: false,
          error: 'CHAT_NOT_CONFIGURED',
          message: '小雞老師還在準備中喔！',
        })
      }
      return chatProvider.chat(messages, hint)
    },
    illustrate(
      context: string,
      targetWord?: string,
    ): Promise<A1IllustrateResponse | A1ErrorResponse> {
      if (!illustrationProvider) {
        return Promise.resolve({
          ok: false,
          error: 'ILLUSTRATE_NOT_CONFIGURED',
          message: '畫圖功能還在準備中喔！',
        })
      }
      return illustrationProvider.illustrate(context, targetWord)
    },
  }
}
