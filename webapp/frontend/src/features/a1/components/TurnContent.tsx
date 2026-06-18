import {
  type A1ChatMessage,
  type A1LookupWord,
} from '../../../shared/api/client'
import { parseBopomofo } from '../bopomofo'

/** Render a word with vertical bopomofo annotation (沿用 A1Page 既有樣式) */
function RubyWord({ term, bopomofo }: A1LookupWord) {
  const chars = term.split('')
  const phonetics = bopomofo.split(' ').filter(Boolean)
  return (
    <span className="ruby-word">
      {chars.map((char, i) => {
        const ph = i < phonetics.length ? parseBopomofo(phonetics[i]) : null
        return (
          <span key={i} className="ruby-char">
            <span className="ruby-char__main">{char}</span>
            {ph && (
              <span className="ruby-char__phon">
                <span className="ruby-char__initials">
                  {ph.phonetics.map((p, j) => (
                    <span key={j}>{p}</span>
                  ))}
                </span>
                <span className="ruby-char__tone">{ph.tone || '\u00A0'}</span>
              </span>
            )}
          </span>
        )
      })}
    </span>
  )
}

export type TurnContentProps = {
  /** tutor 訊息附帶的富內容 payload（lookup / sentence / story / explain） */
  message: Pick<A1ChatMessage, 'intent' | 'lookup' | 'sentence' | 'story' | 'explain'>
}

const SUBJECT_LABEL: Record<string, string> = {
  english: '英文',
  math: '數學',
  general: '講解',
}

/**
 * 對話串流中一則 tutor 訊息的富內容渲染（造詞泛化視窗的內容核心）。
 * - lookup / make_words → 造詞卡片 + 相關成語
 * - make_sentence → 多句句子卡片
 * - tell_story → 故事段落
 * - chat / unclear → 無額外內容（只有文字泡泡，由 ConversationView 渲染）
 */
export function TurnContent({ message }: TurnContentProps) {
  const { intent, lookup, sentence, story, explain } = message

  if ((intent === 'lookup' || intent === 'make_words') && lookup) {
    const words = lookup.words ?? []
    const idioms = lookup.idioms ?? []
    return (
      <div className="a1-turn-content a1-turn-content--words">
        {words.length > 0 && (
          <div className="word-chip-list a1-chip-grid">
            {words.map((word) => (
              <article key={`${word.term}-${word.bopomofo}`} className="word-chip">
                <RubyWord {...word} />
              </article>
            ))}
          </div>
        )}
        {idioms.length > 0 && (
          <>
            <h4 className="a1-result-subhead">相關成語</h4>
            <div className="word-chip-list a1-chip-grid">
              {idioms.map((idiom) => (
                <article key={`${idiom.term}-${idiom.bopomofo}`} className="word-chip">
                  <RubyWord {...idiom} />
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  if (intent === 'make_sentence' && sentence) {
    const sentences = sentence.sentences ?? []
    if (sentences.length === 0) return null
    return (
      <div className="a1-turn-content a1-turn-content--sentence">
        {sentence.targetWord && (
          <span className="a1-sentence-target">「{sentence.targetWord}」</span>
        )}
        <ol className="a1-sentence-list">
          {sentences.map((s, i) => (
            <li key={i} className="a1-sentence-card">
              <p className="a1-sentence-text">{s}</p>
            </li>
          ))}
        </ol>
      </div>
    )
  }

  if (intent === 'tell_story' && story) {
    return (
      <div className="a1-turn-content a1-turn-content--story">
        <article className="a1-story-card">
          {story.topic && <h4 className="a1-story-topic">{story.topic}</h4>}
          <p className="a1-story-text">{story.story}</p>
        </article>
      </div>
    )
  }

  if (intent === 'explain' && explain) {
    const steps = explain.steps ?? []
    return (
      <div className="a1-turn-content a1-turn-content--explain">
        <article className="a1-explain-card">
          <header className="a1-explain-head">
            <span className={`a1-explain-subject a1-explain-subject--${explain.subject}`}>
              {SUBJECT_LABEL[explain.subject] ?? '講解'}
            </span>
            <p className="a1-explain-question">{explain.question}</p>
          </header>
          {steps.length > 0 && (
            <ol className="a1-explain-steps">
              {steps.map((s, i) => (
                <li key={i} className="a1-explain-step">
                  {s}
                </li>
              ))}
            </ol>
          )}
          {explain.answer && (
            <p className="a1-explain-answer">
              <span className="a1-explain-answer__label">答案</span>
              {explain.answer}
            </p>
          )}
        </article>
      </div>
    )
  }

  return null
}
