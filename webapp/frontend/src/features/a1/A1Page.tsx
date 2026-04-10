import { useEffect, useRef, useState } from 'react'
import { apiClient, type A1LookupResponse } from '../../shared/api/client'
import { Panel } from '../../shared/components/Panel'
import { createHanziWriter, getSpeechRecognitionConstructor } from './hanziWriterAdapter'

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
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<A1LookupResponse>(initialResult)
  const [history, setHistory] = useState<A1LookupResponse[]>([])
  const [status, setStatus] = useState('')
  const [speechReady, setSpeechReady] = useState(false)
  const [listening, setListening] = useState(false)
  const writerTargetRef = useRef<HTMLDivElement | null>(null)
  const writerRef = useRef<{ animateCharacter: () => void } | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

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
      setListening(false)
      setStatus('')
    }
    recognition.onerror = (event: { error: string }) => {
      setListening(false)
      setStatus(`語音辨識失敗：${event.error}`)
    }
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      const transcript = event.results[0][0].transcript.trim()
      setQuery(transcript)
      void lookup(transcript)
    }

    recognitionRef.current = recognition
    setSpeechReady(true)
  }, [])

  useEffect(() => {
    if (!writerTargetRef.current) return
    writerTargetRef.current.innerHTML = ''

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
    writerRef.current.animateCharacter()
  }

  function toggleListening() {
    if (!recognitionRef.current) return
    if (listening) recognitionRef.current.stop()
    else recognitionRef.current.start()
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

      <Panel>
        <div className="a1-stroke-container">
          <div className="a1-stroke-box" ref={writerTargetRef} />
          <button className="a1-replay-btn" onClick={replay} aria-label="重播筆順">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        </div>
      </Panel>

      <Panel>
        <h3>造詞</h3>
        <div className="word-chip-list a1-chip-grid">
          {result.words.map((word) => (
            <article key={`${word.term}-${word.bopomofo}`} className="word-chip">
              <strong>{word.term}</strong>
              <span>{word.bopomofo}</span>
            </article>
          ))}
        </div>
      </Panel>

      {result.idioms && result.idioms.length > 0 && (
        <Panel>
          <h3>相關成語</h3>
          <div className="word-chip-list a1-chip-grid">
            {result.idioms.map((idiom) => (
              <article key={`${idiom.term}-${idiom.bopomofo}`} className="word-chip">
                <strong>{idiom.term}</strong>
                <span>{idiom.bopomofo}</span>
              </article>
            ))}
          </div>
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
