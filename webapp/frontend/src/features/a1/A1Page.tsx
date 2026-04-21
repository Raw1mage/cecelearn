import { useEffect, useRef, useState } from "react";
import {
  apiClient,
  type A1LookupResponse,
  type A1LookupWord,
} from "../../shared/api/client";
import { celebrate } from "../../shared/celebrate";
import { useScore } from "../../shared/ScoreContext";
import { Panel } from "../../shared/components/Panel";
import { parseBopomofo } from "./bopomofo";
import {
  createHanziWriter,
  getSpeechRecognitionConstructor,
  type HanziWriterInstance,
} from "./hanziWriterAdapter";

/** Render a word with vertical bopomofo annotation to the right of each character */
function RubyWord({ term, bopomofo }: A1LookupWord) {
  const chars = term.split("");
  const phonetics = bopomofo.split(" ").filter(Boolean);

  return (
    <span className="ruby-word">
      {chars.map((char, i) => {
        const ph = i < phonetics.length ? parseBopomofo(phonetics[i]) : null;
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
                <span className="ruby-char__tone">{ph.tone || "\u00A0"}</span>
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

const initialResult: A1LookupResponse = {
  ok: true,
  query: "字",
  character: "字",
  bopomofo: "ㄗˋ",
  words: [
    { term: "文字", bopomofo: "ㄨㄣˊ ㄗˋ" },
    { term: "字典", bopomofo: "ㄗˋ ㄉㄧㄢˇ" },
  ],
  idioms: [],
  note: "請輸入字詞或使用語音查詢。",
};

export function A1Page() {
  const samsungManualPrompt = "點一下麥克風後直接說出要查的字詞。";
  const { addScore } = useScore();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<A1LookupResponse>(initialResult);
  const [history, setHistory] = useState<A1LookupResponse[]>([]);
  const [status, setStatus] = useState("");
  const [speechReady, setSpeechReady] = useState(false);
  const [listening, setListening] = useState(false);
  const [practicing, setPracticing] = useState(false);
  const [wakeHit, setWakeHit] = useState(false);
  const [wordsOpen, setWordsOpen] = useState(true);
  const [idiomsOpen, setIdiomsOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);
  const strokeContainerRef = useRef<HTMLDivElement | null>(null);
  const writerTargetRef = useRef<HTMLDivElement | null>(null);
  const writerRef = useRef<HanziWriterInstance | null>(null);
  const historyPanelRef = useRef<HTMLElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const samsungManualModeRef = useRef(false);
  const wantListeningRef = useRef(false);
  const triggeredRef = useRef(false);
  const wakeWindowRef = useRef(false);
  const wakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recRunningRef = useRef(false);
  const vadActiveRef = useRef(false);
  const lookupRef = useRef<(value: string) => Promise<void>>(null!);
  const startListeningFlowRef = useRef<() => void>(() => {});
  const stopVadRef = useRef<() => void>(() => {});

  useEffect(() => {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      setStatus("目前瀏覽器不支援語音辨識，請改用手動輸入。");
      return;
    }

    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let stream: MediaStream | null = null;
    let vadRafId = 0;
    const VAD_THRESHOLD = 0.015;

    const recognition = new Recognition();
    const isSamsungManualMode =
      /SamsungBrowser|SM-|Galaxy|SAMSUNG/i.test(navigator.userAgent) ||
      (/Android/i.test(navigator.userAgent) && navigator.maxTouchPoints > 0);
    samsungManualModeRef.current = isSamsungManualMode;
    recognition.lang = "cmn-Hant-TW";
    recognition.continuous = !isSamsungManualMode;
    recognition.interimResults = !isSamsungManualMode;
    recognition.maxAlternatives = 1;

    /** Read current RMS from the analyser (0 if unavailable) */
    function getRms(): number {
      if (!analyser) return 0;
      const buf = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      return Math.sqrt(sum / buf.length);
    }

    function startRecognition() {
      if (recRunningRef.current || !wantListeningRef.current) return;
      try {
        recognition.start();
      } catch {
        /* already started */
      }
    }

    function openWakeWindow() {
      setWakeHit(true);
      wakeWindowRef.current = true;
      setStatus("聽到了！請說要查的字...");
      if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current);
      wakeTimerRef.current = setTimeout(() => {
        wakeWindowRef.current = false;
        setWakeHit(false);
        setStatus("正在聆聽... 請說「小雞小雞，○○的×怎麼寫」");
      }, 4000);
    }

    // ── VAD-wait loop: only runs when recognition is NOT running ──
    // Polls audio level; starts recognition when voice is detected.
    function vadWaitLoop() {
      if (!wantListeningRef.current || recRunningRef.current) return;
      vadRafId = requestAnimationFrame(vadWaitLoop);
      if (getRms() > VAD_THRESHOLD) {
        cancelAnimationFrame(vadRafId);
        startRecognition();
      }
    }

    function startVadWait() {
      vadActiveRef.current = true;
      vadRafId = requestAnimationFrame(vadWaitLoop);
    }

    function stopVad() {
      vadActiveRef.current = false;
      cancelAnimationFrame(vadRafId);
    }

    function resumeListening() {
      stopVad();
      startRecognition();
      if (!recRunningRef.current) startVadWait();
    }

    function startSamsungRecognition() {
      if (recRunningRef.current) return;
      triggeredRef.current = false;
      wakeWindowRef.current = false;
      setWakeHit(false);
      wantListeningRef.current = true;
      setStatus(samsungManualPrompt);
      try {
        recognition.start();
      } catch {
        setStatus("麥克風忙碌中，請稍後再試。")
      }
    }

    startListeningFlowRef.current = isSamsungManualMode
      ? startSamsungRecognition
      : resumeListening;
    stopVadRef.current = stopVad;

    // ── Recognition event handlers ──
    recognition.onstart = () => {
      recRunningRef.current = true;
      setListening(true);
      setStatus(
        isSamsungManualMode
          ? samsungManualPrompt
          : "正在聆聽... 請說「小雞小雞，○○的×怎麼寫」",
      );
    };
    recognition.onend = () => {
      recRunningRef.current = false;
      if (isSamsungManualMode) {
        wantListeningRef.current = false;
        setListening(false);
        setStatus(triggeredRef.current ? "查詢中..." : samsungManualPrompt);
        return;
      }
      if (!wantListeningRef.current) {
        setListening(false);
        setStatus("");
        return;
      }
      // Browser killed the session. Decide whether to restart now or wait.
      if (getRms() > VAD_THRESHOLD) {
        // Someone is speaking right now → restart immediately
        startRecognition();
      } else {
        // Silent → don't restart (avoids beep). VAD will wake us when voice comes.
        startVadWait();
      }
    };
    recognition.onerror = (event: { error: string }) => {
      if (isSamsungManualMode) {
        recRunningRef.current = false;
        wantListeningRef.current = false;
        setListening(false);
        if (event.error === "aborted") {
          setStatus("");
          return;
        }
        if (event.error === "no-speech") {
          setStatus("沒有聽清楚，請再按一次麥克風。")
          return;
        }
        setStatus(`語音辨識失敗：${event.error}`);
        return;
      }
      if (event.error === "no-speech" || event.error === "aborted") return;
      recRunningRef.current = false;
      wantListeningRef.current = false;
      stopVad();
      setListening(false);
      setStatus(`語音辨識失敗：${event.error}`);
    };
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      if (triggeredRef.current) return;

      const latest = event.results[event.results.length - 1];
      const transcript = latest[0].transcript.trim();
      if (transcript.length > 50) return;

      if (isSamsungManualMode) {
        if (!latest.isFinal || !transcript) return;
        triggeredRef.current = true;
        setQuery(transcript);
        void lookupRef.current(transcript);
        return;
      }

      // Interim: detect wake word + keep wake window alive while speaking
      if (!latest.isFinal) {
        if (transcript.includes("小雞")) {
          openWakeWindow();
        }
        if (wakeWindowRef.current && wakeTimerRef.current) {
          clearTimeout(wakeTimerRef.current);
          wakeTimerRef.current = setTimeout(() => {
            wakeWindowRef.current = false;
            setWakeHit(false);
            setStatus("正在聆聽... 請說「小雞小雞，○○的×怎麼寫」");
          }, 4000);
        }
        return;
      }

      // Final result: two-phase wake word handling
      const wakeMatch = transcript.match(/^小雞小雞[，,、\s]*(.+)/);
      if (wakeMatch) {
        const command = wakeMatch[1].trim();
        if (command) {
          triggeredRef.current = true;
          if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current);
          wakeWindowRef.current = false;
          setQuery(command);
          void lookupRef.current(command);
          return;
        }
      }

      if (transcript.includes("小雞")) {
        openWakeWindow();
        return;
      }

      if (wakeWindowRef.current) {
        if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current);
        wakeWindowRef.current = false;
        triggeredRef.current = true;
        setQuery(transcript);
        void lookupRef.current(transcript);
        return;
      }

      setWakeHit(false);
    };

    recognitionRef.current = recognition;

    if (isSamsungManualMode) {
      setSpeechReady(true);
      setStatus(samsungManualPrompt);

      return () => {
        wantListeningRef.current = false;
        try {
          recognition.abort();
        } catch {
          /* ok */
        }
        if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current);
      };
    }

    // ── Bootstrap: open mic via getUserMedia (silent), then start recognition ──
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((s) => {
        stream = s;
        audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        setSpeechReady(true);
        wantListeningRef.current = true;
        // Start recognition immediately — one beep on page load is acceptable.
        // After this, continuous=true keeps it alive; onend uses VAD to decide restart.
        startRecognition();
      })
      .catch(() => {
        setStatus("無法取得麥克風權限，請在設定中允許。");
      });

    return () => {
      wantListeningRef.current = false;
      stopVad();
      startListeningFlowRef.current = () => {};
      stopVadRef.current = () => {};
      try {
        recognition.abort();
      } catch {
        /* ok */
      }
      if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current);
      if (audioCtx) audioCtx.close();
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    let frameId = 0;

    const syncHistoryPanelHeight = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        if (!historyPanelRef.current) {
          historyPanelRef.current = document.querySelector<HTMLElement>(".a1-history-panel");
        }
        const historyPanel = historyPanelRef.current;
        const strokeContainer = strokeContainerRef.current;
        if (!historyPanel || !strokeContainer) return;

        const isTabletLandscape = window.matchMedia(
          "(orientation: landscape) and (min-width: 768px)",
        ).matches;
        if (!isTabletLandscape) {
          historyPanel.style.removeProperty("--a1-history-panel-height");
          return;
        }

        const canvasBottom = strokeContainer.getBoundingClientRect().bottom;
        const historyTop = historyPanel.getBoundingClientRect().top;
        const nextHeight = Math.max(0, Math.round(canvasBottom - historyTop));
        historyPanel.style.setProperty("--a1-history-panel-height", `${nextHeight}px`);
      });
    };

    syncHistoryPanelHeight();
    window.addEventListener("resize", syncHistoryPanelHeight);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", syncHistoryPanelHeight);
    };
  }, [history.length, historyOpen, idiomsOpen, result.idioms.length, result.words.length, status, wordsOpen]);

  useEffect(() => {
    if (!writerTargetRef.current) return;
    writerTargetRef.current.innerHTML = "";
    setPracticing(false);

    try {
      writerRef.current = createHanziWriter(
        writerTargetRef.current,
        result.character,
      );
      writerRef.current.animateCharacter();
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "無法初始化筆順顯示。",
      );
      writerRef.current = null;
    }
  }, [result.character]);

  lookupRef.current = lookup;
  async function lookup(value = query) {
    const normalized = value.trim();
    if (!normalized) {
      setStatus("請先輸入要查詢的字詞。");
      return;
    }

    setStatus("查詢中...");
    try {
      const response = await apiClient.lookupWord(normalized);
      setResult(response);
      // Show corrected full phrase (e.g. "老師的溼" → "老師的師")
      const deIdx = normalized.lastIndexOf("的");
      if (deIdx >= 0 && response.character !== normalized) {
        setQuery(normalized.slice(0, deIdx + 1) + response.character);
      } else {
        setQuery(response.character);
      }
      setHistory((current) => [response, ...current].slice(0, 8));
      setStatus(response.note ?? "");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "查詢失敗。");
    } finally {
      triggeredRef.current = false;
      setWakeHit(false);
    }
  }

  function replay() {
    if (!writerRef.current) {
      setStatus("目前沒有可重播的筆順動畫。");
      return;
    }
    setPracticing(false);
    writerRef.current.showCharacter();
    writerRef.current.animateCharacter();
  }

  function startPractice() {
    if (!writerRef.current) return;
    setPracticing(true);
    writerRef.current.quiz({
      onComplete: () => {
        celebrate();
        addScore(1);
        setPracticing(false);
      },
    });
  }

  function toggleListening() {
    if (!recognitionRef.current) return;
    if (listening) {
      wantListeningRef.current = false;
      if (!samsungManualModeRef.current) stopVadRef.current();
      wakeWindowRef.current = false;
      triggeredRef.current = false;
      setWakeHit(false);
      if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current);
      try {
        recognitionRef.current.abort();
      } catch {
        /* ok */
      }
      setListening(false);
      setStatus("");
    } else {
      wantListeningRef.current = true;
      startListeningFlowRef.current();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") void lookup();
  }

  return (
    <div className="feature-page">
      <div className="a1-main-layout">
        <div className="a1-left-col">
          <Panel className={wakeHit ? "a1-panel--wake" : undefined}>
            <div className="a1-input-wrap">
              <input
                className="a1-query-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="輸入想查的字，例如：字、學、勇、百"
              />
              <button
                className={`a1-mic-btn${listening ? " a1-mic-btn--active" : ""}`}
                onClick={toggleListening}
                disabled={!speechReady}
                aria-label={listening ? "停止聆聽" : "語音輸入"}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </button>
              <button
                className="a1-search-btn"
                onClick={() => void lookup()}
                aria-label="查詢"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </button>
            </div>
            {status ? (
              <p className="muted" style={{ marginTop: "0.5rem" }}>
                {status}
              </p>
            ) : null}
          </Panel>

          <div className="a1-stroke-container" ref={strokeContainerRef}>
            <div
              className={`a1-stroke-box${practicing ? " a1-stroke-box--practice" : ""}`}
              ref={writerTargetRef}
            />
            <div className="a1-stroke-actions">
              <button
                className="a1-action-btn"
                onClick={replay}
                aria-label="重播筆順"
                title="重播"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
              <button
                className={`a1-action-btn${practicing ? " a1-action-btn--active" : ""}`}
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
        </div>

        <Panel>
          <button
            className="a1-collapse-header"
            onClick={() => setWordsOpen((o) => !o)}
          >
            <span
              className={`a1-collapse-arrow${wordsOpen ? " a1-collapse-arrow--open" : ""}`}
            >
              ▶
            </span>
            <h3>造詞</h3>
          </button>
          {wordsOpen && (
            <div className="word-chip-list a1-chip-grid">
              {result.words.map((word) => (
                <article
                  key={`${word.term}-${word.bopomofo}`}
                  className="word-chip"
                >
                  <RubyWord {...word} />
                </article>
              ))}
            </div>
          )}
        </Panel>

        <Panel>
          <button
            className="a1-collapse-header"
            onClick={() => setIdiomsOpen((o) => !o)}
          >
            <span
              className={`a1-collapse-arrow${idiomsOpen ? " a1-collapse-arrow--open" : ""}`}
            >
              ▶
            </span>
            <h3>相關成語</h3>
          </button>
          {idiomsOpen && (
            <div className="word-chip-list a1-chip-grid">
              {(result.idioms ?? []).map((idiom) => (
                <article
                  key={`${idiom.term}-${idiom.bopomofo}`}
                  className="word-chip"
                >
                  <RubyWord {...idiom} />
                </article>
              ))}
            </div>
          )}
        </Panel>

        <Panel className="a1-history-panel">
          <button
            className="a1-collapse-header"
            onClick={() => setHistoryOpen((o) => !o)}
          >
            <span
              className={`a1-collapse-arrow${historyOpen ? " a1-collapse-arrow--open" : ""}`}
            >
              ▶
            </span>
            <h3>最近查詢</h3>
          </button>
          {historyOpen && (
            <div className="history-list">
              {history.map((item, idx) => (
                <button
                  key={`${item.query}-${idx}`}
                  className="history-item"
                  onClick={() => {
                    setQuery(item.query);
                    void lookup(item.query);
                  }}
                >
                  {item.character}（{item.bopomofo}）
                </button>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
