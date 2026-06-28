/**
 * game_launch_framework — 前後端共用 game registry（單一真實來源）。
 *
 * 純資料 + 型別，零執行期相依（不 import React／不 import node）。
 * 後端衍生 intent enum / prompt 觸發詞；前端衍生 overlay 映射 / 首頁入口鈕。
 * 新遊戲＝在 GAME_REGISTRY 加一筆 entry + 前端 overlayRegistry 補對應元件。
 */

/** 全螢幕遊戲容器種類，等同 GameEntry.id。 */
export type OverlayKind = 'dictation' | 'idiom' | 'quiz' | 'crossword' | 'english_vocab'

/** 非遊戲啟動的 base intent（語意異質，不進 registry，DD-7）。 */
export const BASE_INTENTS = [
  'lookup',
  'make_words',
  'make_sentence',
  'tell_story',
  'continue_story',
  'draw',
  'solve_arithmetic',
  'explain',
  'find_video',
  'chat',
  'unclear',
] as const

export type BaseIntent = (typeof BASE_INTENTS)[number]

/** 一筆可語音/點擊啟動的遊戲的完整啟動定義（不含玩法、不含 React 元件引用）。 */
export interface GameEntry {
  /** 穩定識別，等同 overlayKind。 */
  id: OverlayKind
  /** 對應的後端啟動意圖名。 */
  intent: string
  /** 首頁入口鈕中文短詞。 */
  label: string
  /** 入口鈕 emoji。 */
  emoji: string
  /** prompt 觸發詞範例（給模型把口語對應到此 launch intent）。 */
  triggerExamples: string[]
  /** 給 a1 system prompt 的一句意圖說明。 */
  intentDescription: string
  /** ConversationView 顯示的 intent 中文標籤。 */
  conversationLabel: string
}

/** GAME_REGISTRY：全系統唯一的可啟動遊戲清單（編譯期常數）。 */
export const GAME_REGISTRY = [
  {
    id: 'dictation',
    intent: 'start_dictation',
    label: '聽寫',
    emoji: '✏️',
    triggerExamples: ['我要練習聽寫', '考我聽寫', '來玩聽寫', '開始聽寫'],
    intentDescription:
      '小朋友想玩/練習「聽寫」測驗（聽詞語寫出來）。→ 只填 reply，用一句期待的引導語（例：「好呀！我們來玩聽寫，仔細聽喔！」）。前端會打開聽寫測驗畫面。',
    conversationLabel: '聽寫',
  },
  {
    id: 'idiom',
    intent: 'start_idiom',
    label: '成語',
    emoji: '🧩',
    triggerExamples: ['來玩成語', '成語練習', '考我成語', '我要玩成語遊戲'],
    intentDescription:
      '小朋友想玩/練習「成語」選擇題測驗（看題目選正確成語）。注意：這是選擇題，不是填字。→ 只填 reply，用一句期待的引導語（例：「好呀！我們來玩成語小遊戲！」）。前端會打開成語測驗畫面。',
    conversationLabel: '成語',
  },
  {
    id: 'quiz',
    intent: 'start_quiz',
    label: '練習',
    emoji: '📝',
    triggerExamples: ['出一題數學給我算', '考我乘法', '出三題給我練習', '我要做數學練習'],
    intentDescription:
      '小朋友想要你「出題給他做／考他／練習某學科」——數學、國語、英文的練習題，且要他自己作答（不是要你講解）。→ 只填 reply，用一句期待的引導語。前端會打開練習測驗畫面。',
    conversationLabel: '練習',
  },
  {
    id: 'crossword',
    intent: 'start_crossword',
    label: '成語填字',
    emoji: '🔡',
    triggerExamples: ['玩成語填字', '來填字', '成語闖關', '填字遊戲', '成語填字闖關'],
    intentDescription:
      '小朋友想玩「成語填字」交叉填字闖關遊戲（在十字交叉格子裡填字組成成語）。注意：這是填字闖關，跟 start_idiom 的成語選擇題不同——只要提到「填字／闖關／格子」就走這個。→ 只填 reply，用一句期待的引導語（例：「好呀！我們來玩成語填字闖關！」）。前端會打開成語填字遊戲畫面。',
    conversationLabel: '成語填字',
  },
  {
    id: 'english_vocab',
    intent: 'start_english_vocab',
    label: '英文單字',
    emoji: '🔤',
    triggerExamples: ['我要練習英文單字', '考我英文單字', '來玩英文單字', '開始英文單字練習', '英文單字練習'],
    intentDescription:
      '小朋友想玩/練習「英文單字」拼寫測驗（看圖聽發音手寫單字字母）。→ 只填 reply，用一句期待的引導語（例：「好呀！我們來玩英文單字卡，仔細聽喔！」）。前端會打開英文練習畫面。',
    conversationLabel: '英文單字',
  },
] as const satisfies readonly GameEntry[]

/** registry 所有 entry 的 intent 字面量聯集。 */
export type LaunchIntent = (typeof GAME_REGISTRY)[number]['intent']

/** 所有 intent（base + launch）的聯集型別。 */
export type AllIntent = BaseIntent | LaunchIntent

/** registry.map(e => e.intent)。 */
export function launchIntents(): LaunchIntent[] {
  return GAME_REGISTRY.map((e) => e.intent)
}

/**
 * 兩個 chat provider schema enum 同源（INV-1）。
 * = [...BASE_INTENTS, ...launchIntents()]
 */
export function allIntentEnum(): AllIntent[] {
  return [...BASE_INTENTS, ...launchIntents()]
}

/**
 * intent → overlayKind 查表。查無回 null（不 silent fallback，DD-5/INV-4）。
 */
export function overlayForIntent(intent: string): OverlayKind | null {
  const entry = GAME_REGISTRY.find((e) => e.intent === intent)
  return entry ? entry.id : null
}

/** 首頁入口鈕資料；數量 == registry 長度（INV-2）。 */
export function gameChips(): Array<{ overlayKind: OverlayKind; emoji: string; label: string }> {
  return GAME_REGISTRY.map((e) => ({ overlayKind: e.id, emoji: e.emoji, label: e.label }))
}

/** intent → 中文 label（ConversationView 用，DD-10）。查無回 undefined。 */
export function conversationLabelForIntent(intent: string): string | undefined {
  return GAME_REGISTRY.find((e) => e.intent === intent)?.conversationLabel
}

/**
 * a1 system prompt 的遊戲 intent 說明段（每筆 entry 一行 intent + 觸發詞範例）。
 * 併入 SYSTEM_PROMPT 的封閉 intent 清單。
 */
export function gamePromptLines(): string {
  return GAME_REGISTRY.map(
    (e) => `- "${e.intent}"：${e.intentDescription} 常見如「${e.triggerExamples.join('」「')}」。`,
  ).join('\n')
}
