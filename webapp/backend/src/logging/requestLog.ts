/**
 * Request/Response detail log — W3C Extended Log Format
 *
 * Records API request payloads, response data, processing time,
 * and upstream service calls (e.g. Gemini corrections).
 *
 * Format: W3C Extended Log (https://www.w3.org/TR/WD-logfile.html)
 * #Fields: date time cs-method cs-uri-stem sc-status time-taken cs(Content-Type) cs-body sc-body x-upstream
 */

import { appendFileSync, mkdirSync, existsSync, renameSync, statSync } from 'node:fs'
import { dirname } from 'node:path'

const MAX_SIZE = 10 * 1024 * 1024  // 10 MB
const MAX_BACKUPS = 5

let logPath = ''

const W3C_HEADER = [
  '#Version: 1.0',
  '#Software: cecelearn-backend',
  `#Start-Date: ${new Date().toISOString()}`,
  '#Fields: date time cs-method cs-uri-stem sc-status time-taken cs(Content-Type) cs-body sc-body x-upstream',
  '',
].join('\n')

export function initRequestLog(filePath: string) {
  logPath = filePath
  const dir = dirname(filePath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  // Write W3C header if file doesn't exist
  if (!existsSync(filePath)) {
    appendFileSync(filePath, W3C_HEADER)
  }
  console.log(`[RequestLog] → ${filePath}`)
}

function rotate() {
  if (!logPath) return
  try {
    const stat = statSync(logPath)
    if (stat.size < MAX_SIZE) return
  } catch { return }

  for (let i = MAX_BACKUPS; i >= 1; i--) {
    const src = i === 1 ? logPath : `${logPath}.${i - 1}`
    const dst = `${logPath}.${i}`
    try {
      if (existsSync(src)) renameSync(src, dst)
    } catch { /* ignore */ }
  }
  // Write fresh header
  appendFileSync(logPath, W3C_HEADER)
}

/** Escape value for W3C log field: replace whitespace/quotes, use "-" for empty */
function esc(value: string | undefined | null, maxLen = 2000): string {
  if (!value) return '-'
  let s = value.length > maxLen ? value.slice(0, maxLen) + '...' : value
  s = s.replace(/[\r\n\t]/g, ' ').replace(/"/g, "'")
  return `"${s}"`
}

/** Collect upstream call info within a request lifecycle */
const upstreamMap = new Map<string, string[]>()

export function createRequestId(): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  upstreamMap.set(id, [])
  return id
}

/** Record an upstream service call (e.g. Gemini, MOE dictionary) */
export function logUpstream(requestId: string, service: string, detail: string) {
  const entries = upstreamMap.get(requestId)
  if (entries) entries.push(`${service}:${detail}`)
}

export function logRequest(
  requestId: string,
  method: string,
  path: string,
  statusCode: number,
  durationMs: number,
  contentType: string | undefined,
  requestBody: string | undefined,
  responseBody: string | undefined,
) {
  if (!logPath) return

  const now = new Date()
  const date = now.toISOString().slice(0, 10)
  const time = now.toISOString().slice(11, 19)

  const upstream = upstreamMap.get(requestId)
  const upstreamStr = upstream && upstream.length > 0 ? esc(upstream.join('; ')) : '-'
  upstreamMap.delete(requestId)

  const line = [
    date,
    time,
    method,
    path,
    statusCode,
    durationMs,
    contentType || '-',
    esc(requestBody),
    esc(responseBody, 500),
    upstreamStr,
  ].join(' ') + '\n'

  try {
    appendFileSync(logPath, line)
    rotate()
  } catch (err) {
    console.warn('[RequestLog] write failed:', err)
  }
}
