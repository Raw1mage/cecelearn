import { useEffect, useRef, useState } from 'react'
import { celebrate } from '../../../shared/celebrate'
import { useScore } from '../../../shared/ScoreContext'
import {
  createHanziWriter,
  type HanziWriterInstance,
} from '../hanziWriterAdapter'

export type StrokeBoxProps = {
  /** 要顯示筆順的單字（lookup intent 提供） */
  char: string
}

/**
 * inline 筆順框（取代左欄常駐圖框）：在對話串流中該則 lookup 訊息下方顯示，
 * 含重播 / 練習。要顯示時才出現，不顯示時不佔版面。
 */
export function StrokeBox({ char }: StrokeBoxProps) {
  const { addScore } = useScore()
  const targetRef = useRef<HTMLDivElement | null>(null)
  const writerRef = useRef<HanziWriterInstance | null>(null)
  const [practicing, setPracticing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!char || !targetRef.current) return
    targetRef.current.innerHTML = ''
    setPracticing(false)
    setError('')
    try {
      // SVG 尺寸對齊框的實際渲染寬度（容器是正方形），避免寫死 340 比框大而偏移
      const size = Math.round(targetRef.current.clientWidth) || 300
      writerRef.current = createHanziWriter(targetRef.current, char, size)
      writerRef.current.animateCharacter()
    } catch (err) {
      setError(err instanceof Error ? err.message : '無法初始化筆順顯示。')
      writerRef.current = null
    }
  }, [char])

  function replay() {
    if (!writerRef.current) return
    setPracticing(false)
    writerRef.current.showCharacter()
    writerRef.current.animateCharacter()
  }

  function startPractice() {
    if (!writerRef.current) return
    setPracticing(true)
    writerRef.current.quiz({
      onComplete: () => {
        celebrate()
        addScore(1)
        setPracticing(false)
      },
    })
  }

  return (
    <div className="a1-stroke-inline">
      <div className="a1-stroke-container">
        <div
          className={`a1-stroke-box${practicing ? ' a1-stroke-box--practice' : ''}`}
          ref={targetRef}
        />
        <div className="a1-stroke-actions">
          <button className="a1-action-btn" onClick={replay} aria-label="重播筆順" title="重播">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
          <button
            className={`a1-action-btn${practicing ? ' a1-action-btn--active' : ''}`}
            onClick={startPractice}
            aria-label="練習寫字"
            title="練習"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
          </button>
        </div>
      </div>
      {error && <p className="muted">{error}</p>}
    </div>
  )
}
