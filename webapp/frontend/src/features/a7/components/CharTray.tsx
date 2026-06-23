import type { CrosswordState } from '../useCrossword'

/**
 * CharTray —— 底部備選字塊。
 * 雙向互動（DD-8）：點字塊 → 若已選格直接填入；否則切換字塊選取（待點空格）。
 * 已用字塊變灰不可點；當前選中字塊高亮。
 * onTileTap 由 A7Page 注入，內部呼叫 state.tapTray 並處理填字完成的教學揭曉。
 */

type Props = {
  tray: string[]
  state: CrosswordState
  onTileTap: (idx: number) => void
}

export function CharTray({ tray, state, onTileTap }: Props) {
  return (
    <div className="a7-tray">
      {tray.map((ch, idx) => {
        const used = state.trayUsed[idx]
        const selected = state.selectedTrayIdx === idx
        const cls = ['a7-tile', used ? 'a7-tile--used' : '', selected ? 'a7-tile--selected' : '']
          .filter(Boolean)
          .join(' ')
        return (
          <button
            key={`${ch}-${idx}`}
            type="button"
            className={cls}
            disabled={used}
            onClick={() => onTileTap(idx)}
            aria-label={`備選字 ${ch}${used ? '（已用）' : ''}`}
          >
            {ch}
          </button>
        )
      })}
    </div>
  )
}
