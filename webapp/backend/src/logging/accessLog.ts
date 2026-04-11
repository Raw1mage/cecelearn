/**
 * Access log module — Apache Combined Log Format
 * Replicates the pattern from ~/projects/hyerasuno/webapp/core/logging_utils.py
 *
 * Format: IP - - [timestamp] "METHOD PATH PROTO" STATUS SIZE "REFERER" "UA"
 */

import { appendFileSync, mkdirSync, existsSync, renameSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

const MAX_SIZE = 10 * 1024 * 1024  // 10 MB
const MAX_BACKUPS = 10

let logPath = ''

export function initAccessLog(filePath: string) {
  logPath = filePath
  const dir = dirname(filePath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  console.log(`[AccessLog] → ${filePath}`)
}

function getTimestamp(): string {
  const d = new Date()
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const dd = String(d.getDate()).padStart(2, '0')
  const mon = months[d.getMonth()]
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  const tz = d.getTimezoneOffset()
  const sign = tz <= 0 ? '+' : '-'
  const tzH = String(Math.floor(Math.abs(tz) / 60)).padStart(2, '0')
  const tzM = String(Math.abs(tz) % 60).padStart(2, '0')
  return `[${dd}/${mon}/${yyyy}:${hh}:${mm}:${ss} ${sign}${tzH}${tzM}]`
}

function getRealIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0]
    return first.trim()
  }
  return req.socket.remoteAddress || '-'
}

function rotate() {
  if (!logPath) return
  try {
    const stat = statSync(logPath)
    if (stat.size < MAX_SIZE) return
  } catch { return }

  // Shift existing backups: .9 → delete, .8 → .9, ... .1 → .2, log → .1
  for (let i = MAX_BACKUPS; i >= 1; i--) {
    const src = i === 1 ? logPath : `${logPath}.${i - 1}`
    const dst = `${logPath}.${i}`
    try {
      if (i === MAX_BACKUPS) { /* oldest just gets overwritten */ }
      if (existsSync(src)) renameSync(src, dst)
    } catch { /* ignore */ }
  }
}

export function logAccess(req: IncomingMessage, res: ServerResponse, startTime: number) {
  if (!logPath) return

  const ip = getRealIp(req)
  const timestamp = getTimestamp()
  const method = req.method || 'GET'
  const path = req.url || '/'
  const proto = `HTTP/${req.httpVersion}`
  const status = res.statusCode
  const size = res.getHeader('content-length') || 0
  const referer = req.headers.referer || '-'
  const ua = req.headers['user-agent'] || '-'
  const duration = Date.now() - startTime

  const line = `${ip} - - ${timestamp} "${method} ${path} ${proto}" ${status} ${size} "${referer}" "${ua}" ${duration}ms\n`

  try {
    appendFileSync(logPath, line)
    rotate()
  } catch (err) {
    console.warn('[AccessLog] write failed:', err)
  }
}
