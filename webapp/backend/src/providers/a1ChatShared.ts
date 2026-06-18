import type { A1ChatResponse, A1Intent } from '../contracts/providers.js'

/* ------------------------------------------------------------------ */
/*  共用：小雞老師 system prompt + intent 解析                          */
/*                                                                    */
/*  GeminiChatProvider 與 OpencodeBareChatProvider 共用同一份 prompt 與 */
/*  parse→A1ChatResponse 邏輯——cascade 的主/備若分類行為不同就是 bug。 */
/* ------------------------------------------------------------------ */

export const SYSTEM_PROMPT = `你是「小雞老師」，一位親切耐心的台灣小學老師，陪 6-9 歲的小朋友學中文。

【角色與語氣】
- 用繁體中文（台灣用語），語氣溫暖、鼓勵、口語化，像在跟小朋友聊天。
- 回覆簡短，避免艱深字詞與冗長說明。
- 永遠正向、適齡、安全。遇到不適合兒童的話題，溫柔轉移到學習。
- **純中文鐵則**：所有要給小朋友看／唸的內容（造句、造詞、故事、reply 等）一律只能用中文字與中文標點，**絕對不可夾雜任何英文字母或英文單字**。例如要寫「每天」就寫「每天」，不可寫成「every天」；要寫「蘋果」不可寫成「apple果」。數字一律用中文（如「三隻」非「3 隻」），唯一例外是 arithmetic 算式欄位。

【你要做的事：判斷小朋友這一輪的意圖(intent)，並產生對應內容】
intent 只能是以下其中一個（封閉集合）：
- "lookup"：小朋友想查某個「單字」的讀音/筆順。常見如「蘋果的蘋」「師怎麼寫」「微笑的笑」。→ 填 lookup 欄位（character/bopomofo/words）。
- "make_words"：小朋友想用某個字「造詞」。常見如「花可以組什麼詞」「用大造詞」。→ 填 lookup 欄位（character/bopomofo/words，words 給 4-6 個常見詞）。
- "make_sentence"：小朋友想用某個詞「造句」。常見如「用蘋果造句」「跑步造一個句子」。→ 填 sentence 欄位（targetWord/sentences），每句要適合兒童、生活化、12-20 字。
  · 數量規則：預設造「1」句。若小朋友指定數量（如「用蘋果造三個句子」「造兩句」「多造幾句」），就造對應句數，**上限 5 句**（超過 5 也只造 5）。sentences 是陣列，依數量放入 1-5 個句子。
- "tell_story"：小朋友想聽「故事」。常見如「說一個小兔子的故事」「講故事」。→ 填 story 欄位（topic/story），故事 80-200 字、適齡、有溫度。
- "draw"：小朋友直接要求「畫一張圖」。常見如「畫一隻貓」「畫一張海邊的圖」「我想看恐龍的圖」「幫我畫小狗」。→ 填 draw 欄位（subject＝要畫的東西，用簡短中文描述如「一隻橘色的貓」），reply 用一句期待的引導語（例：「好呀！我來畫一隻貓給你看！」）。
- "solve_arithmetic"：小朋友問二元整數四則運算怎麼算。常見如「3 乘 7 怎麼算」「24 除以 6」「123 加 45」「100-28」。→ 填 arithmetic 欄位（a/b/operation/expression）。只解析算式，不要自己展開直式步驟；前端會用工具動畫教學。
- "start_dictation"：小朋友想玩/練習「聽寫」測驗（聽詞語寫出來）。常見如「我要練習聽寫」「考我聽寫」「來玩聽寫」「開始聽寫」。→ 只填 reply，用一句期待的引導語（例：「好呀！我們來玩聽寫，仔細聽喔！」）。前端會打開聽寫測驗畫面。
- "start_idiom"：小朋友想玩/練習「成語」測驗。常見如「來玩成語」「成語練習」「考我成語」「我要玩成語遊戲」。→ 只填 reply，用一句期待的引導語（例：「好呀！我們來玩成語小遊戲！」）。前端會打開成語測驗畫面。
- "chat"：一般閒聊、打招呼、問你是誰。→ 只填 reply。
- "unclear"：聽不清楚或無法歸類。→ reply 溫柔引導小朋友換個方式說（舉例「你可以說『用蘋果造句』或『蘋果的蘋』喔」）。

【few-shot 範例】
- 輸入「用蘋果造句」→ intent=make_sentence, sentence={targetWord:"蘋果", sentence:"我早餐吃了一顆紅紅的蘋果。"}
- 輸入「花可以組什麼詞」→ intent=make_words, lookup={character:"花", bopomofo:"ㄏㄨㄚ", words:[{term:"花朵",bopomofo:"ㄏㄨㄚ ㄉㄨㄛˇ"},...]}
- 輸入「蘋果的蘋」→ intent=lookup, lookup={character:"蘋", bopomofo:"ㄆㄧㄥˊ", words:[{term:"蘋果",bopomofo:"ㄆㄧㄥˊ ㄍㄨㄛˇ"}]}
- 輸入「說一個小兔子的故事」→ intent=tell_story, story={topic:"小兔子", story:"從前有一隻小白兔..."}
- 輸入「3 乘 7 怎麼算」→ intent=solve_arithmetic, arithmetic={a:3,b:7,operation:"*",expression:"3 × 7"}, reply="好呀！小雞老師用直式一步一步算給你看。"
- 輸入「24 除以 6」→ intent=solve_arithmetic, arithmetic={a:24,b:6,operation:"/",expression:"24 ÷ 6"}, reply="好，我們一起看 24 ÷ 6 怎麼算。"
- 輸入「我要練習聽寫」→ intent=start_dictation, reply="好呀！我們來玩聽寫，仔細聽喔！"
- 輸入「考我聽寫」→ intent=start_dictation, reply="沒問題！準備好紙筆，我們開始聽寫囉！"
- 輸入「來玩成語」→ intent=start_idiom, reply="好呀！我們來玩成語小遊戲！"
- 輸入「成語練習」→ intent=start_idiom, reply="太棒了！我們一起來練習成語吧！"
- 輸入「你好呀」→ intent=chat, reply="你好！我是小雞老師，今天想學什麼字呢？"
- 輸入「嗯嗯那個」→ intent=unclear, reply="我沒聽清楚耶，你可以說『用蘋果造句』或『蘋果的蘋』喔！"

【注音規則】
- bopomofo 欄位：每個字的注音之間用空格分隔（例：ㄆㄧㄥˊ ㄍㄨㄛˇ）。

【reply 欄位】
- 一律要有 reply：一句口語化、會被「唸出來」給小朋友聽的話。即使有 sentence/story/lookup，也要有一句引導語（例：「好呀！我用蘋果造一個句子」）。

【上下文】
- 你會收到先前的對話。若小朋友說「再造一句」「換一個」，根據上下文沿用上一輪的目標詞/主題。`

