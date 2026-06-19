import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  A1ErrorResponse,
  A1IllustrateResponse,
  SceneIllustrationProvider,
} from '../contracts/providers.js'
import { GenBank } from './genbank.js'

/**
 * CachedIllustrationProvider —— 場景插畫快取層（累積 + 再利用）。
 *
 * 包住底層生圖 provider（GeminiImage / Vertex / Cascade），把每張成功生成的場景插畫
 * 結構化存進累積層 gen_image(kind='scene')：
 *  - 查詢鍵 = 正規化關鍵詞（targetWord 優先，否則 context 短 hash）。
 *  - 命中 → 直接讀檔回 dataURI（零 token、零延遲），契約不變（前端無感）。
 *  - 未命中 → 呼底層生 → 成功則寫檔 data/scene-illust/ + INSERT gen_image → 回傳。
 *
 * bytes 存檔案系統（DD-3），DB 只存路徑 + provenance。失敗不寫庫、照樣回底層的 error
 * （fail-fast，天條 #11；不掩蓋生圖失敗）。
 */

const SCENE_DIR_REL = '../../data/scene-illust'

function sceneDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), SCENE_DIR_REL)
}

function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...fields, ts: Date.now() }))
}

/** 正規化查詢鍵：targetWord 優先（去空白小寫），否則 context 短 hash。複合 mode 避免場景/圖解碰撞。 */
function cacheKey(context: string, targetWord: string | undefined, mode: string): string {
  const base = (targetWord ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (base) return `${mode}:w:${base}`
  const h = createHash('sha256').update(context.trim().toLowerCase()).digest('hex').slice(0, 16)
  return `${mode}:c:${h}`
}

export class CachedIllustrationProvider implements SceneIllustrationProvider {
  private readonly inner: SceneIllustrationProvider
  private readonly bank: GenBank
  private readonly dir: string

  constructor(inner: SceneIllustrationProvider, bank: GenBank) {
    this.inner = inner
    this.bank = bank
    this.dir = sceneDir()
  }

  async illustrate(
    context: string,
    targetWord?: string,
    mode: 'scene' | 'diagram' = 'scene',
  ): Promise<A1IllustrateResponse | A1ErrorResponse> {
    const key = cacheKey(context, targetWord, mode)

    // 1. 查庫：命中直接讀檔回 dataURI（契約不變）
    try {
      const hit = this.bank.getImage('scene', key)
      if (hit) {
        const abs = resolve(this.dir, hit.file_path.replace(/^scene-illust\//, ''))
        if (existsSync(abs)) {
          const buf = readFileSync(abs)
          const ext = abs.slice(abs.lastIndexOf('.') + 1).toLowerCase()
          const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png'
          log('scene.cache.hit', { key })
          return {
            ok: true,
            imageDataUri: `data:${mime};base64,${buf.toString('base64')}`,
            altText: hit.alt_text ?? (targetWord ? `「${targetWord}」的情境插畫` : '情境插畫'),
          }
        }
      }
    } catch (e) {
      // 查庫失敗只 log，照樣走生成路徑（degraded 但功能在）
      log('scene.cache.read_error', { key, err: e instanceof Error ? e.message : String(e) })
    }

    // 2. 未命中：呼底層生成
    const res = await this.inner.illustrate(context, targetWord, mode)
    if (!res.ok) return res // fail-fast：照樣回底層 error，不寫庫

    // 3. 成功：寫檔 + INSERT（寫庫失敗不影響本次回傳）
    try {
      this.store(key, res.imageDataUri, res.altText, targetWord, mode)
    } catch (e) {
      log('scene.cache.write_error', { key, err: e instanceof Error ? e.message : String(e) })
    }
    return res
  }

  private store(
    key: string,
    dataUri: string,
    altText: string | undefined,
    targetWord: string | undefined,
    mode: string,
  ): void {
    const m = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/s.exec(dataUri)
    if (!m) return
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1]!
    // 檔名用 key 的 hash 避免特殊字元
    const safe = createHash('sha256').update(key).digest('hex').slice(0, 20)
    const file = `${safe}.${ext}`
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true })
    writeFileSync(resolve(this.dir, file), Buffer.from(m[2]!, 'base64'))
    this.bank.upsertImage({
      kind: 'scene',
      categoryKey: key,
      filePath: `scene-illust/${file}`,
      altText: altText ?? undefined,
      sourceModel: 'illustrate',
      prompt: targetWord ? `${mode}:${targetWord}` : mode,
    })
    log('scene.cache.store', { key, file })
  }
}
