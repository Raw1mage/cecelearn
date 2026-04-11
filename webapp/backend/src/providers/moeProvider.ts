import type { A1LookupResponse, A1LookupWord, WordLookupProvider } from '../contracts/providers.js'

const DICT_URL = 'https://dict.concised.moe.edu.tw/search.jsp'
const IDIOM_URL = 'https://dict.idioms.moe.edu.tw/idiomList.jsp'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent'

/* ------------------------------------------------------------------ */
/*  Gemini AI — speech correction                                     */
/* ------------------------------------------------------------------ */

const GEMINI_PROMPT = `你是小學國語字典的語音校正助理。小朋友用語音說出想查的字，你要判斷他想查哪個字。

核心規則：如果是「A的B」結構，目標字一定在A裡面。B只是小朋友發的音，可能被語音辨識聽錯。你必須在A的字裡面，找讀音最接近B的那個字。

範例：
- 老師的詩 → 師（詩不在老師中，師在老師中且讀音最近）
- 老師的溼 → 師（溼不在老師中，師在老師中且讀音最近）
- 愚公移山的贏 → 移（贏不在愚公移山中，移讀音最近）
- 學校的笑 → 校（笑不在學校中，校讀音最近）
- 學校的學 → 學（學在學校中，直接採用）
- 微笑 → 笑（非「A的B」結構，取最後一個字）

重要：目標字必須是A裡面的字。絕不可以回傳A以外的字。

現在處理：{QUERY}`

/** Round-robin key index — rotates across requests */
let keyIndex = 0

/**
 * Use Gemini to correct speech recognition errors.
 * Tries each key in rotation; on 429, switches to the next key.
 */
