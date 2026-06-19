import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * 放大檢視浮層：把圖（情境插畫 / 數學 SVG）以全螢幕覆蓋顯示。
 * - 點背景、點 ✕、按 Esc 都會關閉並回到原本畫面。
 * - 開著時鎖住背景捲動，避免後面對話跟著滑。
 * - 用 portal 掛到 <body>，不受對話串流的 overflow/transform 影響。
 */
export function Lightbox({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean
  onClose: () => void
  label?: string
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="a1-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={label ?? '放大檢視'}
      onClick={onClose}
    >
      <button type="button" className="a1-lightbox__close" onClick={onClose} aria-label="關閉放大檢視">
        ✕
      </button>
      {/* 內容本身不關閉，只有點外面（背景）才關 */}
      <div className="a1-lightbox__content" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body,
  )
}
