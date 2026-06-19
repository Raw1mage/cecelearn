import type {
  A1ChatMessage,
  A1ChatResponse,
  A1ErrorResponse,
  A1IllustrateResponse,
  A1LookupResponse,
  A1ReadQuestionResponse,
  A1VideoSearchResponse,
  ChannelAddRequest,
  ChannelAddResponse,
  ChannelListResponse,
  DialogueChatProvider,
  QuestionVisionProvider,
  SceneIllustrationProvider,
  VideoSearchProvider,
  WordLookupProvider,
} from '../contracts/providers.js'
import type { ChildChannelLibrary } from '../providers/childChannelLibrary.js'

export function createA1Module(
  provider: WordLookupProvider,
  chatProvider?: DialogueChatProvider,
  illustrationProvider?: SceneIllustrationProvider,
  visionProvider?: QuestionVisionProvider,
  videoProvider?: VideoSearchProvider,
  channelLibrary?: ChildChannelLibrary,
) {
  return {
    lookup(query: string): Promise<A1LookupResponse> {
      return Promise.resolve(provider.lookup(query))
    },
    chat(
      messages: A1ChatMessage[],
      hint?: 'lookup' | 'story',
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
      mode: 'scene' | 'diagram' = 'scene',
    ): Promise<A1IllustrateResponse | A1ErrorResponse> {
      if (!illustrationProvider) {
        return Promise.resolve({
          ok: false,
          error: 'ILLUSTRATE_NOT_CONFIGURED',
          message: '畫圖功能還在準備中喔！',
        })
      }
      return illustrationProvider.illustrate(context, targetWord, mode)
    },
    readQuestion(
      imageBase64: string,
      mimeType: string,
    ): Promise<A1ReadQuestionResponse | A1ErrorResponse> {
      if (!visionProvider) {
        return Promise.resolve({
          ok: false,
          error: 'READ_NOT_CONFIGURED',
          message: '拍照讀題還在準備中喔！',
        })
      }
      return visionProvider.readQuestion(imageBase64, mimeType)
    },
    searchVideos(query: string): Promise<A1VideoSearchResponse | A1ErrorResponse> {
      if (!videoProvider) {
        return Promise.resolve({
          ok: false,
          error: 'VIDEO_NOT_CONFIGURED',
          message: '找影片功能還在準備中喔！',
        })
      }
      return videoProvider.search(query)
    },
    listChannels(): ChannelListResponse | A1ErrorResponse {
      if (!channelLibrary) {
        return { ok: false, error: 'CHANNELS_NOT_CONFIGURED', message: '頻道庫還沒準備好。' }
      }
      return { ok: true, channels: channelLibrary.list() }
    },
    addChannel(input: ChannelAddRequest): ChannelAddResponse | A1ErrorResponse {
      if (!channelLibrary) {
        return { ok: false, error: 'CHANNELS_NOT_CONFIGURED', message: '頻道庫還沒準備好。' }
      }
      const channelId = (input.channelId || '').trim()
      if (!channelId) {
        return { ok: false, error: 'CHANNEL_BAD_REQUEST', message: '請提供 channelId。' }
      }
      try {
        const channel = channelLibrary.add({
          channelId,
          title: input.title?.trim() || undefined,
          handle: input.handle?.trim() || undefined,
          topics: Array.isArray(input.topics) ? input.topics : undefined,
          note: input.note?.trim() || undefined,
          addedAt: new Date().toISOString().slice(0, 10),
        })
        return { ok: true, channel }
      } catch (err) {
        return {
          ok: false,
          error: 'CHANNEL_PERSIST_FAILED',
          message: err instanceof Error ? err.message : '寫入頻道庫失敗。',
        }
      }
    },
  }
}
