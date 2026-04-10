import type { A1LookupResponse, A1LookupWord, WordLookupProvider } from '../contracts/providers.js'

const DICT_URL = 'https://dict.concised.moe.edu.tw/search.jsp'
const IDIOM_URL = 'https://dict.idioms.moe.edu.tw/idiomList.jsp'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent'

/* ------------------------------------------------------------------ */
/*  Gemini AI — speech correction                                     */
/* ------------------------------------------------------------------ */

const GEMINI_PROMPT = `你是語音校正助理。規則：使用者說「A的B」，檢查B是否在A中。如果B不在A中，在A中找讀音最接近B的字。範例：老師的詩 → 師。愚公移山的贏 → 移。學校的笑 → 校。如果B在A中，目標就是B。範例：學校的學 → 學。如果是單字或詞語，取最後一個字。範例：微笑 → 笑。現在處理：{QUERY}`

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

async function fetchWords(character: string, maxResults = 6): Promise<{ bopomofo: string; words: A1LookupWord[] }> {
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

async function fetchIdioms(character: string, maxResults = 6): Promise<A1LookupWord[]> {
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
    const [aiChar] = await Promise.all([
      geminiCorrect(query, this.apiKeys),
    ])
    const character = aiChar ?? pickCharacter(query)

    // Step 2: Fetch dictionary data
    try {
      const [dictResult, idioms] = await Promise.all([
        fetchWords(character),
        fetchIdioms(character),
      ])

      return {
        ok: true,
        query,
        character,
        bopomofo: dictResult.bopomofo || '',
        words: dictResult.words,
        idioms,
      }
    } catch (error) {
      console.warn('[MoeProvider] fetch failed:', error instanceof Error ? error.message : error)
      return {
        ok: true,
        query,
        character,
        bopomofo: '',
        words: [],
        idioms: [],
        note: '查詢教育部辭典失敗，請稍後再試。',
      }
    }
  }
}
