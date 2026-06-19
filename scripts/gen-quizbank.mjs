#!/usr/bin/env node
/**
 * gen-quizbank — 泛化型生題器
 *
 * 讀 webapp/backend/data/curriculum.json 的知識點骨架，逐 kpId 叫 Gemini 2.5 Flash
 * 生 N 題，套 QuizItem（webapp/backend/data/curriculum.schema.json），蓋 provenance
 * source=generated:<model>@<iso>，輸出 quizbank.json。
 *
 * 設計原則：
 *  - subject-agnostic：每科的題型/圖解策略集中在 SUBJECT_PLAN，加科只改這張表。
 *  - 版權乾淨：題目全是即時生成物，source 一律 generated:*，永不夾帶第三方題庫原文。
 *  - 可續跑：已達標的 kpId 直接跳過（--force 才重生），中途斷了再跑不浪費額度。
 *  - 自驗：寫檔前對照契約（kpId 存在、choice 有含答案的選項、math 圖解規格合法）。
 *
 * 用法：
 *   GEMINI_API_KEYS=key1,key2 node scripts/gen-quizbank.mjs [flags]
 *     --subject=math|chinese|english   只生某科（可省＝全部）
 *     --grade=3年級                    只生某年級
 *     --kp=math-g3-mul-2x1-nocarry     只生單一知識點
 *     --count=5                        每個知識點題數（預設 5）
 *     --force                          已達標也重生（預設跳過）
 *     --dry-run                        不寫檔，印出前兩題樣本
 *     --concurrency=3                  同時併發的知識點數（預設 3）
 *     --out=<path>                     輸出路徑（預設 data/quizbank.json）
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = resolve(__dirname, '..', 'webapp', 'backend', 'data')
const MODEL = 'gemini-2.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

/* ------------------------------------------------------------------ */
/*  CLI                                                                */
/* ------------------------------------------------------------------ */
function parseArgs(argv) {
  const a = { count: 5, concurrency: 3, force: false, dryRun: false }
  for (const tok of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(tok)
    if (!m) continue
    const [, k, v] = m
    if (k === 'force') a.force = true
    else if (k === 'dry-run') a.dryRun = true
    else if (k === 'count' || k === 'concurrency') a[k] = Number(v)
    else if (k === 'subject' || k === 'grade' || k === 'kp' || k === 'out') a[k] = v
  }
  return a
}
const args = parseArgs(process.argv.slice(2))
const OUT = args.out ? resolve(args.out) : resolve(DATA_DIR, 'quizbank.json')

