import { useEffect, useRef, useState } from "react";
import { useConversation } from "./hooks/useConversation";
import { ConversationView } from "./components/ConversationView";
import { Panel } from "../../shared/components/Panel";
import { A5Page } from "../a5/A5Page";
import { A2Page } from "../a2/A2Page";
import {
  isTtsSupported,
  isTtsEnabled,
  setTtsEnabled,
  isWithinSpeechGuard,
  isLikelySelfEcho,
  addSpeechEndListener,
} from "../../shared/speech/tts";
import { getSpeechRecognitionConstructor } from "./hanziWriterAdapter";

/** 偵測「○○的×」查字結構，給後端 hint=lookup（維持既有 lookup 行為不退化，DD-3） */
function detectLookupHint(text: string): "lookup" | undefined {
  const clean = text.replace(/\s+/g, "");
  const deIdx = clean.lastIndexOf("的");
  if (deIdx >= 0) {
    const after = clean.slice(deIdx + 1);
    if (/^[\u4e00-\u9fff]怎麼寫?$/.test(after) || /^[\u4e00-\u9fff]$/.test(after)) {
      return "lookup";
    }
  }
  if (/^[\u4e00-\u9fff]怎麼寫$/.test(clean)) return "lookup";
  return undefined;
}

export function A1Page() {
  const samsungManualPrompt = "點一下麥克風後直接說出要查的字詞。";
  const {
    messages,
    status: convStatus,
    busy,
    illustrations,
    activeOverlay,
    sendTurn,
    redrawIllustration,
    openOverlay,
    closeOverlay,
    onQuizComplete,
  } = useConversation();

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [speechReady, setSpeechReady] = useState(false);
  const [listening, setListening] = useState(false);
  const [ttsOn, setTtsOn] = useState(isTtsEnabled());

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const samsungManualModeRef = useRef(false);
  const wantListeningRef = useRef(false);
  const triggeredRef = useRef(false);
  const recRunningRef = useRef(false);
  const vadActiveRef = useRef(false);
  const lookupRef = useRef<(value: string) => Promise<void>>(null!);
  const startListeningFlowRef = useRef<() => void>(() => {});
  const stopVadRef = useRef<() => void>(() => {});

  // ──────────────────────────────────────────────────────────────────
  // 語音辨識核心 useEffect（DD-10：完全保留，不重寫；僅辨識結果下游改指向 sendTurn）
  // ──────────────────────────────────────────────────────────────────
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
    let restartTimer: ReturnType<typeof setTimeout> | undefined;
    let watchdogTimer: ReturnType<typeof setInterval> | undefined;
    let lastAliveAt = Date.now();
    let removeSpeechEndListener: (() => void) | undefined;
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
        startVadWait();
      }
    }

    // ── VAD-wait loop: only runs when recognition is NOT running ──
    // Polls audio level; starts recognition when voice is detected.
    function vadWaitLoop() {
      if (!wantListeningRef.current || recRunningRef.current) return;
      vadRafId = requestAnimationFrame(vadWaitLoop);
      if (isWithinSpeechGuard()) return;
      if (getRms() > VAD_THRESHOLD) {
        cancelAnimationFrame(vadRafId);
        vadActiveRef.current = false;
        startRecognition();
      }
    }

    function startVadWait() {
      if (vadActiveRef.current) return;
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

    // TTS 後 recognition 常被 Chrome 靜默弄聾（甚至不發 onend，recRunning 卡 true）。
    // 不靠 RMS：直接 abort 既有 session 再開全新 session（等同手動關開麥克風的恢復路徑）。
    function restartSession() {
      if (!wantListeningRef.current) return;
      if (isWithinSpeechGuard()) {
        // 仍在朗讀 / echo 尾窗內：稍後再試，等 guard 解除。
        clearTimeout(restartTimer);
        restartTimer = setTimeout(restartSession, 400);
        return;
      }
      stopVad();
      try {
        recognition.abort();
      } catch {
        /* ok */
      }
      recRunningRef.current = false;
      clearTimeout(restartTimer);
      restartTimer = setTimeout(() => {
        if (!wantListeningRef.current || isWithinSpeechGuard()) return;
        try {
          recognition.start();
        } catch {
          // 前一個 session 尚未完全停止：再延遲重試一次。
          restartTimer = setTimeout(() => {
            try {
              recognition.start();
            } catch {
              /* ok */
            }
          }, 300);
        }
      }, 200);
    }

    function startSamsungRecognition() {
      if (recRunningRef.current) return;
      triggeredRef.current = false;
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
      lastAliveAt = Date.now();
      setListening(true);
      setStatus(
        isSamsungManualMode
          ? samsungManualPrompt
          : "我在聽，直接說說看吧！",
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
      // Browser may end recognition while TTS is playing. Do not restart immediately
      // from speaker RMS; wait until speech guard clears, then VAD will self-heal.
      startVadWait();
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
      if (event.error === "no-speech" || event.error === "aborted") {
        recRunningRef.current = false;
        if (wantListeningRef.current) startVadWait();
        return;
      }
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
        void lookupRef.current(transcript);
        return;
      }

      // 自由對話模式（DD-10 v2）：不需喚醒詞。interim 略過，final 直接送出。
      if (!latest.isFinal) return;
      if (!transcript) return;

      // echo 軟閘（DD-11）：小雞朗讀時/尾窗內，或文字高度吻合最近朗讀內容時，
      // 丟棄該結果擋掉自我迴圈。麥克風不暫停（保住全雙工）。
      if (isWithinSpeechGuard() || isLikelySelfEcho(transcript)) return;

      triggeredRef.current = true;
      void lookupRef.current(transcript);
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
        startRecognition();
      })
      .catch(() => {
        setStatus("無法取得麥克風權限，請在設定中允許。");
      });

    // 小雞老師朗讀結束 → 主動重建辨識 session（TTS 後 Chrome 常把 recognition 弄聾）。
    removeSpeechEndListener = addSpeechEndListener(() => {
      if (isSamsungManualMode || !wantListeningRef.current) return;
      // 等 echo 尾窗解除後再重建，避免立刻聽到自己的尾音。
      clearTimeout(restartTimer);
      restartTimer = setTimeout(restartSession, 900);
    });

    // watchdog 兜底：每 3 秒檢查，若「想聽但 session 已死太久」就硬重建。
    // 涵蓋 TTS 後 recognition 變聾卻不發 onend（recRunning 卡 true）的情況，
    // 以及 AudioContext 被瀏覽器 suspend 的恢復。
    if (!isSamsungManualMode) {
      watchdogTimer = setInterval(() => {
        if (!wantListeningRef.current) return;
        if (audioCtx && audioCtx.state === "suspended") {
          void audioCtx.resume().catch(() => {});
        }
        if (isWithinSpeechGuard()) return;
        const stalledMs = Date.now() - lastAliveAt;
        if (!recRunningRef.current && stalledMs > 1500) {
          restartSession();
        } else if (recRunningRef.current && stalledMs > 12000) {
          // 宣稱在跑但長時間零事件 → 極可能已變聾，硬重建。
          restartSession();
        }
      }, 3000);
    }

    return () => {
      wantListeningRef.current = false;
      stopVad();
      clearTimeout(restartTimer);
      clearInterval(watchdogTimer);
      removeSpeechEndListener?.();
      startListeningFlowRef.current = () => {};
      stopVadRef.current = () => {};
      try {
        recognition.abort();
      } catch {
        /* ok */
      }
      if (audioCtx) audioCtx.close();
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // 麥克風互斥（DD-5/R2）：overlay 開啟時暫停 A1 語音辨識（避免與 A5 TTS 資源衝突），
  // 關閉時恢復。複用既有 abort / startListeningFlow 路徑，不動語音核心 useEffect（DD-10）。
  const wasListeningBeforeOverlayRef = useRef(false);
  useEffect(() => {
    if (activeOverlay) {
      // 記住進 overlay 前是否在聽，關閉後據此恢復。
      wasListeningBeforeOverlayRef.current = wantListeningRef.current;
      wantListeningRef.current = false;
      triggeredRef.current = false;
      if (!samsungManualModeRef.current) stopVadRef.current();
      try {
        recognitionRef.current?.abort();
      } catch {
        /* ok */
      }
      setListening(false);
    } else if (wasListeningBeforeOverlayRef.current) {
      // 關閉 overlay 且先前在聽：恢復辨識。
      wasListeningBeforeOverlayRef.current = false;
      if (recognitionRef.current) {
        wantListeningRef.current = true;
        startListeningFlowRef.current();
      }
    }
  }, [activeOverlay]);

  // 辨識結果下游：sendTurn 包裝（DD-10：lookupRef 改指向對話送出）
  lookupRef.current = sendTurnFromSpeech;
  async function sendTurnFromSpeech(value = query) {
    const normalized = value.trim();
    if (!normalized) {
      setStatus("請先輸入或說一句話。");
      return;
    }
    // 送出後清空輸入欄：已送出的字（normalized）已存區域變數，不該再留在欄位裡
    setQuery("");
    setStatus("");
    try {
      await sendTurn(normalized, detectLookupHint(normalized));
    } finally {
      triggeredRef.current = false;
    }
  }

  function toggleListening() {
    if (!recognitionRef.current) return;
    if (listening) {
      wantListeningRef.current = false;
      if (!samsungManualModeRef.current) stopVadRef.current();
      triggeredRef.current = false;
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
    if (e.key === "Enter") void sendTurnFromSpeech();
  }

  function toggleTts() {
    const next = !ttsOn;
    setTtsOn(next);
    setTtsEnabled(next);
  }

  const displayStatus = status || convStatus;

  return (
    <div className="feature-page">
      <div className="a1-chat-layout">
        <Panel className="a1-input-panel">
          <div className="a1-input-wrap">
              <input
                className="a1-query-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="說說看：用蘋果造句、花可以組什麼詞、蘋果的蘋、說個故事"
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
                onClick={() => void sendTurnFromSpeech()}
                aria-label="送出"
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
              {isTtsSupported() && (
                <button
                  className={`a1-action-btn${ttsOn ? " a1-action-btn--active" : ""}`}
                  onClick={toggleTts}
                  aria-label={ttsOn ? "關閉朗讀" : "開啟朗讀"}
                  title={ttsOn ? "朗讀：開" : "朗讀：關"}
                >
                  {ttsOn ? "🔊" : "🔇"}
                </button>
              )}
            </div>
          <div className="a1-quick-chips">
            <button
              type="button"
              className="a1-quick-chip"
              onClick={() => openOverlay("dictation")}
            >
              ✏️ 聽寫
            </button>
            <button
              type="button"
              className="a1-quick-chip"
              onClick={() => openOverlay("idiom")}
            >
              🧩 成語
            </button>
          </div>
          {displayStatus ? (
            <p className="muted" style={{ marginTop: "0.5rem" }}>
              {displayStatus}
            </p>
          ) : null}
        </Panel>

        <Panel className="a1-conversation-panel">
          <ConversationView
            messages={messages}
            busy={busy}
            illustrations={illustrations}
            onRedraw={redrawIllustration}
          />
        </Panel>
      </div>

      {activeOverlay && (
        <div className="a1-quiz-overlay" role="dialog" aria-modal="true">
          <button
            type="button"
            className="a1-quiz-overlay__close"
            onClick={closeOverlay}
            aria-label="關閉並回到小雞老師"
          >
            ✕
          </button>
          <div className="a1-quiz-overlay__body">
            {activeOverlay === "dictation" ? (
              <A5Page onClose={closeOverlay} onComplete={onQuizComplete} />
            ) : (
              <A2Page onClose={closeOverlay} onComplete={onQuizComplete} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
