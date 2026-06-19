import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SceneIllustrationProvider } from '../contracts/providers.js'
import { NOUN_BANK, type NounEntry } from './quizFramework.js'
import type { GenBank } from './genbank.js'

/**
 * QuizIconProvider —— 練習題「單元物件插畫」圖庫（複合生圖的圖源）。
 *
 * 設計（使用者批准的雙軌：build 預生 + runtime 補沒有的，天條 #11）：
 *  - build：scripts/gen-quiz-icons.ts 離線為 NOUN_BANK 各名詞生 1 張單元物件圖，
 *    存 data/quiz-icons/<noun>.png + manifest.json（{ noun: "<noun>.png" }）。
 *  - runtime：出題時若某名詞 manifest 沒有圖，當場呼 Imagen 生 1 張、寫盤、更新 manifest；
 *    同名詞並發只生一次（in-flight dedup）。
 *  - 數量正確性永遠由程式 tile N 份保證——Imagen 只畫「1 個」，從不被問「畫幾個」。
 *
 * Fail-fast（不違天條）：沒 illustrate provider、或生圖失敗 → iconUrlFor 回 null，
 * 前端退 emoji floor（既有確定性渲染）。這不是 silent fallback：emoji 是原生地板，
 * 不掩蓋任何錯誤，且名詞庫 100% emoji 可表達。
 */

const ICON_DIR_REL = '../../data/quiz-icons'
const MANIFEST_REL = `${ICON_DIR_REL}/manifest.json`

type Manifest = Record<string, string> // noun singular → 檔名（相對 quiz-icons/）

function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...fields, ts: Date.now() }))
}

export class QuizIconProvider {
  private readonly iconDir: string
  private readonly manifestPath: string
  private manifest: Manifest = {}
  private readonly illustrate?: SceneIllustrationProvider
  private readonly genBank?: GenBank
  private readonly inflight = new Map<string, Promise<string | null>>()
  private readonly nouns = new Map<string, NounEntry>()

  /**
   * @param illustrate 生圖 provider（server 的 buildImageProvider() 產物）；undefined = 只用 build 預生圖庫，不 runtime 補。
   * @param genBank 統一累積層；提供則把 quiz-icon 記入 gen_image（供後台檢視）。
   */
  constructor(illustrate?: SceneIllustrationProvider, genBank?: GenBank) {
    const dir = dirname(fileURLToPath(import.meta.url))
    this.iconDir = resolve(dir, ICON_DIR_REL)
    this.manifestPath = resolve(dir, MANIFEST_REL)
    this.illustrate = illustrate
    this.genBank = genBank
    for (const n of NOUN_BANK) this.nouns.set(n.singular, n)
    this.loadManifest()
    this.registerManifestToBank()
    const have = Object.keys(this.manifest).length
    console.log(
      `[QuizIcon] 圖庫就緒：${have}/${NOUN_BANK.length} 名詞有預生圖` +
        `${illustrate ? '、runtime 可補沒有的' : '、無 runtime 生圖（缺者退 emoji）'}`,
    )
  }

  private loadManifest(): void {
    try {
      if (existsSync(this.manifestPath)) {
        const raw = JSON.parse(readFileSync(this.manifestPath, 'utf-8')) as Manifest
        // 只收檔案實際存在的條目（防 manifest 與磁碟 drift）
        for (const [noun, file] of Object.entries(raw)) {
          if (existsSync(resolve(this.iconDir, file))) this.manifest[noun] = file
        }
      }
    } catch (e) {
      console.warn('[QuizIcon] manifest 載入失敗，視為空圖庫:', e instanceof Error ? e.message : e)
      this.manifest = {}
    }
  }

  /** 對外服務：某名詞的圖檔絕對路徑（給 /api/quiz/icon 靜態路由讀）；無則 null。 */
  filePathFor(noun: string): string | null {
    const file = this.manifest[noun]
    if (!file) return null
    const abs = resolve(this.iconDir, file)
    return existsSync(abs) ? abs : null
  }

