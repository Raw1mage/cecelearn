/**
 * quizFramework —— 「題型框架」單一真相源。
 *
 * 知識點 → AI 生題的契約：每科題型策略（SUBJECT_PLAN）、responseSchema、prompt、
 * viz 安全網（sanitizeViz＝「永不畫錯」的結構保證）、自驗（validate）。
 *
 * runtime（quizGenProvider，國/數/英 動態生題）與 CLI（scripts/gen-quizbank，離線
 * 補事實科題池）共用這同一份——安全網與契約只此一份，不會 drift。
 */

export type QuizItemType = 'fill' | 'choice' | 'make_word' | 'read_aloud'

export type MathVizSpec = {
  kind: 'count' | 'groups' | 'tally'
  icon?: string
  total?: number
  operation?: 'add' | 'sub'
  operand?: number
  groups?: number
  per?: number
  result?: number
  equation?: string
  /** tally：純粹要平鋪幾個 icon（數數量題，圖即題目，不顯示算式/答案）。 */
  count?: number
  /** tally/name：單元物件插畫 URL（build 預生或 runtime Imagen 生）。前端有此 URL 則平鋪此圖、無則退 emoji icon。 */
  iconUrl?: string
  /** 單元物件鍵（= 名詞 singular），供 quizGenProvider 對應 iconUrl，不直接渲染。 */
  iconKey?: string
}

export type KpInfo = {
  kpId: string
  kpName: string
  skill?: string
  difficulty: number
  /** name = 看圖說物件（圖片命名題，確定性生、繞過 Gemini，viz 用 tally 渲染單一 emoji）。 */
  vizKind: 'count' | 'groups' | 'tally' | 'name' | 'none'
}

export type StrandInfo = { subject: string; subjectName: string; grade: string }

export type GenItem = {
  qId: string
  kpId: string
  type: QuizItemType
  stem: string
  answer: string
  /** 所有應判定為正確的等價寫法（含單位變體、換算），由出題 AI 生題時一併產出。
   *  判題比對 [answer, ...acceptableAnswers] 任一命中即算對。空＝只比 answer。 */
  acceptableAnswers?: string[]
  choices?: string[]
  explain: { steps: string[]; viz?: MathVizSpec }
  source: string
  reviewed: boolean
}

export const MODEL = 'gemini-2.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

/** 機制性學科（題目可機械驗證 → 適合 runtime 動態生）。 */
export const MECHANICAL_SUBJECTS = new Set(['chinese', 'math', 'english'])
/** 事實性學科（不能機械驗證、有幻覺風險 → 走靜態審過題池）。 */
export const FACT_SUBJECTS = new Set(['science', 'social'])

type Plan = { allowedTypes: QuizItemType[]; guidance: string }

/* 每科的題型策略（加科＝加一筆） */
export const SUBJECT_PLAN: Record<string, Plan> = {
  math: {
    allowedTypes: ['fill', 'choice'],
    guidance:
      '數學題：題幹用純中文，可含數字與算式。answer 是最終數值。' +
      '盡量出應用題（情境＋算式），適合 6–9 歲。steps 一步步講解，口語、可朗讀。',
  },
  chinese: {
    allowedTypes: ['make_word', 'choice', 'fill'],
    guidance:
      '國語題：純中文不夾英文。造詞造句用 make_word，字義/詞義辨析用 choice 或 fill。' +
      'answer 是正解詞或字。steps 用淺白方式解釋為什麼。',
  },
  english: {
    allowedTypes: ['read_aloud', 'choice'],
    guidance:
      '英文題：跟讀練習用 read_aloud（stem 放要唸的英文單字或短句，answer 同 stem）；' +
      '辨義用 choice（stem 可中英對照，選項是英文）。steps 用中文解釋，適合 6–9 歲啟蒙。',
  },
  science: {
    allowedTypes: ['choice', 'fill'],
    guidance:
      '自然科事實題：以 choice 為主（4 選項、含正解）。stem 用純中文。answer 必須是科學上正確的事實——' +
      '寧可出簡單、確定無誤的題，也不要出模稜兩可或冷僻的。steps 用淺白方式解釋為什麼，適齡。',
  },
  social: {
    allowedTypes: ['choice', 'fill'],
    guidance:
      '社會科事實題：以 choice 為主（4 選項、含正解）。stem 用純中文，聚焦台灣在地、生活化、無爭議的常識。' +
      'answer 必須正確。避免時事、政治立場、會變動的數據。steps 用淺白方式解釋，適齡。',
  },
}

