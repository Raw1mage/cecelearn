import { type A1MathViz } from '../../../shared/api/client'

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

export function MathDiagram({ viz }: { viz: A1MathViz }) {
  const body = viz.kind === 'groups' ? <GroupsDiagram viz={viz} /> : <CountDiagram viz={viz} />
  return <div className="a1-math-diagram">{body}</div>
}