/* ------------------------------------------------------------------ */
/*  每科的生題策略（加科＝加一筆）                                       */
/* ------------------------------------------------------------------ */
const SUBJECT_PLAN = {
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

/* ------------------------------------------------------------------ */
/*  Gemini responseSchema（大寫 dialect，對齊 geminiChatProvider）        */
/* ------------------------------------------------------------------ */
function buildResponseSchema(allowedTypes, wantViz) {
  const itemProps = {
    type: { type: 'STRING', enum: allowedTypes },
    stem: { type: 'STRING' },
    answer: { type: 'STRING' },
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

/* ------------------------------------------------------------------ */
/*  Prompt                                                             */
/* ------------------------------------------------------------------ */
function buildPrompt(kp, strand, plan, count) {
  // viz 欄位語意必須釘死，否則前端確定性 SVG 會畫錯（README 鐵律）。
  // 不變式：count → result = total ± operand；groups → result = groups × per。
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
    `每題都要有 steps（講解步驟，至少 1 步，口語、適齡、可被朗讀）。` +
    vizLine
  )
}

/* ------------------------------------------------------------------ */
/*  Gemini 呼叫（round-robin + 429 掉接 + 逾時重試）                      */
/* ------------------------------------------------------------------ */
const KEYS = (process.env.GEMINI_API_KEYS || '').split(',').map((k) => k.trim()).filter(Boolean)
let keyIndex = 0
let vizStripped = 0 // 被安全網剝掉的不一致圖解數

async function callGemini(prompt, responseSchema) {
  if (KEYS.length === 0) throw new Error('缺 GEMINI_API_KEYS')
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema, temperature: 0.9 },
  })
  let lastErr = ''
  for (let attempt = 0; attempt < KEYS.length; attempt++) {
    const idx = (keyIndex + attempt) % KEYS.length
    try {
      const res = await fetch(`${GEMINI_URL}?key=${KEYS[idx]}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(60000),
        body,
      })
      if (res.status === 429) {
        lastErr = '429'
        continue
      }
      keyIndex = (idx + 1) % KEYS.length
      if (!res.ok) {
        lastErr = `HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`
        continue
      }
      const data = await res.json()
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) {
        lastErr = 'empty reply'
        continue
      }
      return JSON.parse(text)
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(lastErr || 'all keys failed')
}

/* ------------------------------------------------------------------ */
/*  生單一知識點                                                       */
/* ------------------------------------------------------------------ */
function nowIso() {
  return new Date().toISOString()
}

/**
 * viz 安全網：對照不變式驗算式，不一致就回 null（剝掉圖解、保留題目）。
 * 這是「永不畫錯」的結構保證——不靠模型自律，靠 generator 把關。
 */
function sanitizeViz(viz) {
  if (!viz || typeof viz !== 'object') return null
  const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : NaN)
  // icon 只收單一 emoji；文字描述（'pie slice'）一律丟棄
  const cleanIcon = typeof viz.icon === 'string' && [...viz.icon].length <= 2 && !/[a-zA-Z]/.test(viz.icon)
  const base = cleanIcon ? { icon: viz.icon } : {}
  if (viz.kind === 'count') {
    const total = num(viz.total), operand = num(viz.operand), result = num(viz.result)
    if ([total, operand, result].some(Number.isNaN)) return null
    if (viz.operation !== 'add' && viz.operation !== 'sub') return null
    const expect = viz.operation === 'add' ? total + operand : total - operand
    if (expect !== result) return null
    return { kind: 'count', total, operation: viz.operation, operand, result, equation: viz.equation, ...base }
  }
  if (viz.kind === 'groups') {
    const groups = num(viz.groups), per = num(viz.per), result = num(viz.result)
    if ([groups, per, result].some(Number.isNaN)) return null
    if (groups * per !== result) return null
    return { kind: 'groups', groups, per, result, equation: viz.equation, ...base }
  }
  return null
}

async function genForKp(kp, strand, count) {
  const plan = SUBJECT_PLAN[strand.subject]
  if (!plan) throw new Error(`未知 subject: ${strand.subject}`)
  const wantViz = Boolean(kp.vizKind && kp.vizKind !== 'none')
  const schema = buildResponseSchema(plan.allowedTypes, wantViz)
  const raw = await callGemini(buildPrompt(kp, strand, plan, count), schema)
  const items = Array.isArray(raw?.items) ? raw.items : []
  const stamp = `generated:${MODEL}@${nowIso()}`
  return items.slice(0, count).map((it, i) => {
    const q = {
      qId: `${kp.kpId}#${i + 1}`,
      kpId: kp.kpId,
      type: it.type,
      stem: String(it.stem || '').trim(),
      answer: String(it.answer ?? '').trim(),
      explain: { steps: (it.steps || []).map((s) => String(s).trim()).filter(Boolean) },
      source: stamp,
      reviewed: false,
    }
    if (it.type === 'choice' && Array.isArray(it.choices)) q.choices = it.choices.map(String)
    if (wantViz) {
      const clean = sanitizeViz(it.viz)
      if (clean) q.explain.viz = clean
      else if (it.viz) vizStripped++ // 算式對不上 → 寧可無圖也不畫錯
    }
    return q
  })
}

