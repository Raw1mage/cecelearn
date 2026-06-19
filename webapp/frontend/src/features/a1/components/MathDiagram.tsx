import { useState } from 'react'
import { type A1MathViz } from '../../../shared/api/client'
import { env } from '../../../shared/config/env'
import { Lightbox } from './Lightbox'

/**
 * 確定性數學圖解（SVG）：照 explain.viz 規格畫，100% 正確，不靠生圖模型。
 * - count：加減法數東西（減法把拿走的打紅叉；加法把加上的標綠底）。
 * - groups：乘除法分組（groups 個框，每框 per 個）。
 */

const CELL = 46
const ICON_FS = 30
const PAD = 16
const EQ_H = 46
const MAX_ICONS = 60

function Icon({ x, y, icon }: { x: number; y: number; icon: string }) {
  return (
    <text
      x={x}
      y={y}
      fontSize={ICON_FS}
      textAnchor="middle"
      dominantBaseline="central"
    >
      {icon}
    </text>
  )
}

function CountDiagram({ viz }: { viz: A1MathViz }) {
  const icon = viz.icon || '🔵'
  const total = Math.max(0, viz.total ?? 0)
  const operand = Math.max(0, viz.operand ?? 0)
  const op = viz.operation ?? 'sub'
  const n = Math.min(MAX_ICONS, op === 'add' ? total + operand : total)
  const cols = Math.min(Math.max(n, 1), 5)
  const rows = Math.max(1, Math.ceil(n / cols))
  const gridW = cols * CELL
  const width = gridW + PAD * 2
  const height = PAD + rows * CELL + EQ_H + PAD
  const eq = viz.equation || ''

  const cells = []
  for (let i = 0; i < n; i++) {
    const cx = PAD + (i % cols) * CELL + CELL / 2
    const cy = PAD + Math.floor(i / cols) * CELL + CELL / 2
    const removed = op === 'sub' && i >= n - operand
    const added = op === 'add' && i >= total
    cells.push(
      <g key={i}>
        {added && <circle cx={cx} cy={cy} r={CELL / 2 - 4} fill="rgba(52,211,153,0.28)" />}
        <Icon x={cx} y={cy} icon={icon} />
        {removed && (
          <>
            <line x1={cx - 13} y1={cy - 13} x2={cx + 13} y2={cy + 13} stroke="#ef4444" strokeWidth={3} strokeLinecap="round" />
            <line x1={cx + 13} y1={cy - 13} x2={cx - 13} y2={cy + 13} stroke="#ef4444" strokeWidth={3} strokeLinecap="round" />
          </>
        )}
      </g>,
    )
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="a1-math-svg" role="img" aria-label={eq || '數學圖解'}>
      {cells}
      {eq && (
        <text x={width / 2} y={height - EQ_H / 2} fontSize={28} fontWeight={700} fill="#eef4ff" textAnchor="middle" dominantBaseline="central">
          {eq}
        </text>
      )}
    </svg>
  )
}

function GroupsDiagram({ viz }: { viz: A1MathViz }) {
  const icon = viz.icon || '🔵'
  const groups = Math.min(12, Math.max(1, viz.groups ?? 1))
  const per = Math.min(10, Math.max(1, viz.per ?? 1))
  const eq = viz.equation || ''

  const boxPad = 8
  const boxW = per * (CELL - 8) + boxPad * 2
  const boxH = CELL - 2 + boxPad * 2
  const cols = Math.min(groups, 3)
  const rows = Math.ceil(groups / cols)
  const gapX = 12
  const gapY = 12
  const width = cols * boxW + (cols - 1) * gapX + PAD * 2
  const height = PAD + rows * boxH + (rows - 1) * gapY + EQ_H + PAD

  const boxes = []
  for (let g = 0; g < groups; g++) {
    const bx = PAD + (g % cols) * (boxW + gapX)
    const by = PAD + Math.floor(g / cols) * (boxH + gapY)
    const icons = []
    for (let k = 0; k < per; k++) {
      icons.push(
        <Icon key={k} x={bx + boxPad + k * (CELL - 8) + (CELL - 8) / 2} y={by + boxH / 2} icon={icon} />,
      )
    }
    boxes.push(
      <g key={g}>
        <rect x={bx} y={by} width={boxW} height={boxH} rx={10} fill="rgba(252,211,77,0.12)" stroke="rgba(252,211,77,0.5)" strokeWidth={1.5} />
        {icons}
      </g>,
    )
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="a1-math-svg" role="img" aria-label={eq || '數學圖解'}>
      {boxes}
      {eq && (
        <text x={width / 2} y={height - EQ_H / 2} fontSize={28} fontWeight={700} fill="#eef4ff" textAnchor="middle" dominantBaseline="central">
          {eq}
        </text>
      )}
    </svg>
  )
}

