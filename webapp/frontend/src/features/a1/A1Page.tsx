import { useEffect, useRef, useState } from 'react'
import { apiClient, type A1LookupResponse, type A1LookupWord } from '../../shared/api/client'
import { celebrate } from '../../shared/celebrate'
import { useScore } from '../../shared/ScoreContext'
import { Panel } from '../../shared/components/Panel'
import { parseBopomofo } from './bopomofo'
import { createHanziWriter, getSpeechRecognitionConstructor, type HanziWriterInstance } from './hanziWriterAdapter'

/** Render a word with vertical bopomofo annotation to the right of each character */
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
                  {ph.phonetics.map((p, j) => <span key={j}>{p}</span>)}
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

const initialResult: A1LookupResponse = {
  ok: true,
  query: '字',
  character: '字',
  bopomofo: 'ㄗˋ',
  words: [
    { term: '文字', bopomofo: 'ㄨㄣˊ ㄗˋ' },
    { term: '字典', bopomofo: 'ㄗˋ ㄉㄧㄢˇ' },
  ],
  idioms: [],
  note: '請輸入字詞或使用語音查詢。',
}

export function A1Page() {
  const { addScore } = useScore()
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<A1LookupResponse>(initialResult)
  const [history, setHistory] = useState<A1LookupResponse[]>([])
  const [status, setStatus] = useState('')
  const [speechReady, setSpeechReady] = useState(false)
  const [listening, setListening] = useState(false)
  const [practicing, setPracticing] = useState(false)
  const [wordsOpen, setWordsOpen] = useState(true)
  const [idiomsOpen, setIdiomsOpen] = useState(true)
  const writerTargetRef = useRef<HTMLDivElement | null>(null)
  const writerRef = useRef<HanziWriterInstance | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const wantListeningRef = useRef(false)

  useEffect(() => {
    const Recognition = getSpeechRecognitionConstructor()
    if (!Recognition) {
      setStatus('目前瀏覽器不支援語音辨識，請改用手動輸入。')
      return
    }

    const recognition = new Recognition()
    recognition.lang = 'cmn-Hant-TW'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onstart = () => {
      setListening(true)
      setStatus('正在聆聽...')
    }
    recognition.onend = () => {
      if (wantListeningRef.current) {
        try {
          recognition.start()
          return
        } catch {
          // browser rejected restart — fall through to stop
        }
      }
      wantListeningRef.current = false
      setListening(false)
      setStatus('')
    }
    recognition.onerror = (event: { error: string }) => {
      wantListeningRef.current = false
      setListening(false)
      setStatus(`語音辨識失敗：${event.error}`)
    }
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      const transcript = event.results[0][0].transcript.trim()
      const wakeMatch = transcript.match(/^小雞小雞[，,、\s]*(.+)/)
      if (!wakeMatch) return
      const command = wakeMatch[1].trim()
      if (!command) return
      setQuery(command)
      void lookup(command)
    }

    recognitionRef.current = recognition
    setSpeechReady(true)

    // Auto-start listening on page load
    wantListeningRef.current = true
    recognition.start()
  }, [])

  useEffect(() => {
    if (!writerTargetRef.current) return
    writerTargetRef.current.innerHTML = ''
    setPracticing(false)

    try {
      writerRef.current = createHanziWriter(writerTargetRef.current, result.character)
      writerRef.current.animateCharacter()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '無法初始化筆順顯示。')
      writerRef.current = null
    }
  }, [result.character])

  async function lookup(value = query) {
    const normalized = value.trim()
    if (!normalized) {
      setStatus('請先輸入要查詢的字詞。')
      return
    }

    setStatus('查詢中...')
    try {
      const response = await apiClient.lookupWord(normalized)
      setResult(response)
      setQuery(response.character)
      setHistory((current) => [response, ...current].slice(0, 8))
      setStatus(response.note ?? '')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '查詢失敗。')
    }
  }

  function replay() {
    if (!writerRef.current) {
      setStatus('目前沒有可重播的筆順動畫。')
      return
    }
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

  function toggleListening() {
    if (!recognitionRef.current) return
    if (listening) {
      wantListeningRef.current = false
      recognitionRef.current.stop()
    } else {
      wantListeningRef.current = true
      recognitionRef.current.start()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') void lookup()
  }

  return (
    <div className="feature-page">
      <Panel>
        <div className="a1-input-wrap">
          <input
            className="a1-query-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="輸入想查的字，例如：字、學、勇、百"
          />
          <button
            className={`a1-mic-btn${listening ? ' a1-mic-btn--active' : ''}`}
            onClick={toggleListening}
            disabled={!speechReady}
            aria-label={listening ? '停止聆聽' : '語音輸入'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>
          <button className="a1-search-btn" onClick={() => void lookup()} aria-label="查詢">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
        </div>
        {status ? <p className="muted" style={{ marginTop: '0.5rem' }}>{status}</p> : null}
      </Panel>

      <div className="a1-stroke-container">
        <div className={`a1-stroke-box${practicing ? ' a1-stroke-box--practice' : ''}`} ref={writerTargetRef} />
        <div className="a1-stroke-actions">
          <button className="a1-action-btn" onClick={replay} aria-label="重播筆順" title="重播">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          </button>
          <button className={`a1-action-btn${practicing ? ' a1-action-btn--active' : ''}`} onClick={startPractice} aria-label="練習寫字" title="練習">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
          </button>
        </div>
      </div>

      <Panel>
        <button className="a1-collapse-header" onClick={() => setWordsOpen(o => !o)}>
          <span className={`a1-collapse-arrow${wordsOpen ? ' a1-collapse-arrow--open' : ''}`}>▶</span>
          <h3>造詞</h3>
        </button>
        {wordsOpen && (
          <div className="word-chip-list a1-chip-grid">
            {result.words.map((word) => (
              <article key={`${word.term}-${word.bopomofo}`} className="word-chip">
                <RubyWord {...word} />
              </article>
            ))}
          </div>
        )}
      </Panel>

      {result.idioms && result.idioms.length > 0 && (
        <Panel>
          <button className="a1-collapse-header" onClick={() => setIdiomsOpen(o => !o)}>
            <span className={`a1-collapse-arrow${idiomsOpen ? ' a1-collapse-arrow--open' : ''}`}>▶</span>
            <h3>相關成語</h3>
          </button>
          {idiomsOpen && (
            <div className="word-chip-list a1-chip-grid">
              {result.idioms.map((idiom) => (
                <article key={`${idiom.term}-${idiom.bopomofo}`} className="word-chip">
                  <RubyWord {...idiom} />
                </article>
              ))}
            </div>
          )}
        </Panel>
      )}

      <Panel>
        <h3>最近查詢</h3>
        <div className="history-list">
          {history.map((item, idx) => (
            <button key={`${item.query}-${idx}`} className="history-item" onClick={() => { setQuery(item.query); void lookup(item.query) }}>
              {item.character}（{item.bopomofo}）
            </button>
          ))}
        </div>
      </Panel>
    </div>
  )
}