/* ------------------------------------------------------------------ */
/*  自驗（對照契約，過不了就剔除並回報）                                 */
/* ------------------------------------------------------------------ */
function validate(q, kpIds) {
  const errs = []
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
/*  併發控制                                                           */
/* ------------------------------------------------------------------ */
async function mapLimit(items, limit, fn) {
  const out = []
  let i = 0
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx], idx)
    }
  })
  await Promise.all(workers)
  return out
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */
async function main() {
  const curriculum = JSON.parse(readFileSync(resolve(DATA_DIR, 'curriculum.json'), 'utf-8'))

  // 攤平成 (kp, strand) 工作清單，套篩選
  const kpIds = new Set()
  let work = []
  for (const strand of curriculum.strands) {
    for (const unit of strand.units) {
      for (const kp of unit.knowledgePoints) {
        kpIds.add(kp.kpId)
        if (args.subject && strand.subject !== args.subject) continue
        if (args.grade && strand.grade !== args.grade) continue
        if (args.kp && kp.kpId !== args.kp) continue
        work.push({ kp, strand })
      }
    }
  }

  // 載入既有題庫（續跑）
  let bank = []
  if (existsSync(OUT)) {
    try {
      bank = JSON.parse(readFileSync(OUT, 'utf-8'))
    } catch {
      bank = []
    }
  }
  const haveCount = new Map()
  for (const q of bank) haveCount.set(q.kpId, (haveCount.get(q.kpId) || 0) + 1)

  // 跳過已達標
  if (!args.force) {
    const before = work.length
    work = work.filter(({ kp }) => (haveCount.get(kp.kpId) || 0) < args.count)
    const skipped = before - work.length
    if (skipped) console.log(`↩  跳過 ${skipped} 個已達標知識點（--force 可重生）`)
  }

  if (work.length === 0) {
    console.log('沒有要生的知識點（檢查篩選條件或已全部達標）。')
    return
  }
  console.log(`▶  生題：${work.length} 個知識點 × ${args.count} 題，併發 ${args.concurrency}，模型 ${MODEL}`)
  if (KEYS.length === 0) {
    console.error('✗ 缺 GEMINI_API_KEYS，無法呼叫模型。設定後重跑：GEMINI_API_KEYS=... node scripts/gen-quizbank.mjs')
    process.exit(1)
  }

  let okKp = 0,
    failKp = 0,
    dropped = 0
  const fresh = []
  await mapLimit(work, args.concurrency, async ({ kp, strand }) => {
    try {
      const items = await genForKp(kp, strand, args.count)
      const valid = []
      for (const q of items) {
        const errs = validate(q, kpIds)
        if (errs.length) {
          dropped++
          console.warn(`  ⚠ ${q.qId} 剔除：${errs.join('；')}`)
        } else valid.push(q)
      }
      fresh.push(...valid)
      okKp++
      console.log(`  ✓ ${kp.kpId} → ${valid.length}/${items.length} 題`)
    } catch (e) {
      failKp++
      console.warn(`  ✗ ${kp.kpId} 失敗：${e instanceof Error ? e.message : e}`)
    }
  })

  console.log(
    `\n完成：知識點 OK ${okKp} / 失敗 ${failKp}｜新題 ${fresh.length}｜剔除 ${dropped}｜剝除不一致圖解 ${vizStripped}`,
  )

  if (args.dryRun) {
    console.log('\n--dry-run，不寫檔。前兩題樣本：')
    console.log(JSON.stringify(fresh.slice(0, 2), null, 2))
    return
  }

  // 若 --force，先移除被重生知識點的舊題，避免重複
  const regenKpIds = new Set(fresh.map((q) => q.kpId))
  const kept = args.force ? bank.filter((q) => !regenKpIds.has(q.kpId)) : bank
  const merged = [...kept, ...fresh]
  writeFileSync(OUT, JSON.stringify(merged, null, 2) + '\n')
  console.log(`✓ 寫入 ${OUT}（總計 ${merged.length} 題）`)
}

main().catch((e) => {
  console.error('致命錯誤：', e)
  process.exit(1)
})