async function geminiCorrect(query: string, apiKeys: string[]): Promise<string | null> {
  if (apiKeys.length === 0) return null
  if (query.replace(/\s+/g, '').length <= 1) return null

  const body = JSON.stringify({
    contents: [{ parts: [{ text: GEMINI_PROMPT.replace('{QUERY}', query) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: { character: { type: 'STRING' } },
        required: ['character'],
      },
    },
  })

  for (let attempt = 0; attempt < apiKeys.length; attempt++) {
    const idx = (keyIndex + attempt) % apiKeys.length
    const key = apiKeys[idx]

    try {
      const res = await fetch(`${GEMINI_URL}?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(4000),
        body,
      })

      if (res.status === 429) {
        console.warn(`[Gemini] key #${idx} rate-limited, trying next`)
        continue
      }

      // Advance round-robin for next request
      keyIndex = (idx + 1) % apiKeys.length

      if (!res.ok) {
        console.warn(`[Gemini] HTTP ${res.status}`)
        return null
      }

      const data = await res.json() as {
        candidates?: { content?: { parts?: { text?: string }[] } }[]
      }
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) return null

      const parsed = JSON.parse(text) as { character?: string }
      const char = parsed.character?.trim()
      if (char && /^[\u4e00-\u9fff]$/.test(char)) {
        console.log(`[Gemini] key #${idx}: "${query}" → ${char}`)
        return char
      }
      return null
    } catch (error) {
      console.warn(`[Gemini] key #${idx} failed:`, error instanceof Error ? error.message : error)
      continue
    }
  }

  console.warn('[Gemini] all keys exhausted')
  return null
}

/* ------------------------------------------------------------------ */
/*  Local fallback — pick character without AI                        */
/* ------------------------------------------------------------------ */

function pickCharacter(query: string): string {
  const clean = query.replace(/\s+/g, '')
  const deIdx = clean.lastIndexOf('的')
  if (deIdx >= 0) {
    const after = clean.slice(deIdx + 1)
    const match = after.match(/[\u4e00-\u9fff]/)
    if (match) return match[0]
  }
  const allCJK = clean.match(/[\u4e00-\u9fff]/g)
  return allCJK ? allCJK[allCJK.length - 1] : clean.charAt(0)
}

/* ------------------------------------------------------------------ */
/*  Gemini AI — fallback word/idiom generation                        */
/* ------------------------------------------------------------------ */

const GEMINI_WORDS_PROMPT = `為「{CHAR}」這個繁體中文字提供造詞和成語。
- words：6個常見的兩字或三字詞語，每個附注音（每字注音用空格隔開）
- idioms：6個包含此字的四字成語，每個附注音（每字注音用空格隔開）
- bopomofo：這個字本身的注音`

async function geminiFillWords(character: string, apiKeys: string[]): Promise<{ bopomofo: string; words: A1LookupWord[]; idioms: A1LookupWord[] } | null> {
  if (apiKeys.length === 0) return null

  const body = JSON.stringify({
    contents: [{ parts: [{ text: GEMINI_WORDS_PROMPT.replace('{CHAR}', character) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          bopomofo: { type: 'STRING' },
          words: { type: 'ARRAY', items: { type: 'OBJECT', properties: { term: { type: 'STRING' }, bopomofo: { type: 'STRING' } }, required: ['term', 'bopomofo'] } },
          idioms: { type: 'ARRAY', items: { type: 'OBJECT', properties: { term: { type: 'STRING' }, bopomofo: { type: 'STRING' } }, required: ['term', 'bopomofo'] } },
        },
        required: ['bopomofo', 'words', 'idioms'],
      },
    },
  })

  for (let attempt = 0; attempt < apiKeys.length; attempt++) {
    const idx = (keyIndex + attempt) % apiKeys.length
    const key = apiKeys[idx]
    try {
      const res = await fetch(`${GEMINI_URL}?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
        body,
      })
      if (res.status === 429) continue
      keyIndex = (idx + 1) % apiKeys.length
      if (!res.ok) return null

      const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) return null

      const parsed = JSON.parse(text) as { bopomofo?: string; words?: A1LookupWord[]; idioms?: A1LookupWord[] }
      console.log(`[Gemini] words fallback for "${character}": ${parsed.words?.length ?? 0} words, ${parsed.idioms?.length ?? 0} idioms`)
      return {
        bopomofo: parsed.bopomofo ?? '',
        words: (parsed.words ?? []).slice(0, 6),
        idioms: (parsed.idioms ?? []).slice(0, 6),
      }
    } catch {
      continue
    }
  }
  return null
}

/* ------------------------------------------------------------------ */
/*  MOE Dictionary scraping                                           */
/* ------------------------------------------------------------------ */

function parsePhonTags(html: string): string {
  const parts: string[] = []
  const re = /<(?:phon|nbr)>(.*?)<\/(?:phon|nbr)>/gs
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const text = m[1].replace(/<sup>(.*?)<\/sup>/g, '$1').trim()
    if (text && !text.startsWith('（')) parts.push(text)
  }
  return parts.join(' ')
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim()
}

/** Common variant ↔ standard character mappings (台灣教育部標準) */
const VARIANTS: Record<string, string> = {
  台: '臺', 裡: '裏', 群: '羣', 峰: '峯', 床: '牀',
  才: '纔', 麻: '蔴', 注: '註', 占: '佔', 线: '線',
}

/** Try the standard form if variant search fails */
function getVariant(char: string): string | null {
  return VARIANTS[char] ?? null
}

export async function fetchWords(character: string, maxResults = 6): Promise<{ bopomofo: string; words: A1LookupWord[] }> {
  const url = `${DICT_URL}?md=2&word=${encodeURIComponent(character)}&col=1`
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
  const html = await res.text()

  let charBopomofo = ''
  const words: A1LookupWord[] = []

  const rowRe = /<tr\s+data-link='dictView[^']*'[^>]*>([\s\S]*?)<\/tr>/g
  let row: RegExpExecArray | null
  while ((row = rowRe.exec(html)) !== null) {
    const rowHtml = row[1]
    const termMatch = rowHtml.match(/<a[^>]*>(.*?)<\/a>/)
    if (!termMatch) continue
    const term = stripTags(termMatch[1])
    const bopomofo = parsePhonTags(rowHtml)
    if (!bopomofo) continue

    if (term === character && !charBopomofo) {
      charBopomofo = bopomofo
      continue
    }

    if (term.length >= 2 && words.length < maxResults) {
      words.push({ term, bopomofo })
    }
  }

  return { bopomofo: charBopomofo, words }
}

export async function fetchIdioms(character: string, maxResults = 6): Promise<A1LookupWord[]> {
  const url = `${IDIOM_URL}?idiom=${encodeURIComponent(character)}`
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
  const html = await res.text()

  const idioms: A1LookupWord[] = []
  const re = /data-idiom='([^']+)'\s+data-phonetic='([^']+)'/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null && idioms.length < maxResults) {
    const term = m[1]
    const rawPhonetic = m[2].split('（變）')[0]
    const bopomofo = rawPhonetic.replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim()
    idioms.push({ term, bopomofo })
  }

  return idioms
}

/* ------------------------------------------------------------------ */
/*  Provider                                                          */
/* ------------------------------------------------------------------ */

export class MoeWordLookupProvider implements WordLookupProvider {
  private apiKeys: string[]

  constructor(apiKeys: string[] = []) {
    this.apiKeys = apiKeys
    if (apiKeys.length > 0) {
      console.log(`[MoeProvider] Gemini enabled with ${apiKeys.length} API key(s)`)
    } else {
      console.log('[MoeProvider] Gemini disabled (no API keys), using local fallback')
    }
  }

  async lookup(query: string): Promise<A1LookupResponse> {
    let aiChar = await geminiCorrect(query, this.apiKeys)

    // Validate: for "A的B" pattern, AI result must be in A
    const clean = query.replace(/\s+/g, '')
    const deIdx = clean.lastIndexOf('的')
    if (aiChar && deIdx >= 0) {
      const contextA = clean.slice(0, deIdx)
      if (!contextA.includes(aiChar)) {
        console.warn(`[MoeProvider] AI returned "${aiChar}" but it's not in "${contextA}", rejecting`)
        aiChar = null
      }
    }

    const character = aiChar ?? pickCharacter(query)

    // Step 2: Fetch dictionary data (retry with variant if no results)
    try {
      let [dictResult, idioms] = await Promise.all([
        fetchWords(character),
        fetchIdioms(character),
      ])

      // If no results, try the standard variant (e.g., 台 → 臺)
      const variant = getVariant(character)
      if (dictResult.words.length === 0 && variant) {
        console.log(`[MoeProvider] "${character}" no results, trying variant "${variant}"`)
        const [varDict, varIdioms] = await Promise.all([
          fetchWords(variant),
          fetchIdioms(variant),
        ])
        if (varDict.words.length > 0) {
          dictResult = varDict
          if (varIdioms.length > 0) idioms = varIdioms
        }
      }

      // Step 3: If dictionary results are sparse, fill with Gemini
      let { bopomofo } = dictResult
      let { words } = dictResult
      const needMoreWords = words.length < 4
      const needMoreIdioms = idioms.length < 4
      if (needMoreWords || needMoreIdioms) {
        const aiWords = await geminiFillWords(character, this.apiKeys)
        if (aiWords) {
          if (!bopomofo) bopomofo = aiWords.bopomofo
          if (needMoreWords) words = aiWords.words
          if (needMoreIdioms) idioms = aiWords.idioms
        }
      }

      return {
        ok: true,
        query,
        character,
        bopomofo,
        words,
        idioms,
      }
    } catch (error) {
      console.warn('[MoeProvider] fetch failed:', error instanceof Error ? error.message : error)
      // Last resort: try Gemini for everything
      const aiWords = await geminiFillWords(character, this.apiKeys)
      if (aiWords) {
        return { ok: true, query, character, ...aiWords }
      }
      return {
        ok: true,
        query,
        character,
        bopomofo: '',
        words: [],
        idioms: [],
        note: '查詢失敗，請稍後再試。',
      }
    }
  }
}