/* Gemini responseSchema（大寫 dialect，對齊 geminiChatProvider） */
export function buildResponseSchema(allowedTypes: QuizItemType[], wantViz: boolean): object {
  const itemProps: Record<string, unknown> = {
    type: { type: 'STRING', enum: allowedTypes },
    stem: { type: 'STRING' },
    answer: { type: 'STRING' },
    acceptableAnswers: { type: 'ARRAY', items: { type: 'STRING' } },
    choices: { type: 'ARRAY', items: { type: 'STRING' } },
    steps: { type: 'ARRAY', items: { type: 'STRING' } },
  }
  if (wantViz) {
    itemProps.viz = {
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
    }
  }
  return {
    type: 'OBJECT',
    properties: {
      items: {
        type: 'ARRAY',
        items: { type: 'OBJECT', properties: itemProps, required: ['type', 'stem', 'answer', 'steps'] },
      },
    },
    required: ['items'],
  }
}

/* Prompt：viz 欄位語意釘死，否則前端確定性 SVG 會畫錯（README 鐵律）。 */
export function buildPrompt(kp: KpInfo, strand: StrandInfo, plan: Plan, count: number): string {
  const vizLine =
    kp.vizKind && kp.vizKind !== 'none'
      ? `\n這個知識點要附「確定性圖解規格」viz，前端會照數值畫 SVG，數值必須跟題目算式完全一致：\n` +
        (kp.vizKind === 'count'
          ? `kind="count"（加減數東西）。給：total(起始數)、operation("add"或"sub")、operand(加減量)、` +
            `result(結果，必須 = total±operand)、equation(如 "8 - 3 = 5")、icon(單一 emoji，如 🍎)。`
          : `kind="groups"（乘除分組）。給：groups(組數)、per(每組數量)、result(總數，必須 = groups×per)、` +
            `equation(乘法寫 "3 × 12 = 36"；除法寫 "36 ÷ 3 = 12"，此時 groups=除數、per=商、result=被除數)、` +
            `icon(單一 emoji)。不要用文字當 icon，不要塞 total。`)
      : ''
  return (
    `你是台灣國小老師，正在為「${strand.subjectName}・${strand.grade}」出練習題。\n` +
    `知識點：${kp.kpName}（能力指標：${kp.skill || '—'}），難度 ${kp.difficulty}/3。\n` +
    `請出 ${count} 題互不重複的題目，type 從 [${plan.allowedTypes.join(', ')}] 選最合適的。\n` +
    `${plan.guidance}\n` +
    `若 type=choice：choices 給 3–4 個選項且必須包含正解，answer 等於正解選項文字。\n` +
    `若 type=fill：除了 answer（最標準寫法），還要給 acceptableAnswers——「所有應判定為正確的等價答案」` +
    `陣列，把同一個正確答案的各種合理寫法都列出來，讓判題不會因為格式不同而誤判。包含：` +
    `帶單位與不帶單位（如「3.2公尺」「3.2」）、單位換算後的等值寫法（如「320公分」「3200毫米」「3200mm」）、` +
    `中英文單位（公尺/m、公分/cm）、分數與小數互換（如「1/2」「0.5」）等。answer 本身也要在這個陣列裡。` +
    `只列「真正正確」的寫法，不要把錯的單位或錯的數值放進去。choice/make_word/read_aloud 題不需要 acceptableAnswers。\n` +
    `每題都要有 steps（講解步驟，至少 1 步，口語、適齡、可被朗讀）。` +
    vizLine
  )
}

/**
 * viz 安全網：對照不變式驗算式，不一致就回 null（剝掉圖解、保留題目）。
 * count → result = total ± operand；groups → result = groups × per。
 * 「永不畫錯」靠這裡把關，不靠模型自律。
 */