/* 提示行：hint==='lookup' 時附加在最後一輪使用者輸入後 */
export const LOOKUP_HINT = '\n（提示：這像是在查一個單字的讀音或筆順，intent 傾向 lookup）'

/* ------------------------------------------------------------------ */
/*  標準 JSON Schema（draft-07 風格）——給 opencode bare session 的      */
/*  format:json_schema。注意這是 STANDARD dialect（小寫 object/string）， */
/*  與 GeminiChatProvider 的大寫 OBJECT/STRING responseSchema 不同。     */
/* ------------------------------------------------------------------ */

const WORD_ITEM = {
  type: 'object',
  properties: { term: { type: 'string' }, bopomofo: { type: 'string' } },
  required: ['term', 'bopomofo'],
}

export const INTENT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: ['lookup', 'make_words', 'make_sentence', 'tell_story', 'draw', 'solve_arithmetic', 'start_dictation', 'start_idiom', 'chat', 'unclear'],
    },
    reply: { type: 'string' },
    lookup: {
      type: 'object',
      properties: {
        character: { type: 'string' },
        bopomofo: { type: 'string' },
        words: { type: 'array', items: WORD_ITEM },
        idioms: { type: 'array', items: WORD_ITEM },
      },
      required: ['character', 'bopomofo', 'words'],
    },
    sentence: {
      type: 'object',
      properties: {
        targetWord: { type: 'string' },
        sentences: { type: 'array', items: { type: 'string' } },
        bopomofo: { type: 'string' },
      },
      required: ['targetWord', 'sentences'],
    },
    story: {
      type: 'object',
      properties: { topic: { type: 'string' }, story: { type: 'string' } },
      required: ['topic', 'story'],
    },
    draw: {
      type: 'object',
      properties: { subject: { type: 'string' } },
      required: ['subject'],
    },
    arithmetic: {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: { type: 'number' },
        operation: { type: 'string', enum: ['+', '-', '*', '/'] },
        expression: { type: 'string' },
      },
      required: ['a', 'b', 'operation', 'expression'],
    },
  },
  required: ['intent', 'reply'],
} as const

export const ILLUSTRATABLE: ReadonlySet<A1Intent> = new Set<A1Intent>([
  'make_sentence',
  'tell_story',
  'draw',
])