  /**
   * 回該名詞的 iconUrl（相對 API path，前端平鋪此圖）。
   *  - manifest 有 → 直接回 URL。
   *  - manifest 無、且有 illustrate provider → 當場生（in-flight dedup）→ 成功回 URL、失敗回 null。
   *  - 無 provider → null（前端退 emoji floor）。
   */
  async iconUrlFor(noun: string): Promise<string | null> {
    if (this.manifest[noun]) return this.urlOf(noun)
    if (!this.illustrate || !this.nouns.has(noun)) return null

    const pending = this.inflight.get(noun)
    if (pending) return pending
    const job = this.generateAndStore(noun).finally(() => this.inflight.delete(noun))
    this.inflight.set(noun, job)
    return job
  }

  private urlOf(noun: string): string {
    // 前端用 apiBaseUrl 拼，這裡回相對 API path（與 /api/quiz 同前綴規則由 server basePath 處理）
    return `/quiz/icon/${encodeURIComponent(noun)}`
  }

  private async generateAndStore(noun: string): Promise<string | null> {
    const entry = this.nouns.get(noun)
    if (!entry || !this.illustrate) return null
    const start = Date.now()
    // 複合生圖鐵律：只叫它畫「一個」，數量交給程式 tile（DD：correctness 不交給生成器）。
    const context = `a single ${entry.singular}, one ${entry.singular} only, centered`
    const res = await this.illustrate.illustrate(context, entry.singular, 'scene')
    if (!res.ok) {
      log('quiz.icon.gen.fail', { noun, code: res.error, latencyMs: Date.now() - start })
      return null
    }
    const stored = this.storeDataUri(noun, res.imageDataUri)
    if (!stored) return null
    log('quiz.icon.gen.ok', { noun, latencyMs: Date.now() - start })
    return this.urlOf(noun)
  }

  /** 把 data:image/...;base64,xxx 寫成 quiz-icons/<noun>.<ext>，更新 manifest（記憶體+磁碟）。 */
  private storeDataUri(noun: string, dataUri: string): boolean {
    const m = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/s.exec(dataUri)
    if (!m) {
      console.warn(`[QuizIcon] ${noun} 生圖回傳非預期 dataUri，略過`)
      return false
    }
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1]!
    const file = `${noun}.${ext}`
    try {
      if (!existsSync(this.iconDir)) mkdirSync(this.iconDir, { recursive: true })
      writeFileSync(resolve(this.iconDir, file), Buffer.from(m[2]!, 'base64'))
      this.manifest[noun] = file
      this.persistManifest()
      this.recordToBank(noun, file)
      return true
    } catch (e) {
      console.warn(`[QuizIcon] ${noun} 寫盤失敗:`, e instanceof Error ? e.message : e)
      return false
    }
  }

  private persistManifest(): void {
    try {
      if (!existsSync(this.iconDir)) mkdirSync(this.iconDir, { recursive: true })
      writeFileSync(this.manifestPath, JSON.stringify(this.manifest, null, 2) + '\n')
    } catch (e) {
      console.warn('[QuizIcon] manifest 寫盤失敗:', e instanceof Error ? e.message : e)
    }
  }

  /** 啟動時把既有 manifest 的 quiz-icon 記入 gen_image（供後台統一檢視；upsert 冪等）。 */
  private registerManifestToBank(): void {
    if (!this.genBank) return
    try {
      for (const [noun, file] of Object.entries(this.manifest)) this.recordToBank(noun, file)
    } catch (e) {
      console.warn('[QuizIcon] 註冊 manifest 到 genbank 失敗:', e instanceof Error ? e.message : e)
    }
  }

  /** 把一張 quiz-icon 記入 gen_image(kind='quiz-icon')；file 相對 quiz-icons/。 */
  private recordToBank(noun: string, file: string): void {
    if (!this.genBank) return
    try {
      this.genBank.upsertImage({
        kind: 'quiz-icon',
        categoryKey: noun,
        filePath: `quiz-icons/${file}`,
        altText: `「${noun}」單元物件插畫`,
        sourceModel: 'imagen',
        prompt: `a single ${noun}`,
      })
    } catch (e) {
      console.warn(`[QuizIcon] ${noun} 記入 genbank 失敗:`, e instanceof Error ? e.message : e)
    }
  }
}