export function sanitizeViz(viz: unknown): MathVizSpec | null {
  if (!viz || typeof viz !== 'object') return null
  const v = viz as Record<string, unknown>
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : NaN)
  const icon = v.icon
  const cleanIcon = typeof icon === 'string' && [...icon].length <= 2 && !/[a-zA-Z]/.test(icon)
  const base = cleanIcon ? { icon: icon as string } : {}
  if (v.kind === 'count') {
    const total = num(v.total), operand = num(v.operand), result = num(v.result)
    if ([total, operand, result].some(Number.isNaN)) return null
    if (v.operation !== 'add' && v.operation !== 'sub') return null
    const expect = v.operation === 'add' ? total + operand : total - operand
    if (expect !== result) return null
    return { kind: 'count', total, operation: v.operation, operand, result, equation: v.equation as string | undefined, ...base }
  }
  if (v.kind === 'groups') {
    const groups = num(v.groups), per = num(v.per), result = num(v.result)
    if ([groups, per, result].some(Number.isNaN)) return null
    if (groups * per !== result) return null
    return { kind: 'groups', groups, per, result, equation: v.equation as string | undefined, ...base }
  }
  if (v.kind === 'tally') {
    // tally：純平鋪 N 個 icon（數數量題，圖即題目）。只驗 count 為正整數、icon 乾淨。
    const count = num(v.count)
    if (Number.isNaN(count) || count < 1 || !Number.isInteger(count)) return null
    // iconUrl（插畫）/ iconKey（名詞鍵）透傳：build 預生或 runtime Imagen 補的單元物件圖。
    const iconUrl = typeof v.iconUrl === 'string' && v.iconUrl.trim() ? v.iconUrl.trim() : undefined
    const iconKey = typeof v.iconKey === 'string' && v.iconKey.trim() ? v.iconKey.trim() : undefined
    return { kind: 'tally', count, ...base, ...(iconUrl ? { iconUrl } : {}), ...(iconKey ? { iconKey } : {}) }
  }
  return null
}

/** 自驗：對照契約，回錯誤清單（空＝通過）。 */
export function validate(q: GenItem, kpIds: Set<string>): string[] {
  const errs: string[] = []
  if (!kpIds.has(q.kpId)) errs.push('kpId 不在 curriculum')
  if (!q.stem) errs.push('stem 空')
  if (!q.answer) errs.push('answer 空')
  if (!q.explain?.steps?.length) errs.push('explain.steps 空')
  if (!/^(generated|authored):/.test(q.source)) errs.push('source 非 generated/authored')
  if (q.type === 'choice') {
    if (!q.choices?.length) errs.push('choice 缺 choices')
    else if (!q.choices.includes(q.answer)) errs.push('choices 不含 answer')
  }
  return errs
}

/* ------------------------------------------------------------------ */
/*  英文「數數量」題：確定性模板生題（AI 不進正確性迴圈）                 */
/*  程式選名詞+emoji、選 N、畫 N 個、答案釘死為 N 的英文數字詞。         */
/*  正確性 100% 靠程式保證——絕不問模型「畫幾個」。                      */
/* ------------------------------------------------------------------ */

/** 英文數字詞（index = 數量）。0 不用，數量題範圍 1–10。 */
const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five',
  'six', 'seven', 'eight', 'nine', 'ten',
]

/**
 * 名詞庫：6–9 歲常見、且**每個都有對應 emoji**（emoji-first，無需生圖）。
 * singular/plural 釘死英文正確複數；emoji 供前端 tally 平鋪。
 */