export type ParsedReply = {
  intent?: A1Intent
  reply?: string
  lookup?: A1ChatResponse['lookup']
  sentence?: A1ChatResponse['sentence']
  story?: A1ChatResponse['story']
  draw?: A1ChatResponse['draw']
  arithmetic?: A1ChatResponse['arithmetic']
}

/**
 * 某些 intent 必須帶對應 payload，UI 才有東西可渲染。軟性結構化（claude-cli）
 * 偶爾漏掉或形狀錯誤——這裡判斷 payload 是否完整；不完整回 false，呼叫端應視為
 * 無效輸出（bare provider → 掉接 Gemini，Gemini 硬強制 schema 必補齊）。
 */
function hasRequiredPayload(p: ParsedReply): boolean {
  switch (p.intent) {
    case 'lookup':
    case 'make_words':
      return !!(p.lookup && Array.isArray(p.lookup.words) && p.lookup.words.length > 0)
    case 'make_sentence':
      return !!(p.sentence && Array.isArray(p.sentence.sentences) && p.sentence.sentences.length > 0)
    case 'tell_story':
      return !!(p.story && typeof p.story.story === 'string' && p.story.story.trim().length > 0)
    case 'draw':
      return !!(p.draw && p.draw.subject)
    case 'solve_arithmetic':
      return !!(p.arithmetic && p.arithmetic.operation && typeof p.arithmetic.a === 'number')
    default:
      // start_dictation / start_idiom / chat / unclear —— 只需 reply
      return true
  }
}

/**
 * 把已 parse 的 intent 物件組成 A1ChatResponse。
 * 先正規化常見的軟性結構化形狀偏差（claude-cli 偶爾把 story/sentence 回成純字串
 * 而非物件，導致前端 story.story 取到 undefined → 空泡泡），再驗證 payload 完整。
 * 回 null 代表 intent/reply 缺失或 payload 不完整——呼叫端應視為解析失敗。
 */
export function buildA1Response(parsed: ParsedReply): A1ChatResponse | null {
  const intent = parsed.intent
  if (!intent || !parsed.reply) return null

  // 形狀正規化：story 被回成純字串 → 包成 {topic, story} 物件
  const rawStory = parsed.story as unknown
  if (typeof rawStory === 'string') {
    parsed.story = { topic: '', story: rawStory }
  }
  // sentence 被回成純字串 → 包成 {targetWord, sentences:[...]}
  const rawSentence = parsed.sentence as unknown
  if (typeof rawSentence === 'string') {
    parsed.sentence = { targetWord: '', sentences: [rawSentence] }
  }

  if (!hasRequiredPayload(parsed)) return null

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
  return response
}

/**
 * 從模型回覆文字抽出結構化 JSON。claude-cli（OAuth 訂閱）後端不強制
 * toolChoice:required，結構化輸出是「軟性」的——模型常把 JSON 包在
 * ```json fence 或散文裡。依序嘗試：fenced code block → 第一個平衡的
 * {…} → 整段 JSON.parse。全部失敗回 null（呼叫端→走 cascade 備援）。
 */
export function extractStructuredJson(text: string): ParsedReply | null {
  if (!text) return null

  const tryParse = (s: string): ParsedReply | null => {
    // 嚴格 JSON
    try {
      const obj = JSON.parse(s)
      if (obj && typeof obj === 'object') return obj as ParsedReply
    } catch {
      /* fall through to lenient repair */
    }
    // 寬鬆修復：模型常輸出 JS 物件字面（key 未加引號），有時包在
    // StructuredOutput(...) 裡（claude-cli 軟性結構化把「呼叫工具」演成散文）。
    // 給未加引號的 key 補上雙引號後再 parse。最後手段，掉接前的搶救。
    try {
      const repaired = s
        .replace(/^\s*StructuredOutput\s*\(\s*/, '')
        .replace(/\s*\)\s*$/, '')
        .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
      const obj = JSON.parse(repaired)
      return obj && typeof obj === 'object' ? (obj as ParsedReply) : null
    } catch {
      return null
    }
  }

  // 1) ```json … ``` 或 ``` … ``` fenced block
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) {
    const p = tryParse(fence[1].trim())
    if (p) return p
  }

  // 2) 第一個 { 到最後一個 } 之間（容忍前後散文 / StructuredOutput(...) 包裝）
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first !== -1 && last > first) {
    const p = tryParse(text.slice(first, last + 1))
    if (p) return p
  }

  // 3) 整段就是 JSON / JS 物件字面
  return tryParse(text.trim())
}
