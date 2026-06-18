import type {
  A1ChatMessage,
  A1ChatResponse,
  A1ErrorResponse,
  DialogueChatProvider,
} from '../contracts/providers.js'
import { SYSTEM_PROMPT, LOOKUP_HINT, buildA1Response, type ParsedReply } from './a1ChatShared.js'

const GEMINI_CHAT_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

/* ------------------------------------------------------------------ */
/*  responseSchema — 結構化輸出（Gemini dialect：大寫 OBJECT/STRING）    */
/* ------------------------------------------------------------------ */

const WORD_ITEM_SCHEMA = {
  type: 'OBJECT',
  properties: { term: { type: 'STRING' }, bopomofo: { type: 'STRING' } },
  required: ['term', 'bopomofo'],
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    intent: {
      type: 'STRING',
      enum: ['lookup', 'make_words', 'make_sentence', 'tell_story', 'draw', 'solve_arithmetic', 'explain', 'start_dictation', 'start_idiom', 'chat', 'unclear'],
    },
    reply: { type: 'STRING' },
    lookup: {
      type: 'OBJECT',
      properties: {
        character: { type: 'STRING' },
        bopomofo: { type: 'STRING' },
        words: { type: 'ARRAY', items: WORD_ITEM_SCHEMA },
        idioms: { type: 'ARRAY', items: WORD_ITEM_SCHEMA },
      },
      required: ['character', 'bopomofo', 'words'],
    },
    sentence: {
      type: 'OBJECT',
      properties: {
        targetWord: { type: 'STRING' },
        sentences: { type: 'ARRAY', items: { type: 'STRING' } },
        bopomofo: { type: 'STRING' },
      },
      required: ['targetWord', 'sentences'],
    },
    story: {
      type: 'OBJECT',
      properties: { topic: { type: 'STRING' }, story: { type: 'STRING' } },
      required: ['topic', 'story'],
    },
    draw: {
      type: 'OBJECT',
      properties: { subject: { type: 'STRING' } },
      required: ['subject'],
    },
    arithmetic: {
      type: 'OBJECT',
      properties: {
        a: { type: 'NUMBER' },
        b: { type: 'NUMBER' },
        operation: { type: 'STRING', enum: ['+', '-', '*', '/'] },
        expression: { type: 'STRING' },
      },
      required: ['a', 'b', 'operation', 'expression'],
    },
    explain: {
      type: 'OBJECT',
      properties: {
        subject: { type: 'STRING', enum: ['english', 'math', 'general'] },
        question: { type: 'STRING' },
        steps: { type: 'ARRAY', items: { type: 'STRING' } },
        answer: { type: 'STRING' },
        words: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: { word: { type: 'STRING' }, meaning: { type: 'STRING' } },
            required: ['word', 'meaning'],
          },
        },
        viz: {
          type: 'OBJECT',
          properties: {
            kind: { type: 'STRING', enum: ['count', 'groups'] },
            icon: { type: 'STRING' },
            total: { type: 'NUMBER' },
            operation: { type: 'STRING', enum: ['add', 'sub'] },
            operand: { type: 'NUMBER' },
            groups: { type: 'NUMBER' },
            per: { type: 'NUMBER' },
            result: { type: 'NUMBER' },
            equation: { type: 'STRING' },
          },
          required: ['kind'],
        },
      },
      required: ['subject', 'question', 'steps'],
    },
  },
  required: ['intent', 'reply'],
}

type GeminiCandidate = {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
}

function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...fields, ts: Date.now() }))
}

/* round-robin key index */
let keyIndex = 0

export class GeminiChatProvider implements DialogueChatProvider {
  private apiKeys: string[]

  constructor(apiKeys: string[] = []) {
    this.apiKeys = apiKeys
    if (apiKeys.length > 0) {
      console.log(`[GeminiChatProvider] enabled with ${apiKeys.length} API key(s)`)
    } else {
      console.log('[GeminiChatProvider] disabled (no API keys)')
    }
  }