export type NounEntry = { singular: string; plural: string; emoji: string }
export const NOUN_BANK: NounEntry[] = [
  { singular: 'pencil', plural: 'pencils', emoji: '✏️' },
  { singular: 'apple', plural: 'apples', emoji: '🍎' },
  { singular: 'cat', plural: 'cats', emoji: '🐱' },
  { singular: 'dog', plural: 'dogs', emoji: '🐶' },
  { singular: 'ball', plural: 'balls', emoji: '⚽' },
  { singular: 'book', plural: 'books', emoji: '📕' },
  { singular: 'star', plural: 'stars', emoji: '⭐' },
  { singular: 'flower', plural: 'flowers', emoji: '🌸' },
  { singular: 'fish', plural: 'fish', emoji: '🐟' },
  { singular: 'car', plural: 'cars', emoji: '🚗' },
  { singular: 'banana', plural: 'bananas', emoji: '🍌' },
  { singular: 'balloon', plural: 'balloons', emoji: '🎈' },
  { singular: 'duck', plural: 'ducks', emoji: '🦆' },
  { singular: 'strawberry', plural: 'strawberries', emoji: '🍓' },
  { singular: 'tree', plural: 'trees', emoji: '🌳' },
  { singular: 'cookie', plural: 'cookies', emoji: '🍪' },
]

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

/**
 * 生 count 題英文數量題（確定性）：
 *  - 隨機挑名詞 + 數量 N（2–9，複數自然、好湊干擾項）。
 *  - stem 英文：「How many <plural> are there?」（真的在教英文）。
 *  - choices 英文數字詞：正解 NUMBER_WORDS[N] + 2 個不重複干擾數字詞，打散。
 *  - answer 釘死 = NUMBER_WORDS[N]。
 *  - viz: { kind:'tally', icon, count:N } → 前端平鋪 N 個 emoji（圖即題目，不洩答案）。
 *  - steps 中文講解（適齡、可朗讀）。
 * 不呼叫任何模型；count 由程式控制 → 圖裡數量永遠等於答案。
 */
export function genTallyItems(
  kp: KpInfo,
  _strand: StrandInfo,
  count: number,
  nonce = '',
): GenItem[] {
  const stamp = `generated:template@${new Date().toISOString()}`
  const nouns = shuffle(NOUN_BANK)
  const items: GenItem[] = []
  for (let i = 0; i < count; i++) {
    const noun = nouns[i % nouns.length]!
    const n = 2 + Math.floor(Math.random() * 8) // 2–9
    const answer = NUMBER_WORDS[n]!
    // 兩個干擾數字詞（1–10、≠ n、互異）
    const distractPool = shuffle(
      Array.from({ length: 10 }, (_, k) => k + 1).filter((k) => k !== n),
    ).slice(0, 2)
    const choices = shuffle([n, ...distractPool].map((k) => NUMBER_WORDS[k]!))
    items.push({
      qId: `${kp.kpId}#${nonce}t${i + 1}`,
      kpId: kp.kpId,
      type: 'choice',
      stem: `How many ${noun.plural} are there? （有幾${noun.emoji}？數數看，用英文回答）`,
      answer,
      choices,
      explain: {
        steps: [
          `我們一起數一數圖裡的 ${noun.singular}（${noun.emoji}）。`,
          `總共有 ${n} 個，英文數字是「${answer}」。`,
        ],
        viz: { kind: 'tally', icon: noun.emoji, count: n, iconKey: noun.singular },
      },
      source: stamp,
      reviewed: false,
    })
  }
  return items
}

/* ------------------------------------------------------------------ */
/*  英文「看圖說物件」題：確定性模板生題（AI 不進正確性迴圈）             */
/*  顯示一個物件 emoji 當圖，答案釘死為該物件英文名詞，繞過 Gemini。      */
/*  涵蓋 This is a ___. / What is it? / I like ___. 等圖片命名句型。      */
/* ------------------------------------------------------------------ */

/** 依 KP 句型挑題幹模板（英文題幹 + 中文小提示）。 */
function nameStemFor(kpId: string, emoji: string): string {
  if (kpId === 'eng-g3-this-is') return `This is a ___.（看圖${emoji}，這是什麼？選英文單字）`
  if (kpId === 'eng-g3-i-like') return `I like ___.（看圖${emoji}，用英文說出這個東西）`
  // eng-g4-what-is 及其他：預設用 What is it?
  return `What is it?（看圖${emoji}，用英文回答它是什麼）`
}

/**
 * 生英文「看圖說物件」題（確定性）：
 *  - 隨機挑名詞，顯示其 emoji 當圖（viz: tally count=1，前端渲染單一物件）。
 *  - stem 依 KP 句型（This is / What is it / I like）。
 *  - choices 英文名詞：正解該名詞 + 2 個不重複干擾名詞，打散。
 *  - answer 釘死 = 該名詞英文 singular。
 *  - steps 中文講解（適齡、可朗讀）。
 * 不呼叫任何模型；圖（emoji）與答案同源於 NOUN_BANK → 圖與答案永遠一致。
 */
