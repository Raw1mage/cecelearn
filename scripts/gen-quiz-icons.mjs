#!/usr/bin/env node
/**
 * gen-quiz-icons — 練習題「單元物件插畫」離線預生器（複合生圖的 build 軌）
 *
 * 為英文 tally/name 題的名詞庫（NOUN_BANK）各生 1 張「單一物件」插畫，存成
 *   webapp/backend/data/quiz-icons/<noun>.png
 * 並寫 manifest.json（{ "<noun>": "<noun>.png" }）。runtime QuizIconProvider 讀此 manifest，
 * 出題時前端把「1 張單元物件圖」程式 tile N 份 → 數量永遠由程式保證 = 答案（DD：correctness
 * 不交給生成器；Imagen 只畫「一個」，從不被問「畫幾個」）。
 *
 * 圖源：Vertex AI Imagen（與 imagen.sh / imagenVertexProvider 同一條 :predict 路徑），
 * 用 gcloud access token 認證，燒 GCP credit。
 *
 * NOUN_BANK 是 SSOT（webapp/backend/src/providers/quizFramework.ts）；此處的名詞清單必須與其一致。
 * 名詞庫變更時兩處同步（與 gen-quizbank.mjs 的框架雙拷貝同屬已知技術債）。
 *
 * 用法：
 *   node scripts/gen-quiz-icons.mjs [flags]
 *     --noun=cat          只生單一名詞（可省＝全部）
 *     --force             已有圖也重生（預設跳過）
 *     --model=fast        imagen 模型 key：standard|ultra|fast|imagen3（預設 fast）
 *     --concurrency=2     併發數（預設 2，避免撞配額）
 *     --dry-run           不呼叫 API、不寫檔，只印計畫
 *   環境變數：
 *     IMAGEN_PROJECT   （預設 gen-lang-client-0857568615，同 imagen.sh）
 *     IMAGEN_LOCATION  （預設 us-central1）
 *   需先 gcloud auth login（取 access token）。fail-fast：缺 token / 生圖失敗 → 報錯，
 *   不寫佔位圖、不回退（emoji floor 由 runtime 前端負責，非本腳本職責）。
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ICON_DIR = resolve(__dirname, '..', 'webapp', 'backend', 'data', 'quiz-icons')
const MANIFEST = resolve(ICON_DIR, 'manifest.json')

const PROJECT = process.env.IMAGEN_PROJECT || 'gen-lang-client-0857568615'
const LOCATION = process.env.IMAGEN_LOCATION || 'us-central1'

const MODEL_MAP = {
  standard: 'imagen-4.0-generate-001',
  ultra: 'imagen-4.0-ultra-generate-001',
  fast: 'imagen-4.0-fast-generate-001',
  imagen3: 'imagen-3.0-generate-002',
}

/**
 * 名詞庫 —— 必須與 quizFramework.ts NOUN_BANK 的 singular 一致（SSOT 在那邊）。
 * 此處只需 singular（生圖以單數物件為準）。
 */
const NOUNS = [
  'pencil', 'apple', 'cat', 'dog', 'ball', 'book', 'star', 'flower',
  'fish', 'car', 'banana', 'balloon', 'duck', 'strawberry', 'tree', 'cookie',
]

function parseArgs(argv) {
  const a = { force: false, dryRun: false, model: 'fast', concurrency: 2, noun: '' }
  for (const tok of argv) {
    if (tok === '--force') a.force = true
    else if (tok === '--dry-run') a.dryRun = true
    else if (tok.startsWith('--model=')) a.model = tok.slice(8)
    else if (tok.startsWith('--concurrency=')) a.concurrency = Math.max(1, Number(tok.slice(14)) || 2)
    else if (tok.startsWith('--noun=')) a.noun = tok.slice(7).trim()
  }
  return a
}

function getToken() {
  try {
    return execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf-8' }).trim()
  } catch {
    return ''
  }
}

/** Imagen prompt：單一、置中、白底、適齡的物件插畫（只畫一個，數量交給程式 tile）。 */
function promptFor(noun) {
  return [
    `a single ${noun}, one ${noun} only, centered,`,
    "cute children's picture book illustration, flat sticker style,",
    'warm bright colors, friendly and adorable, plain white background,',
    'no text, no numbers, no extra objects, positive, safe, age-appropriate.',
  ].join(' ')
}

async function generateOne(noun, token, model, dryRun) {
  const outPath = resolve(ICON_DIR, `${noun}.png`)
  if (dryRun) {
    console.log(`  [dry-run] ${noun} → ${outPath}`)
    return `${noun}.png`
  }
  const endpoint =
    `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT}` +
    `/locations/${LOCATION}/publishers/google/models/${model}:predict`
  const body = JSON.stringify({
    instances: [{ prompt: promptFor(noun) }],
    parameters: { sampleCount: 1, aspectRatio: '1:1', personGeneration: 'allow_all', safetySetting: 'block_only_high' },
  })
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(60000),
    body,
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`${noun}: HTTP ${res.status} ${t.slice(0, 200)}`)
  }
  const data = await res.json()
  const b64 = data?.predictions?.[0]?.bytesBase64Encoded
  if (!b64) {
    const rai = data?.predictions?.[0]?.raiFilteredReason || 'empty'
    throw new Error(`${noun}: 無圖回傳（${rai}）`)
  }
  writeFileSync(outPath, Buffer.from(b64, 'base64'))
  return `${noun}.png`
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const model = MODEL_MAP[args.model]
  if (!model) {
    console.error(`✗ 未知 model '${args.model}'（用 standard|ultra|fast|imagen3）`)
    process.exit(1)
  }

  if (!existsSync(ICON_DIR)) mkdirSync(ICON_DIR, { recursive: true })

  // 既有 manifest（續跑用）
  let manifest = {}
  if (existsSync(MANIFEST)) {
    try { manifest = JSON.parse(readFileSync(MANIFEST, 'utf-8')) } catch { manifest = {} }
  }

  let targets = args.noun ? NOUNS.filter((n) => n === args.noun) : NOUNS
  if (args.noun && targets.length === 0) {
    console.error(`✗ '${args.noun}' 不在名詞庫`)
    process.exit(1)
  }
  if (!args.force) {
    targets = targets.filter((n) => !(manifest[n] && existsSync(resolve(ICON_DIR, manifest[n]))))
  }

  console.log(`gen-quiz-icons: ${targets.length} 個待生（model=${args.model}, concurrency=${args.concurrency}${args.dryRun ? ', dry-run' : ''}）`)
  if (targets.length === 0) {
    console.log('✓ 全部已存在，無需生圖（--force 可重生）')
    return
  }

  let token = ''
  if (!args.dryRun) {
    token = getToken()
    if (!token) {
      console.error('✗ 取不到 access token，先跑：gcloud auth login')
      process.exit(1)
    }
  }

  let ok = 0
  let fail = 0
  // 簡單併發池
  const queue = [...targets]
  async function worker() {
    while (queue.length) {
      const noun = queue.shift()
      try {
        const file = await generateOne(noun, token, model, args.dryRun)
        manifest[noun] = file
        if (!args.dryRun) writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
        ok++
        console.log(`✓ ${noun}`)
      } catch (e) {
        fail++
        console.error(`✗ ${e instanceof Error ? e.message : e}`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(args.concurrency, targets.length) }, () => worker()))

  console.log(`\n完成：成功 ${ok}、失敗 ${fail}。manifest → ${MANIFEST}`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error('✗ gen-quiz-icons 失敗:', e instanceof Error ? e.message : e)
  process.exit(1)
})
