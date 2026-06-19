import { useEffect, useState } from 'react'
import { env } from '../../shared/config/env'

/**
 * 累積層後台（GenBank Admin）——檢視 cecelearn 透過 token 累積的題庫/圖庫/影片庫。
 * 看「累積了什麼、各類幾筆、何時產生」，並可清理單筆。資料來自後端 /api/genbank/*。
 */

type GenType = 'quiz' | 'image' | 'video'

type Summary = { quiz: number; image: number; video: number }
type VideoTopic = { topic: string; label: string; count: number; updatedAt: string }
type ListResult = { rows: Record<string, unknown>[]; total: number; page: number; pageSize: number }

const api = env.apiBaseUrl.replace(/\/+$/, '')

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${api}${path}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

const TYPE_LABEL: Record<GenType, string> = { quiz: '題庫', image: '圖庫', video: '影片庫' }

export function AdminPage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [videoTopics, setVideoTopics] = useState<VideoTopic[]>([])
  const [activeType, setActiveType] = useState<GenType>('quiz')
  const [list, setList] = useState<ListResult | null>(null)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function loadSummary() {
    try {
      const r = await getJson<{ ok: boolean; summary: Summary; videoTopics: VideoTopic[] }>('/genbank/summary')
      setSummary(r.summary)
      setVideoTopics(r.videoTopics ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入統計失敗')
    }
  }

  async function loadList(type: GenType, p: number) {
    setLoading(true)
    setError('')
    try {
      const r = await getJson<{ ok: boolean } & ListResult>(`/genbank/list?type=${type}&page=${p}&pageSize=20`)
      setList(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入列表失敗')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSummary()
  }, [])

  useEffect(() => {
    void loadList(activeType, page)
  }, [activeType, page])

  async function remove(id: number) {
    if (!confirm(`確定刪除這筆 ${TYPE_LABEL[activeType]} 資料？`)) return
    try {
      const res = await fetch(`${api}/genbank/${activeType}/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await loadSummary()
      await loadList(activeType, page)
    } catch (e) {
      setError(e instanceof Error ? e.message : '刪除失敗')
    }
  }

  const totalPages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>累積層後台</h1>
      <p style={{ color: '#64748b', marginTop: 0 }}>
        cecelearn 透過 token 產生並結構化累積的內容，可再利用、可清理。
      </p>

      {error && (
        <div style={{ background: '#fee2e2', color: '#b91c1c', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* 統計卡 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {(['quiz', 'image', 'video'] as GenType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setActiveType(t); setPage(0) }}
            style={{
              flex: '1 1 160px',
              padding: 16,
              borderRadius: 12,
              border: activeType === t ? '2px solid #2563eb' : '1px solid #e2e8f0',
              background: activeType === t ? '#eff6ff' : '#fff',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div style={{ fontSize: 13, color: '#64748b' }}>{TYPE_LABEL[t]}</div>
            <div style={{ fontSize: 32, fontWeight: 700 }}>{summary ? summary[t] : '…'}</div>
          </button>
        ))}
      </div>

      {/* 影片庫主題分布（額外維度） */}
      {activeType === 'video' && videoTopics.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 16 }}>主題分布</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {videoTopics.map((vt) => (
              <span key={vt.topic} style={{ background: '#f1f5f9', padding: '4px 10px', borderRadius: 999, fontSize: 13 }}>
                {vt.label} · {vt.count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 列表 */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>載入中…</div>
        ) : !list || list.rows.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>目前沒有資料</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                {renderHeader(activeType)}
                <th style={{ padding: 10, width: 80 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((row) => (
                <tr key={String(row.id)} style={{ borderTop: '1px solid #f1f5f9' }}>
                  {renderRow(activeType, row, api)}
                  <td style={{ padding: 10 }}>
                    <button
                      type="button"
                      onClick={() => remove(Number(row.id))}
                      style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      刪除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 分頁 */}
      {list && list.total > list.pageSize && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center', marginTop: 16 }}>
          <button type="button" disabled={page <= 0} onClick={() => setPage((p) => p - 1)}>上一頁</button>
          <span>{page + 1} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>下一頁</button>
        </div>
      )}
    </div>
  )
}

function renderHeader(type: GenType) {
  if (type === 'quiz') {
    return (
      <>
        <th style={{ padding: 10 }}>科目/年級</th>
        <th style={{ padding: 10 }}>題目</th>
        <th style={{ padding: 10 }}>答案</th>
        <th style={{ padding: 10, width: 70 }}>用過</th>
      </>
    )
  }
  if (type === 'image') {
    return (
      <>
        <th style={{ padding: 10 }}>種類</th>
        <th style={{ padding: 10 }}>分類鍵</th>
        <th style={{ padding: 10 }}>預覽</th>
        <th style={{ padding: 10, width: 70 }}>用過</th>
      </>
    )
  }
  return (
    <>
      <th style={{ padding: 10 }}>主題</th>
      <th style={{ padding: 10 }}>標題</th>
      <th style={{ padding: 10 }}>頻道</th>
      <th style={{ padding: 10, width: 90 }}>加入日</th>
    </>
  )
}

function renderRow(type: GenType, row: Record<string, unknown>, apiBase: string) {
  if (type === 'quiz') {
    return (
      <>
        <td style={{ padding: 10, whiteSpace: 'nowrap' }}>{String(row.subject)}/{String(row.grade)}</td>
        <td style={{ padding: 10 }}>{String(row.stem)}</td>
        <td style={{ padding: 10 }}>{String(row.answer)}</td>
        <td style={{ padding: 10 }}>{String(row.reuse_count)}</td>
      </>
    )
  }
  if (type === 'image') {
    return (
      <>
        <td style={{ padding: 10 }}>{String(row.kind)}</td>
        <td style={{ padding: 10 }}>{String(row.category_key)}</td>
        <td style={{ padding: 10 }}>
          <img src={`${apiBase}/genbank/img/${String(row.id)}`} alt={String(row.category_key)} style={{ width: 48, height: 48, objectFit: 'contain' }} />
        </td>
        <td style={{ padding: 10 }}>{String(row.reuse_count)}</td>
      </>
    )
  }
  return (
    <>
      <td style={{ padding: 10 }}>{String(row.topic)}</td>
      <td style={{ padding: 10 }}>{String(row.title)}</td>
      <td style={{ padding: 10 }}>{String(row.channel_title)}</td>
      <td style={{ padding: 10, whiteSpace: 'nowrap' }}>{String(row.created_at).slice(0, 10)}</td>
    </>
  )
}