export function genNameItems(
  kp: KpInfo,
  _strand: StrandInfo,
  count: number,
  nonce = '',
): GenItem[] {
  const stamp = `generated:template@${new Date().toISOString()}`
  const nouns = shuffle(NOUN_BANK)
  const items: GenItem[] = []
  for (let i = 0; i < count; i++) {
    const noun = nouns[i % nouns.length]!
    const answer = noun.singular
    // 兩個干擾名詞（≠ 正解、互異、有 emoji）
    const distractors = shuffle(NOUN_BANK.filter((x) => x.singular !== answer))
      .slice(0, 2)
      .map((x) => x.singular)
    const choices = shuffle([answer, ...distractors])
    items.push({
      qId: `${kp.kpId}#${nonce}n${i + 1}`,
      kpId: kp.kpId,
      type: 'choice',
      stem: nameStemFor(kp.kpId, noun.emoji),
      answer,
      choices,
      explain: {
        steps: [
          `圖裡的東西是「${noun.emoji}」。`,
          `它的英文是「${answer}」。`,
        ],
        viz: { kind: 'tally', icon: noun.emoji, count: 1, iconKey: noun.singular },
      },
      source: stamp,
      reviewed: false,
    })
  }
  return items
}

/* Gemini 呼叫（round-robin + 429 掉接 + 逾時） */
let keyIndex = 0

export async function callGemini(apiKeys: string[], prompt: string, responseSchema: object): Promise<{ items?: unknown[] }> {
  if (apiKeys.length === 0) throw new Error('缺 GEMINI_API_KEYS')
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema, temperature: 0.9 },
  })
  let lastErr = ''
  for (let attempt = 0; attempt < apiKeys.length; attempt++) {
    const idx = (keyIndex + attempt) % apiKeys.length
    try {
      const res = await fetch(`${GEMINI_URL}?key=${apiKeys[idx]}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(60000),
        body,
      })
      if (res.status === 429) { lastErr = '429'; continue }
      keyIndex = (idx + 1) % apiKeys.length
      if (!res.ok) { lastErr = `HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`; continue }
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) { lastErr = 'empty reply'; continue }
      return JSON.parse(text) as { items?: unknown[] }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(lastErr || 'all keys failed')
}

/* ------------------------------------------------------------------ */
/*  事實科：把「已確認的事實」重新包裝成新選擇題                          */
/*  釘住答案、只變選項與語句——事實題機器驗不出對錯，靠釘種子答案把關。   */
/* ------------------------------------------------------------------ */

export type FactSeed = { stem: string; answer: string }

function normFact(s: string): string {
  return s.trim().replace(/\s+/g, '').replace(/[。.！!？?、，,]$/, '')
}

function buildFactPrompt(seed: FactSeed, strand: StrandInfo): string {
  return (
    `你是台灣國小老師，為「${strand.subjectName}・${strand.grade}」出一題選擇題。\n` +
    `以下是「已確認正確」的事實，請**完全照用、不可竄改事實或答案**：\n` +
    `　題目核心：${seed.stem}\n　正確答案：${seed.answer}\n` +
    `要求：\n` +
    `1. 出 1 題 type=choice。正確答案必須**一字不差等於**「${seed.answer}」。\n` +
    `2. 另給 3 個「似是而非但確定錯誤」的干擾選項，不可與正確答案相同或同義，要符合台灣國小程度。\n` +
    `3. choices 共 4 個、打散、含正確答案；answer 欄填正確答案文字。\n` +
    `4. 題幹可換句話說、換情境，但問的事實與答案不變。\n` +
    `5. steps 用淺白中文解釋為什麼這個答案對（1–3 步、可朗讀）。`
  )
}

/**
 * 重新包裝一條事實種子成新選擇題。釘答案 + 驗選項；任一不過回 null（呼叫端退回原種子題）。
 * 這保證事實題永遠出對答案——最差是審過的原題，最好是新鮮變化。
 */
export async function reposeFact(
  apiKeys: string[],
  seed: FactSeed,
  strand: StrandInfo,
  nonce = '',
  kpId = 'fact',
): Promise<GenItem | null> {
  try {
    const schema = buildResponseSchema(['choice'], false)
    const raw = await callGemini(apiKeys, buildFactPrompt(seed, strand), schema)
    const it = (Array.isArray(raw?.items) ? raw.items[0] : null) as Record<string, unknown> | null
    if (!it) return null
    const answer = String(it.answer ?? '').trim()
    const choices = Array.isArray(it.choices) ? (it.choices as unknown[]).map(String) : []
    const steps = ((it.steps as unknown[]) || []).map((s) => String(s).trim()).filter(Boolean)
    // 釘答案：模型答案必須等於種子答案；選項含正解、至少 3 個、互異
    if (normFact(answer) !== normFact(seed.answer)) return null
    if (choices.length < 3 || !choices.some((c) => normFact(c) === normFact(seed.answer))) return null
    if (new Set(choices.map(normFact)).size !== choices.length) return null
    if (!it.stem || steps.length === 0) return null
    // 用種子答案的正規文字當正解（避免大小寫/空白歧異），確保 choices 內存在該字串
    const pinned = choices.find((c) => normFact(c) === normFact(seed.answer)) ?? seed.answer
    return {
      qId: `${kpId}#${nonce}r`,
      kpId,
      type: 'choice',
      stem: String(it.stem).trim(),
      answer: pinned,
      choices,
      explain: { steps },
      source: `generated:${MODEL}@${new Date().toISOString()}`,
      reviewed: false,
    }
  } catch {
    return null
  }
}