  async chat(
    messages: A1ChatMessage[],
    hint?: 'lookup',
  ): Promise<A1ChatResponse | A1ErrorResponse> {
    const start = Date.now()
    log('a1.chat.request', { turnCount: messages.length, hasHint: Boolean(hint) })

    if (this.apiKeys.length === 0) {
      return {
        ok: false,
        error: 'CHAT_NOT_CONFIGURED',
        message: '小雞老師還在準備中喔！',
      }
    }
    if (messages.length === 0) {
      return {
        ok: false,
        error: 'CHAT_BAD_REQUEST',
        message: '我沒聽清楚耶，再說一次好嗎？',
      }
    }

    // 組 Gemini contents[]：history 轉成 user/model 角色
    const contents = messages.map((m) => ({
      role: m.role === 'tutor' ? 'model' : 'user',
      parts: [{ text: m.text }],
    }))
    if (hint === 'lookup') {
      contents[contents.length - 1]!.parts[0]!.text += LOOKUP_HINT
    }

    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    })

    let lastUpstreamStatus = 0
    for (let attempt = 0; attempt < this.apiKeys.length; attempt++) {
      const idx = (keyIndex + attempt) % this.apiKeys.length
      const key = this.apiKeys[idx]
      try {
        const res = await fetch(`${GEMINI_CHAT_URL}?key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(15000),
          body,
        })

        if (res.status === 429) {
          lastUpstreamStatus = 429
          console.warn(`[GeminiChatProvider] key #${idx} rate-limited, trying next`)
          continue
        }
        keyIndex = (idx + 1) % this.apiKeys.length

        if (!res.ok) {
          lastUpstreamStatus = res.status
          const upstreamBody = await res.text().catch(() => '')
          log('a1.chat.error', {
            code: 'CHAT_UPSTREAM_ERROR',
            upstreamStatus: res.status,
            upstreamBody: upstreamBody.slice(0, 600),
            latencyMs: Date.now() - start,
          })
          return {
            ok: false,
            error: 'CHAT_UPSTREAM_ERROR',
            message: '小雞老師剛剛打瞌睡了，請再說一次好嗎？',
          }
        }

        const data = (await res.json()) as GeminiCandidate
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text
        if (!text) {
          log('a1.chat.error', { code: 'CHAT_EMPTY_REPLY', latencyMs: Date.now() - start })
          return {
            ok: false,
            error: 'CHAT_EMPTY_REPLY',
            message: '這個我先不回答喔，我們聊點別的好嗎？',
          }
        }

        let parsed: ParsedReply
        try {
          parsed = JSON.parse(text) as ParsedReply
        } catch {
          log('a1.chat.error', { code: 'CHAT_PARSE_ERROR', latencyMs: Date.now() - start })
          return {
            ok: false,
            error: 'CHAT_PARSE_ERROR',
            message: '我有點搞混了，再問我一次好嗎？',
          }
        }

        const response = buildA1Response(parsed)
        if (!response) {
          log('a1.chat.error', { code: 'CHAT_PARSE_ERROR', latencyMs: Date.now() - start })
          return {
            ok: false,
            error: 'CHAT_PARSE_ERROR',
            message: '我有點搞混了，再問我一次好嗎？',
          }
        }

        log('a1.chat.intent', {
          intent: response.intent,
          latencyMs: Date.now() - start,
          replyLen: response.reply.length,
        })
        return response
      } catch (error) {
        console.warn(
          `[GeminiChatProvider] key #${idx} failed:`,
          error instanceof Error ? error.message : error,
        )
        lastUpstreamStatus = 0
        continue
      }
    }

    log('a1.chat.error', { code: 'CHAT_UPSTREAM_ERROR', upstreamStatus: lastUpstreamStatus, latencyMs: Date.now() - start })
    return {
      ok: false,
      error: 'CHAT_UPSTREAM_ERROR',
      message: '小雞老師剛剛打瞌睡了，請再說一次好嗎？',
    }
  }
}
