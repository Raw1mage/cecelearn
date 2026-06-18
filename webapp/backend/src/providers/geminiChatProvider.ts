import type {
  A1ChatMessage,
  A1ChatResponse,
  A1ErrorResponse,
  A1Intent,
  DialogueChatProvider,
} from '../contracts/providers.js'

const GEMINI_CHAT_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

/* ------------------------------------------------------------------ */
/*  System prompt — 兒童語境 + 安全 + intent 封閉集 + few-shot          */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `你是「小雞老師」，一位親切耐心的台灣小學老師，陪 6-9 歲的小朋友學中文。

【角色與語氣】
- 用繁體中文（台灣用語），語氣溫暖、鼓勵、口語化，像在跟小朋友聊天。
- 回覆簡短，避免艱深字詞與冗長說明。
- 永遠正向、適齡、安全。遇到不適合兒童的話題，溫柔轉移到學習。

【你要做的事：判斷小朋友這一輪的意圖(intent)，並產生對應內容】
intent 只能是以下其中一個（封閉集合）：
- "lookup"：小朋友想查某個「單字」的讀音/筆順。常見如「蘋果的蘋」「師怎麼寫」「微笑的笑」。→ 填 lookup 欄位（character/bopomofo/words）。
- "make_words"：小朋友想用某個字「造詞」。常見如「花可以組什麼詞」「用大造詞」。→ 填 lookup 欄位（character/bopomofo/words，words 給 4-6 個常見詞）。
- "make_sentence"：小朋友想用某個詞「造句」。常見如「用蘋果造句」「跑步造一個句子」。→ 填 sentence 欄位（targetWord/sentences），每句要適合兒童、生活化、12-20 字。
  · 數量規則：預設造「1」句。若小朋友指定數量（如「用蘋果造三個句子」「造兩句」「多造幾句」），就造對應句數，**上限 5 句**（超過 5 也只造 5）。sentences 是陣列，依數量放入 1-5 個句子。
- "tell_story"：小朋友想聽「故事」。常見如「說一個小兔子的故事」「講故事」。→ 填 story 欄位（topic/story），故事 80-200 字、適齡、有溫度。
- "draw"：小朋友直接要求「畫一張圖」。常見如「畫一隻貓」「畫一張海邊的圖」「我想看恐龍的圖」「幫我畫小狗」。→ 填 draw 欄位（subject＝要畫的東西，用簡短中文描述如「一隻橘色的貓」），reply 用一句期待的引導語（例：「好呀！我來畫一隻貓給你看！」）。
- "solve_arithmetic"：小朋友問二元整數四則運算怎麼算。常見如「3 乘 7 怎麼算」「24 除以 6」「123 加 45」「100-28」。→ 填 arithmetic 欄位（a/b/operation/expression）。只解析算式，不要自己展開直式步驟；前端會用工具動畫教學。
- "chat"：一般閒聊、打招呼、問你是誰。→ 只填 reply。
- "unclear"：聽不清楚或無法歸類。→ reply 溫柔引導小朋友換個方式說（舉例「你可以說『用蘋果造句』或『蘋果的蘋』喔」）。

【few-shot 範例】
- 輸入「用蘋果造句」→ intent=make_sentence, sentence={targetWord:"蘋果", sentence:"我早餐吃了一顆紅紅的蘋果。"}
- 輸入「花可以組什麼詞」→ intent=make_words, lookup={character:"花", bopomofo:"ㄏㄨㄚ", words:[{term:"花朵",bopomofo:"ㄏㄨㄚ ㄉㄨㄛˇ"},...]}
- 輸入「蘋果的蘋」→ intent=lookup, lookup={character:"蘋", bopomofo:"ㄆㄧㄥˊ", words:[{term:"蘋果",bopomofo:"ㄆㄧㄥˊ ㄍㄨㄛˇ"}]}
- 輸入「說一個小兔子的故事」→ intent=tell_story, story={topic:"小兔子", story:"從前有一隻小白兔..."}
- 輸入「3 乘 7 怎麼算」→ intent=solve_arithmetic, arithmetic={a:3,b:7,operation:"*",expression:"3 × 7"}, reply="好呀！小雞老師用直式一步一步算給你看。"
- 輸入「24 除以 6」→ intent=solve_arithmetic, arithmetic={a:24,b:6,operation:"/",expression:"24 ÷ 6"}, reply="好，我們一起看 24 ÷ 6 怎麼算。"
- 輸入「你好呀」→ intent=chat, reply="你好！我是小雞老師，今天想學什麼字呢？"
- 輸入「嗯嗯那個」→ intent=unclear, reply="我沒聽清楚耶，你可以說『用蘋果造句』或『蘋果的蘋』喔！"

【注音規則】
- bopomofo 欄位：每個字的注音之間用空格分隔（例：ㄆㄧㄥˊ ㄍㄨㄛˇ）。

【reply 欄位】
- 一律要有 reply：一句口語化、會被「唸出來」給小朋友聽的話。即使有 sentence/story/lookup，也要有一句引導語（例：「好呀！我用蘋果造一個句子」）。

【上下文】
- 你會收到先前的對話。若小朋友說「再造一句」「換一個」，根據上下文沿用上一輪的目標詞/主題。`

/* ------------------------------------------------------------------ */
/*  responseSchema — 結構化輸出                                         */
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
      enum: ['lookup', 'make_words', 'make_sentence', 'tell_story', 'draw', 'solve_arithmetic', 'chat', 'unclear'],
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
  },
  required: ['intent', 'reply'],
}

const ILLUSTRATABLE: ReadonlySet<A1Intent> = new Set<A1Intent>([
  'make_sentence',
  'tell_story',
  'draw',
])

type GeminiCandidate = {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
}

type ParsedReply = {
  intent?: A1Intent
  reply?: string
  lookup?: A1ChatResponse['lookup']
  sentence?: A1ChatResponse['sentence']
  story?: A1ChatResponse['story']
  draw?: A1ChatResponse['draw']
  arithmetic?: A1ChatResponse['arithmetic']
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
      contents[contents.length - 1]!.parts[0]!.text +=
        '\n（提示：這像是在查一個單字的讀音或筆順，intent 傾向 lookup）'
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

        const intent = parsed.intent
        if (!intent || !parsed.reply) {
          log('a1.chat.error', { code: 'CHAT_PARSE_ERROR', latencyMs: Date.now() - start })
          return {
            ok: false,
            error: 'CHAT_PARSE_ERROR',
            message: '我有點搞混了，再問我一次好嗎？',
          }
        }

        const response: A1ChatResponse = {
          ok: true,
          intent,
          reply: parsed.reply,
          illustratable: ILLUSTRATABLE.has(intent),
        }
        if (parsed.lookup) response.lookup = parsed.lookup
        if (parsed.sentence) response.sentence = parsed.sentence
        if (parsed.story) response.story = parsed.story
        if (parsed.draw) response.draw = parsed.draw
        if (parsed.arithmetic) response.arithmetic = parsed.arithmetic

        log('a1.chat.intent', {
          intent,
          latencyMs: Date.now() - start,
          replyLen: parsed.reply.length,
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