/**
 * 生單一知識點的 count 題：呼叫 Gemini → 套 GenItem → viz 安全網 → 回 {items, vizStripped}。
 * qId 帶 nonce 確保 runtime 多次生成不撞 id（seq 由呼叫端給，預設用索引）。
 */
export async function genForKp(
  apiKeys: string[],
  kp: KpInfo,
  strand: StrandInfo,
  count: number,
  nonce = '',
): Promise<{ items: GenItem[]; vizStripped: number }> {
  const plan = SUBJECT_PLAN[strand.subject]
  if (!plan) throw new Error(`未知 subject: ${strand.subject}`)
  const wantViz = Boolean(kp.vizKind && kp.vizKind !== 'none')
  const schema = buildResponseSchema(plan.allowedTypes, wantViz)
  const raw = await callGemini(apiKeys, buildPrompt(kp, strand, plan, count), schema)
  const rawItems = Array.isArray(raw?.items) ? raw.items : []
  const stamp = `generated:${MODEL}@${new Date().toISOString()}`
  let vizStripped = 0
  const items = rawItems.slice(0, count).map((raw, i) => {
    const it = raw as Record<string, unknown>
    const answer = String(it.answer ?? '').trim()
    const q: GenItem = {
      qId: `${kp.kpId}#${nonce}${i + 1}`,
      kpId: kp.kpId,
      type: it.type as QuizItemType,
      stem: String(it.stem || '').trim(),
      answer,
      explain: { steps: ((it.steps as unknown[]) || []).map((s) => String(s).trim()).filter(Boolean) },
      source: stamp,
      reviewed: false,
    }
    // 等價答案清單（填空題）：AI 給的所有應判對寫法，去空白去重、確保含 answer 本身。
    if (it.type === 'fill' && Array.isArray(it.acceptableAnswers)) {
      const list = (it.acceptableAnswers as unknown[]).map((a) => String(a).trim()).filter(Boolean)
      if (answer) list.push(answer)
      const uniq = [...new Set(list)]
      if (uniq.length > 0) q.acceptableAnswers = uniq
    }
    if (it.type === 'choice' && Array.isArray(it.choices)) q.choices = (it.choices as unknown[]).map(String)
    if (wantViz) {
      const clean = sanitizeViz(it.viz)
      if (clean) q.explain.viz = clean
      else if (it.viz) vizStripped++
    }
    return q
  })
  return { items, vizStripped }
}
