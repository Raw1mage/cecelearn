import { useEffect, useRef, useState } from 'react'
import { apiClient, type A1LookupResponse } from '../../shared/api/client'
import { Button } from '../../shared/components/Button'
import { Panel } from '../../shared/components/Panel'
import { parseBopomofo } from './bopomofo'
import { createHanziWriter, getSpeechRecognitionConstructor } from './hanziWriterAdapter'

function VerticalBopomofo({ value }: { value: string }) {
  const { phonetics, tone } = parseBopomofo(value)
  return (
    <div className="bopomofo-wrapper">
      <div className="bopomofo-column">
        {phonetics.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
      <div className="tone-column">
        <span>{tone || '\u00A0'}</span>
      </div>
    </div>
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

  return (
    <div className="feature-page">
      <Panel>
        <h2>A1 - Chinese Word Lookup</h2>
        <p className="muted">前端保留語音輸入與 HanziWriter，查詢邏輯已改走 backend boundary。</p>
        <div className="toolbar-row">
          <input className="query-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：字、學、勇、百" />
          <Button onClick={() => void lookup()}>查詢</Button>
          <Button variant="secondary" onClick={toggleListening} disabled={!speechReady}>
            {listening ? '停止聆聽' : '語音輸入'}
          </Button>
          <Button variant="secondary" onClick={replay}>重播筆順</Button>
        </div>
        {status ? <p className="muted">{status}</p> : null}
      </Panel>

      <Panel>
        <div className="a1-result-grid">
          <div className="stroke-panel" ref={writerTargetRef} />
          <div>
            <h3 className="character-display">{result.character}</h3>
            <VerticalBopomofo value={result.bopomofo} />
            <p className="muted">查詢：{result.query}</p>
          </div>
        </div>
        <div className="word-chip-list">
          {result.words.map((word) => (
            <article key={`${word.term}-${word.bopomofo}`} className="word-chip">
              <strong>{word.term}</strong>
              <span>{word.bopomofo}</span>
            </article>
          ))}
        </div>
      </Panel>

      <Panel>
        <h3>最近查詢</h3>
        <div className="history-list">
          {history.map((item, idx) => (
            <button key={`${item.query}-${idx}`} className="history-item" onClick={() => { setQuery(item.query); void lookup(item.query) }}>
              {item.query} {"->"} {item.character} ({item.bopomofo})
            </button>
          ))}
        </div>
      </Panel>
    </div>
  )
}
