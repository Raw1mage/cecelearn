import type { ComponentType } from 'react'
import type { OverlayKind } from '../../../../backend/src/shared/gameRegistry'
import type { QuizSummary } from '../../shared/api/client'
import { A2Page } from '../a2/A2Page'
import { A5Page } from '../a5/A5Page'
import { QuizPage } from '../a6/QuizPage'
import { A7Page } from '../a7/A7Page'
import { A6VocabCard } from '../a6/A6VocabCard'

/**
 * overlayRegistry — overlayKind → 全螢幕遊戲元件（前端側第二張表，DD-2/DD-3）。
 *
 * 共用 game registry（backend/src/shared/gameRegistry）不可 import React 元件，
 * 故 overlayKind→元件 的映射放在前端這裡。新遊戲＝在 GAME_REGISTRY 加 entry +
 * 在此補一筆元件。INV-3：每個 overlayKind 都要有對應元件。
 */
export interface OverlayProps {
  onClose: () => void
  onComplete: (summary: QuizSummary) => void
}

export const OVERLAY_COMPONENTS: Record<OverlayKind, ComponentType<OverlayProps>> = {
  dictation: A5Page,
  idiom: A2Page,
  quiz: QuizPage,
  crossword: A7Page,
  english_vocab: A6VocabCard,
}

/** 取 overlayKind 對應的元件；查無回 null（INV-3 破壞時不掛載，不 silent fallback）。 */
export function overlayComponent(kind: OverlayKind): ComponentType<OverlayProps> | null {
  return OVERLAY_COMPONENTS[kind] ?? null
}
