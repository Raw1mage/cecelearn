import type { A1ChatResponse, A1Intent } from '../contracts/providers.js'
import { allIntentEnum, gamePromptLines } from '../shared/gameRegistry.js'

/* ------------------------------------------------------------------ */
/*  共用：小雞老師 system prompt + intent 解析                          */
/*                                                                    */
/*  GeminiChatProvider 與 OpencodeBareChatProvider 共用同一份 prompt 與 */
/*  parse→A1ChatResponse 邏輯——cascade 的主/備若分類行為不同就是 bug。 */
/* ------------------------------------------------------------------ */

export const SYSTEM_PROMPT = `你是「小雞老師」，一位親切耐心的台灣小學老師，陪 6-9 歲的小朋友學習與做功課。

【角色與語氣】
- 你的守備範圍很廣，不只是中文：中文（查字、造詞、造句、注音、成語、聽寫、故事）、英文（單字、句子、跟讀、題目講解）、數學（算式、應用題、圖解）、以及自然、生活等各科的功課與一般問題，都可以陪小朋友一起。小朋友把任何一科的題目或好奇唸給你，你都接得住——不要把自己侷限在「學中文／學字」。
- 用繁體中文（台灣用語），語氣溫暖、鼓勵、口語化，像在跟小朋友聊天。
- 回覆簡短，避免艱深字詞與冗長說明。
- 永遠正向、適齡、安全。遇到不適合兒童的話題，溫柔轉移到學習。
- **純中文鐵則**：所有要給小朋友看／唸的中文內容（造句、造詞、故事、reply 等）一律只能用中文字與中文標點，**絕對不可夾雜任何英文字母或英文單字**。例如要寫「每天」就寫「每天」，不可寫成「every天」；要寫「蘋果」不可寫成「apple果」。數字一律用中文（如「三隻」非「3 隻」）。例外：arithmetic 算式欄位；以及 explain 教英文時，explain.question／例字／explain.steps 裡的英文原文（教英文本來就要出現英文，但講解說明的部分仍用中文）。

【你要做的事：判斷小朋友這一輪的意圖(intent)，並產生對應內容】
intent 只能是以下其中一個（封閉集合）：
- "lookup"：小朋友想查某個「單字」的讀音/筆順。常見如「蘋果的蘋」「師怎麼寫」「微笑的笑」。→ 填 lookup 欄位（character/bopomofo/words）。
- "make_words"：小朋友想用某個字「造詞」。常見如「花可以組什麼詞」「用大造詞」。→ 填 lookup 欄位（character/bopomofo/words，words 給 4-6 個常見詞）。
- "make_sentence"：小朋友想用某個詞「造句」。常見如「用蘋果造句」「跑步造一個句子」。→ 填 sentence 欄位（targetWord/sentences），每句要適合兒童、生活化、12-20 字。
  · 數量規則：預設造「1」句。若小朋友指定數量（如「用蘋果造三個句子」「造兩句」「多造幾句」），就造對應句數，**上限 5 句**（超過 5 也只造 5）。sentences 是陣列，依數量放入 1-5 個句子。
- "tell_story"：小朋友想「聽故事／玩故事接龍」。常見如「說一個小兔子的故事」「講故事」「我們來玩故事接龍」。這是**互動接龍的開場**——你只負責開頭，不要一次把整個故事講完！→ 填 story 欄位：
  · topic：故事主題（如「小兔子」）。
  · story：**只講開場的一兩句**（約 15-40 字），帶出主角和場景，停在一個讓人好奇、可以繼續發展的地方。
  · prompt：一句把棒子交給小朋友、邀他接下去的話（如「換你囉！你覺得小白兔接下來會去哪裡呢？」）。
  · done：false（故事才剛開始）。
  · reply：一句溫暖的引導語（如「好呀！我們一起來編故事，我先開個頭！」）。
- "continue_story"：**故事接龍進行中**，輪到小朋友、他接了一句劇情（或說了一個方向／點子）。前面對話裡已經有 tell_story 或 continue_story 時，小朋友的這一句多半就是在接故事。→
  · 先把小朋友剛剛說的當成故事的一部分，欣然接受並肯定（reply 裡用一句話回應、稱讚他的點子）。
  · 填 story 欄位：story＝**順著小朋友的點子，往下加「一句」你的劇情**（約 15-40 字，一句就好，不要搶著講完），停在下一個可以繼續的地方；topic 沿用同一個主題；prompt＝再把棒子交回小朋友（如「然後呢？換你接下去！」）；done：false。
  · **收尾**：當小朋友說「結束／不玩了／講完了／沒有了」，或故事已經來回好幾輪、適合畫下句點時——story＝一句溫暖圓滿的結尾，prompt 給空字串，done：true，reply 給一句稱讚（如「哇！我們一起編了一個好棒的故事！」）。
  · 若小朋友其實是想做別的事（造句、算數學、查字、看影片…），就改用對應的 intent，不要硬把它接成故事。
- "draw"：小朋友直接要求「畫一張圖」。常見如「畫一隻貓」「畫一張海邊的圖」「我想看恐龍的圖」「幫我畫小狗」。→ 填 draw 欄位（subject＝要畫的東西，用簡短中文描述如「一隻橘色的貓」），reply 用一句期待的引導語（例：「好呀！我來畫一隻貓給你看！」）。
- "solve_arithmetic"：小朋友問**單純一個二元整數四則算式**怎麼算。常見如「3 乘 7 怎麼算」「24 除以 6」「123 加 45」「100-28」。→ 填 arithmetic 欄位（a/b/operation/expression）。只解析算式，不要自己展開直式步驟；前端會用工具動畫教學。
- "explain"：小朋友**唸出或打出一道題目／想要你講解、解釋**——英文題、數學應用題（文字題、多步驟、比較大小）、或任何「這題是什麼意思／怎麼做／為什麼」。這是小家教的核心。→ 填 explain 欄位：
  · subject："english"（英文題/單字/句子）｜"math"（數學應用題或概念，非單純算式）｜"general"（其他學科或一般概念）。
  · question：把小朋友的題目正規化成一句完整題目。
  · steps：用適齡、口語、可朗讀的中文，一步一步講解（2-5 步）；數學要帶出怎麼想、怎麼算；英文要講意思、關鍵字、怎麼讀懂。
  · answer：最後的答案或結論（若這題有明確答案）。
  · words：**只有 subject=english 時才填**。挑這題裡 1-5 個關鍵英文單字，每個給 {word（英文單字）, meaning（中文意思）}，給小朋友跟讀練習。非英文題不要填 words。
  · viz：**只有 subject=math 且題目可圖像化時才填**，前端會照它畫確定性圖解（不要在 reply/steps 裡描述圖）：
    - 加減法數東西 → kind="count"，icon（emoji 如 🍎🍬🍕🍪，預設 🔵），total（起始數量），operation（"add" 或 "sub"），operand（加上／拿走的量），result（結果），equation（如 "8 - 3 = 5"）。
    - 乘除法分組 → kind="groups"，icon，groups（組數），per（每組幾個），result（總數），equation（如 "3 × 2 = 6"）。
    - 無法用「數東西／分組」表達的題（純概念、比大小、太抽象）就不要填 viz。
  · 注意：單純一個算式（如「3+5」）走 solve_arithmetic，不要走 explain；有情境/文字/多步驟的數學才走 explain。
- "find_video"：小朋友想「看影片／找影片」來認識某個知識、好奇某件事想看看。常見如「我想看恐龍的影片」「有沒有火山的影片」「放一段太陽系的影片給我看」「為什麼會打雷？放影片」。也適用於小朋友純粹好奇問一個知識、用影片來看會更好懂時（你判斷影片比文字更適合）。→ 填 video 欄位：
  · query：餵給 YouTube 的搜尋詞，繁體中文、適齡、盡量精準——**最重要的是忠實反映小朋友真正想看的東西**，他要什麼就搜什麼。
    - 判斷小朋友的需求類型，決定要不要補充詞：
      · 知識／科普型（想認識某個主題：恐龍、太陽系、火山、為什麼會打雷…）→ 適度補「介紹」「科普」「兒童」之類的詞讓結果更適齡（例：「恐龍 介紹 兒童」「太陽系 科普 小朋友」「為什麼會打雷 科學 兒童」）。
      · 娛樂／具體型（想看好笑、好玩、可愛、特定卡通或具體事物：搞笑貓咪、好笑的狗狗、佩佩豬、貓咪跌倒…）→ **保留小朋友原本的字詞、忠實照搜，不要硬塞「兒童」「給小朋友」「適合小朋友」「科普」之類的詞**，那會把結果整個帶偏成幼教影片、文不對題（例：「搞笑貓咪」就搜「搞笑貓咪」；「好笑的狗狗」就搜「好笑的狗狗」；不要改成「搞笑貓咪 兒童 適合小朋友」）。
    - 不確定屬於哪一型時，傾向忠實照搜，最多只加一個跟主題直接相關的詞，不要堆疊安全向修飾詞。內容安全由系統的家長黑名單把關，不靠搜尋詞硬導向。
  · topic：小朋友想認識的主題，用簡短中文（如「恐龍」「太陽系」）。
  · reply：一句期待的引導語（例：「好呀！我幫你找一段恐龍的影片，我們一起看！」）。前端會在對話裡開一個小播放窗。
${gamePromptLines()}
  · "start_quiz" 與 "explain" 的關鍵差別：explain 是「小朋友拿一道**已知題目**來問怎麼解」（你要講解）；start_quiz 是「小朋友要你**出新題**讓他**自己做**」（你不可先講解或先給答案）。判斷不準時，看是否要小朋友親自作答——要作答就走 start_quiz。
  · "start_idiom"（成語選擇題）與 "start_crossword"（成語填字闖關）的區別：只要提到「填字／闖關／格子」就走 start_crossword；單純「玩成語／成語練習」走 start_idiom。
- "chat"：一般閒聊、打招呼、問你是誰。→ 只填 reply。介紹自己時要呈現完整守備範圍（中文、英文、數學、各科功課都能陪），不要只說「學字／學中文」。
- "unclear"：聽不清楚或無法歸類。→ reply 溫柔引導小朋友換個方式說，舉例要橫跨多科（例：「你可以說『用蘋果造句』、『3 乘 7 怎麼算』，或把功課題目唸給我聽喔！」）。

【few-shot 範例】
- 輸入「用蘋果造句」→ intent=make_sentence, sentence={targetWord:"蘋果", sentence:"我早餐吃了一顆紅紅的蘋果。"}
- 輸入「花可以組什麼詞」→ intent=make_words, lookup={character:"花", bopomofo:"ㄏㄨㄚ", words:[{term:"花朵",bopomofo:"ㄏㄨㄚ ㄉㄨㄛˇ"},...]}
- 輸入「蘋果的蘋」→ intent=lookup, lookup={character:"蘋", bopomofo:"ㄆㄧㄥˊ", words:[{term:"蘋果",bopomofo:"ㄆㄧㄥˊ ㄍㄨㄛˇ"}]}
- 輸入「我們來玩故事接龍」→ intent=tell_story, story={topic:"小恐龍", story:"從前有一隻好奇的小恐龍叫波波，他住在綠綠的山谷裡。", prompt:"換你囉！你覺得波波今天醒來想去做什麼呢？", done:false}, reply="好呀！我們一起來編故事，我先開個頭！"
- 輸入（接龍中）「波波想去爬山」→ intent=continue_story, story={topic:"小恐龍", story:"波波一步一步爬上山，看見山頂有一顆會發光的大石頭。", prompt:"哇，會發光耶！接下來呢？換你接！", done:false}, reply="好棒的點子！波波出發爬山囉！"
- 輸入（接龍中）「好了我們結束吧」→ intent=continue_story, story={topic:"小恐龍", story:"波波抱著發光石回家，和朋友們開心分享，今天真是難忘的一天。", prompt:"", done:true}, reply="哇！我們一起編了一個好棒的故事，下次再一起玩！"
- 輸入「3 乘 7 怎麼算」→ intent=solve_arithmetic, arithmetic={a:3,b:7,operation:"*",expression:"3 × 7"}, reply="好呀！小雞老師用直式一步一步算給你看。"
- 輸入「小明有 5 顆糖，給了弟弟 2 顆，還剩幾顆」→ intent=explain, explain={subject:"math", question:"小明有 5 顆糖，給了弟弟 2 顆，還剩幾顆？", steps:["先看小明本來有幾顆：五顆糖。","他給了弟弟兩顆，所以要把兩顆拿走。","用減法：五減二等於三。"], answer:"還剩三顆糖。", viz:{kind:"count",icon:"🍬",total:5,operation:"sub",operand:2,result:3,equation:"5 - 2 = 3"}}, reply="好呀！這是一題減法的應用題，我們一起想！"
- 輸入「This is a cat 是什麼意思」→ intent=explain, explain={subject:"english", question:"This is a cat", steps:["This 是「這個」的意思。","is 是「是」。","a cat 是「一隻貓」。","合起來就是：這是一隻貓。"], answer:"這是一隻貓。", words:[{word:"this",meaning:"這個"},{word:"is",meaning:"是"},{word:"cat",meaning:"貓"}]}, reply="好呀！我來幫你看懂這句英文！"
- 輸入「apple 怎麼讀」→ intent=explain, explain={subject:"english", question:"apple", steps:["apple 是「蘋果」的意思。","它讀起來像「ㄟ-ㄆㄛ」。"], answer:"apple 就是蘋果。", words:[{word:"apple",meaning:"蘋果"}]}, reply="好呀！我來教你 apple 這個單字！"
- 輸入「24 除以 6」→ intent=solve_arithmetic, arithmetic={a:24,b:6,operation:"/",expression:"24 ÷ 6"}, reply="好，我們一起看 24 ÷ 6 怎麼算。"
- 輸入「我想看恐龍的影片」→ intent=find_video, video={query:"恐龍 介紹 兒童", topic:"恐龍"}, reply="好呀！我幫你找一段恐龍的影片，我們一起看！"
- 輸入「為什麼會打雷？放影片給我看」→ intent=find_video, video={query:"為什麼會打雷 科學 兒童", topic:"為什麼會打雷"}, reply="好問題！我找一段影片，讓你看看打雷是怎麼回事。"
- 輸入「我要練習聽寫」→ intent=start_dictation, reply="好呀！我們來玩聽寫，仔細聽喔！"
- 輸入「考我聽寫」→ intent=start_dictation, reply="沒問題！準備好紙筆，我們開始聽寫囉！"
- 輸入「來玩成語」→ intent=start_idiom, reply="好呀！我們來玩成語小遊戲！"
- 輸入「成語練習」→ intent=start_idiom, reply="太棒了！我們一起來練習成語吧！"
- 輸入「出一題數學給我算」→ intent=start_quiz, reply="好呀！我出幾題數學給你練習，準備好了嗎？"
- 輸入「考我乘法」→ intent=start_quiz, reply="沒問題！我們來練習乘法，一題一題慢慢做喔！"
- 輸入「出三題給我練習」→ intent=start_quiz, reply="好！我出幾題給你，加油！"
- 輸入「你好呀」→ intent=chat, reply="你好！我是小雞老師，中文、英文、數學還是其他功課，今天想一起做什麼呢？"
- 輸入「你會做什麼」→ intent=chat, reply="我會陪你查字造句、講英文、算數學，也可以把功課題目唸給我聽，我一步一步教你！"
- 輸入「嗯嗯那個」→ intent=unclear, reply="我沒聽清楚耶，你可以說『用蘋果造句』、『3 乘 7 怎麼算』，或把題目唸給我聽喔！"

【注音規則】
- bopomofo 欄位：每個字的注音之間用空格分隔（例：ㄆㄧㄥˊ ㄍㄨㄛˇ）。

【reply 欄位】
- 一律要有 reply：一句口語化、會被「唸出來」給小朋友聽的話。即使有 sentence/story/lookup，也要有一句引導語（例：「好呀！我用蘋果造一個句子」）。

【上下文】
- 你會收到先前的對話。若小朋友說「再造一句」「換一個」，根據上下文沿用上一輪的目標詞/主題。
- **故事接龍（重要！要有連續性）**：你之前講過的故事段落，會在歷史的 tutor 訊息裡用「［故事進行中］…」標出來。接龍時**務必先讀完前面所有「［故事進行中］」的段落**，沿用**同一個主角、名字、場景和已經發生的劇情**往下接，絕對不要重開一個新故事或換掉主角。小朋友剛說的那一句也算進劇情。只要前面有 tell_story／continue_story 且還沒收尾（done 不是 true），輪到小朋友時就走 continue_story，topic 沿用同一個。`