/**
 * tally：純粹平鋪 N 個 icon（英文「數數量」題，圖即題目）。
 * 刻意**不顯示算式、不顯示答案**——小朋友要自己數，數量由 viz.count 釘死（程式保證正確）。
 */
/** iconUrl 是相對 apiBaseUrl 的 API path（如 /quiz/icon/cat）；拼成可載入的完整 URL。 */
function resolveIconUrl(iconUrl: string): string {
  if (/^(https?:|data:|blob:)/.test(iconUrl)) return iconUrl
  const base = env.apiBaseUrl.replace(/\/+$/, '')
  return `${base}${iconUrl.startsWith('/') ? '' : '/'}${iconUrl}`
}

function TallyDiagram({ viz }: { viz: A1MathViz }) {
  const icon = viz.icon || '🔵'
  // 複合生圖：有單元物件插畫 → 平鋪該圖；否則退 emoji floor（確定性地板，非 silent fallback）。
  const imgSrc = viz.iconUrl ? resolveIconUrl(viz.iconUrl) : null
  const n = Math.min(MAX_ICONS, Math.max(1, viz.count ?? 1))
  const cols = Math.min(Math.max(n, 1), 5)
  const rows = Math.max(1, Math.ceil(n / cols))
  const gridW = cols * CELL
  const width = gridW + PAD * 2
  const height = PAD * 2 + rows * CELL
  // 插畫尺寸略小於格子，置中於格內
  const imgSize = CELL - 8

  const cells = []
  for (let i = 0; i < n; i++) {
    const cx = PAD + (i % cols) * CELL + CELL / 2
    const cy = PAD + Math.floor(i / cols) * CELL + CELL / 2
    cells.push(
      imgSrc ? (
        <image
          key={i}
          href={imgSrc}
          x={cx - imgSize / 2}
          y={cy - imgSize / 2}
          width={imgSize}
          height={imgSize}
          preserveAspectRatio="xMidYMid meet"
        />
      ) : (
        <Icon key={i} x={cx} y={cy} icon={icon} />
      ),
    )
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="a1-math-svg" role="img" aria-label={`${n} 個物件`}>
      {cells}
    </svg>
  )
}

export function MathDiagram({ viz }: { viz: A1MathViz }) {
  const [zoomed, setZoomed] = useState(false)
  const body =
    viz.kind === 'tally' ? (
      <TallyDiagram viz={viz} />
    ) : viz.kind === 'groups' ? (
      <GroupsDiagram viz={viz} />
    ) : (
      <CountDiagram viz={viz} />
    )
  const label = viz.equation || '數學圖解'
  return (
    <div className="a1-math-diagram">
      <button
        type="button"
        className="a1-zoomable"
        onClick={() => setZoomed(true)}
        aria-label={`放大看「${label}」`}
        title="點一下放大"
      >
        {body}
      </button>
      <Lightbox open={zoomed} onClose={() => setZoomed(false)} label={label}>
        {body}
      </Lightbox>
    </div>
  )
}