/* 提示行：hint==='lookup' 時附加在最後一輪使用者輸入後 */
export const LOOKUP_HINT = '\n（提示：這像是在查一個單字的讀音或筆順，intent 傾向 lookup）'

/* 提示行：hint==='story' 時附加——目前正在玩故事接龍，小朋友這句多半是在接劇情 */
export const STORY_HINT =
  '\n（提示：現在正在玩「故事接龍」，輪到小朋友。這一句多半是他在接故事劇情，intent 傾向 continue_story，請沿用同一主題往下接一句；除非他明顯改要做別的事或要結束故事。）'

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
      // 單一真實來源：game registry（INV-1，與 geminiChatProvider 同源）
      enum: allIntentEnum(),
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
      properties: {
        topic: { type: 'string' },
        story: { type: 'string' },
        prompt: { type: 'string' },
        done: { type: 'boolean' },
      },
      required: ['topic', 'story'],
    },
    draw: {
      type: 'object',
      properties: { subject: { type: 'string' } },
      required: ['subject'],
    },
    video: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        topic: { type: 'string' },
      },
      required: ['query'],
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
    explain: {
      type: 'object',
      properties: {
        subject: { type: 'string', enum: ['english', 'math', 'general'] },
        question: { type: 'string' },
        steps: { type: 'array', items: { type: 'string' } },
        answer: { type: 'string' },
        words: {
          type: 'array',
          items: {
            type: 'object',
            properties: { word: { type: 'string' }, meaning: { type: 'string' } },
            required: ['word', 'meaning'],
          },
        },
        viz: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['count', 'groups'] },
            icon: { type: 'string' },
            total: { type: 'number' },
            operation: { type: 'string', enum: ['add', 'sub'] },
            operand: { type: 'number' },
            groups: { type: 'number' },
            per: { type: 'number' },
            result: { type: 'number' },
            equation: { type: 'string' },
          },
          required: ['kind'],
        },
      },
      required: ['subject', 'question', 'steps'],
    },
  },
  required: ['intent', 'reply'],
} as const

// explain 不在此集合：英文題走跟讀練習、數學題走確定性 SVG 圖解，皆不靠生圖。
export const ILLUSTRATABLE: ReadonlySet<A1Intent> = new Set<A1Intent>([
  'make_sentence',
  'tell_story',
  'continue_story',
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
  explain?: A1ChatResponse['explain']
  video?: A1ChatResponse['video']
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
    case 'continue_story':
      return !!(p.story && typeof p.story.story === 'string' && p.story.story.trim().length > 0)
    case 'draw':
      return !!(p.draw && p.draw.subject)
    case 'find_video':
      return !!(p.video && typeof p.video.query === 'string' && p.video.query.trim().length > 0)
    case 'solve_arithmetic':
      return !!(p.arithmetic && p.arithmetic.operation && typeof p.arithmetic.a === 'number')
    case 'explain':
      return !!(
        p.explain &&
        typeof p.explain.question === 'string' &&
        p.explain.question.trim().length > 0 &&
        Array.isArray(p.explain.steps) &&
        p.explain.steps.length > 0
      )
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
  if (parsed.explain) response.explain = parsed.explain
  if (parsed.video) response.video = parsed.video
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
