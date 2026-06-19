import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConversation } from "./hooks/useConversation";
import { SpeechCaptureContext, type SpeechCapture } from "./speechCapture";
import { ConversationView } from "./components/ConversationView";
import { Panel } from "../../shared/components/Panel";
import { A5Page } from "../a5/A5Page";
import { A2Page } from "../a2/A2Page";
import { QuizPage } from "../a6/QuizPage";
import {
  isTtsSupported,
  isWithinSpeechGuard,
  isLikelySelfEcho,
  addSpeechEndListener,
  cancelSpeech,
  isSpeaking,
} from "../../shared/speech/tts";
import { getSpeechRecognitionConstructor } from "./hanziWriterAdapter";
import { apiClient } from "../../shared/api/client";

/**
 * 把拍到的照片縮到最長邊 1280px、輸出 JPEG（品質 0.72），回 { base64, mimeType }。
 * 縮圖是為了上傳快、省頻寬，OCR 不需要原始高解析度。base64 不含 data: 前綴。
 */
async function fileToDownscaledBase64(
  file: File,
): Promise<{ base64: string; mimeType: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("讀取照片失敗"));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("照片格式看不懂"));
    el.src = dataUrl;
  });
  const MAX = 1280;
  const scale = Math.min(1, MAX / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("無法處理照片");
  ctx.drawImage(img, 0, 0, w, h);
  const out = canvas.toDataURL("image/jpeg", 0.72);
  return { base64: out.split(",")[1] ?? "", mimeType: "image/jpeg" };
}

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
    videos,
    activeOverlay,
    storyActive,
    sendTurn,
    endStory,
    redrawIllustration,
    retryVideos,
    openOverlay,
    closeOverlay,
    onQuizComplete,
  } = useConversation();

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [speechReady, setSpeechReady] = useState(false);
  const [listening, setListening] = useState(false);
  const [reading, setReading] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const samsungManualModeRef = useRef(false);
  const wantListeningRef = useRef(false);
  const triggeredRef = useRef(false);
  const recRunningRef = useRef(false);
  const vadActiveRef = useRef(false);
  // 累積送出（DD-24）：辨識的 final 片段先累積進 pendingTranscriptRef、不立即送；
  // 啟動 commitTimerRef 的「靜默寬限窗」，逾時（小朋友真的停夠久）才整段送出。
  // 句中停頓不再被瀏覽器 VAD 的 isFinal 誤判成「講完了」而提早送半句。
  const pendingTranscriptRef = useRef("");
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lookupRef = useRef<(value: string) => Promise<void>>(null!);
  // 丟棄累積中的語音段（外力打斷時呼叫，由語音核心 useEffect 注入實作）。
  const discardPendingRef = useRef<() => void>(() => {});
  const startListeningFlowRef = useRef<() => void>(() => {});
  const stopVadRef = useRef<() => void>(() => {});
  // 跟讀借用主辨識（DD-跟讀）：pending 借用狀態 + 借用入口。
  // captureStateRef 非 null 代表「現在有一次跟讀借用在等結果」——onresult 會把下一句
  // final 結果導回這裡，而非送進對話。
  const captureStateRef = useRef<{
    resolve: (text: string) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
    prevLang: string;
    prevWant: boolean;
  } | null>(null);
  const captureOnceRef = useRef<(lang: string, timeoutMs: number) => Promise<string>>(
    () => Promise.reject(new Error("語音尚未就緒")),
  );
  // 取消進行中的跟讀借用：給「外力打斷辨識」的路徑（開 overlay、手動停麥克風）呼叫，
  // 把語言切回中文並 reject promise，避免主辨識被卡在 en-US 而弄壞中文對話。
  const cancelCaptureRef = useRef<() => void>(() => {});
  // 找影片時暫停麥克風：記住「影片開始前麥克風是否開著」，影片播完才據此自動開回。
  const micWasOnBeforeVideoRef = useRef(false);
  const videoPlayingRef = useRef(false);

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
    // 小朋友已搶得發言權（barge-in 後到本段送出/丟棄之間）：echo 軟閘暫時不丟棄辨識結果，
    // 讓插話後的後續語音能即時流入累積（小雞已被 cancelSpeech 停掉，沒有自己的聲音可回授）。
    let childHasFloor = false;
    let removeSpeechEndListener: (() => void) | undefined;
    const VAD_THRESHOLD = 0.015;
    // 靜默寬限窗（DD-24）：收到 final 後再等這麼久沒有新語音，才把累積的整段話送出。
    // 小朋友句中停頓思考時，瀏覽器 VAD 會吐 isFinal；只要寬限窗內又開口（interim/final）
    // 就重置計時、繼續累積，不會把半句話提早送出。給足夠長讓孩子把話講完。
    const SILENCE_COMMIT_MS = 2500;

    // 把累積的整段話送出（小朋友真的停夠久了）。清空緩衝、上觸發鎖、導向對話送出。
    function commitPending() {
      commitTimerRef.current = undefined;
      const full = pendingTranscriptRef.current.trim();
      pendingTranscriptRef.current = "";
      // 本段結束：交還發言權，下一輪重新評估 echo 軟閘（barge-in 狀態不殘留）。
      childHasFloor = false;
      if (!full || triggeredRef.current) return;
      triggeredRef.current = true;
      void lookupRef.current(full);
    }

    // 重置靜默寬限計時：每次偵測到新語音（interim 或 final）就呼叫，延後送出。
    function armCommitTimer() {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
      commitTimerRef.current = setTimeout(commitPending, SILENCE_COMMIT_MS);
    }

    // 丟棄累積中的這段話（外力打斷：停麥克風 / 開 overlay / 播影片 / 跟讀借用 / 送出後）。
    function discardPending() {
      if (commitTimerRef.current) {
        clearTimeout(commitTimerRef.current);
        commitTimerRef.current = undefined;
      }
      pendingTranscriptRef.current = "";
      childHasFloor = false;
    }
    discardPendingRef.current = discardPending;

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

    // ── 跟讀借用：把「原本的聽音」這支主辨識暫借一句、攔下結果（DD-跟讀） ──
    // 跟讀不再自己開第二個 en-US SpeechRecognition（會與常駐中文辨識搶麥克風、互相弄聾）。
    // 借用期間：把主辨識切到目標語言並沿用既有重啟路徑生效；下一句 final 結果在 onresult
    // 被攔下、導回呼叫端（跟讀判斷），不進對話；結束後語言切回中文、回到常駐聆聽。
    function restoreAfterCapture(st: NonNullable<typeof captureStateRef.current>) {
      clearTimeout(st.timer);
      recognition.lang = st.prevLang;
      wantListeningRef.current = st.prevWant;
      if (isSamsungManualMode) {
        // Samsung 手動模式本就不常駐：借用後停回待命。
        try {
          recognition.abort();
        } catch {
          /* ok */
        }
        recRunningRef.current = false;
        setStatus(samsungManualPrompt);
      } else if (st.prevWant) {
        // 先前在常駐聆聽：沿用自我修復路徑重啟，讓語言切回中文。
        restartSession();
      } else {
        // 先前沒在聽：收掉麥克風。
        stopVad();
        try {
          recognition.abort();
        } catch {
          /* ok */
        }
        recRunningRef.current = false;
        setListening(false);
      }
    }
    function resolveCapture(text: string) {
      const st = captureStateRef.current;
      if (!st) return;
      captureStateRef.current = null;
      restoreAfterCapture(st);
      st.resolve(text);
    }
    function rejectCapture(err: Error) {
      const st = captureStateRef.current;
      if (!st) return;
      captureStateRef.current = null;
      restoreAfterCapture(st);
      st.reject(err);
    }
    // 外力取消：只把語言切回、reject promise，不自行重啟——麥克風狀態交給呼叫端
    // （它正準備 abort / 接手聆聽）。避免主辨識卡在 en-US 弄壞中文對話。
    cancelCaptureRef.current = () => {
      const st = captureStateRef.current;
      if (!st) return;
      captureStateRef.current = null;
      clearTimeout(st.timer);
      recognition.lang = st.prevLang;
      st.reject(new Error("跟讀已取消"));
    };
    captureOnceRef.current = (lang: string, timeoutMs: number) =>
      new Promise<string>((resolve, reject) => {
        // 同時只允許一個跟讀借用；新的取代舊的（舊的以錯誤收尾）。
        if (captureStateRef.current) rejectCapture(new Error("已被新的跟讀取代"));
        const prevLang = recognition.lang;
        const prevWant = wantListeningRef.current;
        const timer = setTimeout(
          () => rejectCapture(new Error("沒聽到聲音，再試一次好嗎？")),
          timeoutMs,
        );
        captureStateRef.current = { resolve, reject, timer, prevLang, prevWant };
        // 借用：清掉觸發鎖、切語言、確保在聽，沿用既有重啟路徑讓新語言生效。
        triggeredRef.current = false;
        recognition.lang = lang;
        wantListeningRef.current = true;
        if (isSamsungManualMode) {
          try {
            recognition.abort();
          } catch {
            /* ok */
          }
          recRunningRef.current = false;
          clearTimeout(restartTimer);
          restartTimer = setTimeout(() => {
            try {
              recognition.start();
            } catch {
              /* ok */
            }
          }, 150);
        } else {
          restartSession();
        }
      });

    // ── Recognition event handlers ──
    recognition.onstart = () => {
      recRunningRef.current = true;
      lastAliveAt = Date.now();
      setListening(true);
      // 聆聽狀態不再用文字提示，改由輸入框背景的呼吸燈效果表示（見 .a1-input-wrap--listening）。
      setStatus(isSamsungManualMode ? samsungManualPrompt : "");
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
      discardPending();
      setListening(false);
      setStatus(`語音辨識失敗：${event.error}`);
    };
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      const latest = event.results[event.results.length - 1];
      const transcript = latest[0].transcript.trim();

      // 跟讀借用攔截（最優先）：有 pending 借用時，final 結果導回跟讀判斷，不進對話，
      // 且不受 triggeredRef 與 echo/self-echo 軟閘影響——小朋友按了「跟讀」本來就要
      // 開口跟著唸（而且念的正是剛剛 🔊 唸過的單字，會被 self-echo 誤殺）。
      if (captureStateRef.current) {
        if (!latest.isFinal || !transcript || transcript.length > 50) return;
        // 朗讀進行中/尾窗內的結果丟掉（擋住 bubble 重播等 TTS 竄進跟讀判斷）；
        // 但「不」套 self-echo——小朋友本來就要跟著唸剛聽到的那個單字。
        if (isWithinSpeechGuard()) return;
        resolveCapture(transcript);
        return;
      }

      if (triggeredRef.current) return;
      if (transcript.length > 50) return;

      if (isSamsungManualMode) {
        if (!latest.isFinal || !transcript) return;
        triggeredRef.current = true;
        void lookupRef.current(transcript);
        return;
      }

      // 自由對話模式（DD-10 v2）：不需喚醒詞。
      // Barge-in 隨時插話（DD-25）：小雞朗讀中，若辨識到的「不是」小雞自己的回音
      // （isLikelySelfEcho 不中），就視為小朋友插話 → 立刻 cancelSpeech() 停止朗讀、
      // 取得發言權（childHasFloor），讓這段及後續語音照常累積。這就是「隨時中斷來傾聽」。
      // 反之若是回音（小雞自己的話被麥克風收回）就丟棄，維持 echo 防迴圈。
      // 累積送出（DD-24）：interim 即時回填輸入框、重置靜默寬限計時；final 累積、續計時，
      // 等真的停夠久（SILENCE_COMMIT_MS）才整段送，句中停頓不被誤判成講完。

      // 判定這段辨識是否為小雞自己的回音（朗讀中或尾窗內才需判，且尚未取得發言權時）。
      const duringGuard = isWithinSpeechGuard();
      if (duringGuard && !childHasFloor) {
        if (isLikelySelfEcho(transcript)) {
          // 是小雞自己的話被收回 → 丟棄，不動已累積真實語音。
          setQuery(pendingTranscriptRef.current.trim());
          return;
        }
        // 不是回音 → 小朋友插話了：停掉小雞朗讀、取得發言權，這段話照常處理。
        cancelSpeech();
        childHasFloor = true;
      }

      if (!latest.isFinal) {
        // 已取得發言權後，interim 一律照常累積（小雞已停、不會再有自己的回音）。
        const preview = (pendingTranscriptRef.current + transcript).trim();
        setQuery(preview);
        if (preview) armCommitTimer();
        return;
      }
      if (!transcript) return;

      // echo 軟閘（DD-11）：尚未取得發言權、又落在朗讀尾窗或文字吻合最近朗讀 → 丟棄回音。
      // childHasFloor 為 true 時略過此閘——小朋友已插話、有權繼續講完，不再當回音擋掉。
      if (!childHasFloor && (duringGuard || isLikelySelfEcho(transcript))) {
        setQuery(pendingTranscriptRef.current.trim());
        return;
      }

      // 收到一個 final 片段：累積、續上寬限計時，但「不」立即送出。
      // 小朋友可能只是句中換氣；只有寬限窗內都沒有新語音，commitPending 才會送整段。
      // 片段間補空白避免黏字（中文也無妨，送出端會 trim）。
      pendingTranscriptRef.current =
        (pendingTranscriptRef.current + " " + transcript).trim();
      // 超長保護：累積過長直接送出，不再等（避免無限累積）。
      if (pendingTranscriptRef.current.length > 200) {
        if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
        commitPending();
        return;
      }
      setQuery(pendingTranscriptRef.current);
      armCommitTimer();
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
      captureOnceRef.current = () => Promise.reject(new Error("語音尚未就緒"));
      cancelCaptureRef.current = () => {};
      if (captureStateRef.current) {
        const st = captureStateRef.current;
        captureStateRef.current = null;
        clearTimeout(st.timer);
        st.reject(new Error("語音已關閉"));
      }
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
      // 進 overlay 前若有跟讀借用在進行，先取消（切回中文、reject），避免主辨識卡 en-US。
      cancelCaptureRef.current();
      // 記住進 overlay 前是否在聽，關閉後據此恢復。
      wasListeningBeforeOverlayRef.current = wantListeningRef.current;
      wantListeningRef.current = false;
      triggeredRef.current = false;
      discardPendingRef.current();
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

  // 朗讀中偵測（驅動 kill switch 的紅色脈動）：SpeechSynthesis 沒有可靠的「開始播放」
  // 事件，輪詢 isSpeaking() 最穩。停止時把按鈕收回靜止態。
  useEffect(() => {
    if (!isTtsSupported()) return;
    const id = setInterval(() => setSpeaking(isSpeaking()), 250);
    return () => clearInterval(id);
  }, []);

  /** Kill switch：強制中止小雞老師的語音輸出（朗讀打斷不了的逃生口）。 */
  function stopSpeaking() {
    cancelSpeech();
    setSpeaking(false);
  }

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

  /** 拍照/選圖 → OCR 讀題 → 把辨識出的題目當作小朋友的輸入送進對話（→ explain 講解）。 */
  async function handlePhotoSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // 清掉，讓同一張可再選
    if (!file) return;
    setReading(true);
    setStatus("小雞老師看看題目…");
    try {
      const { base64, mimeType } = await fileToDownscaledBase64(file);
      const res = await apiClient.readQuestion(base64, mimeType);
      if (!res.ok) {
        setStatus(res.message);
        return;
      }
      setStatus("");
      await sendTurn(res.question, detectLookupHint(res.question));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "看題目的時候卡住了，再拍一次好嗎？");
    } finally {
      setReading(false);
    }
  }

  function toggleListening() {
    if (!recognitionRef.current) return;
    if (listening) {
      // 手動停麥克風時，連同進行中的跟讀借用一起取消（切回中文、reject）。
      cancelCaptureRef.current();
      wantListeningRef.current = false;
      if (!samsungManualModeRef.current) stopVadRef.current();
      triggeredRef.current = false;
      discardPendingRef.current();
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

  /**
   * 影片播放/暫停時調整麥克風（DD-找影片）。
   * 播放中：暫停常駐辨識（不然影片聲音會被當成小朋友說話、亂觸發小雞老師）；
   *         記住先前是否開著。暫停/播完：若先前開著就自動開回。
   * 用 wantListeningRef 當「先前是否開著」的真實來源（state 在 callback 內會過時）。
   */
  const handleVideoPlayingChange = useCallback((playing: boolean) => {
    if (playing === videoPlayingRef.current) return;
    videoPlayingRef.current = playing;
    if (playing) {
      micWasOnBeforeVideoRef.current = wantListeningRef.current;
      if (wantListeningRef.current) {
        cancelCaptureRef.current();
        wantListeningRef.current = false;
        if (!samsungManualModeRef.current) stopVadRef.current();
        triggeredRef.current = false;
        discardPendingRef.current();
        try {
          recognitionRef.current?.abort();
        } catch {
          /* ok */
        }
        setListening(false);
        setStatus("");
      }
    } else {
      if (micWasOnBeforeVideoRef.current && recognitionRef.current) {
        wantListeningRef.current = true;
        startListeningFlowRef.current();
      }
      micWasOnBeforeVideoRef.current = false;
    }
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") void sendTurnFromSpeech();
  }

  const displayStatus = status || convStatus;

  // 跟讀借用入口（給深層的 EnglishPractice 用）：穩定 identity，只隨 speechReady 變。
  const speechCapture = useMemo<SpeechCapture>(
    () => ({
      captureOnce: (opts) =>
        captureOnceRef.current(opts?.lang ?? "en-US", opts?.timeoutMs ?? 8000),
      ready: speechReady,
    }),
    [speechReady],
  );

  return (
    <SpeechCaptureContext.Provider value={speechCapture}>
    <div className="feature-page">
      <div className="a1-chat-layout">
        <Panel className="a1-conversation-panel">
          <ConversationView
            messages={messages}
            busy={busy}
            illustrations={illustrations}
            onRedraw={redrawIllustration}
            videos={videos}
            onRetryVideos={retryVideos}
            onVideoPlayingChange={handleVideoPlayingChange}
          />
        </Panel>

        <Panel className="a1-input-panel">
          {storyActive && (
            <div className="a1-story-relay-bar">
              <span className="a1-story-relay-bar__label">📖 故事接龍中——換你接下去！</span>
              <button
                type="button"
                className="a1-story-relay-bar__end"
                onClick={endStory}
                disabled={busy}
              >
                結束故事
              </button>
            </div>
          )}
          <div className={`a1-input-wrap${listening ? " a1-input-wrap--listening" : ""}`}>
              <input
                className="a1-query-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  storyActive
                    ? "換你接下去！說一句故事接下來發生什麼…"
                    : "說說看：用蘋果造句、花可以組什麼詞、蘋果的蘋、說個故事"
                }
              />
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={(e) => void handlePhotoSelected(e)}
              />
              <button
                className={`a1-camera-btn${reading ? " a1-camera-btn--active" : ""}`}
                onClick={() => photoInputRef.current?.click()}
                disabled={reading}
                aria-label="拍照讀題"
                title="拍照讀題：把考卷上的題目拍給小雞老師看"
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
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </button>
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
                className={`a1-stop-btn${speaking ? " a1-stop-btn--active" : ""}`}
                onClick={stopSpeaking}
                aria-label="停止說話"
                title="停止小雞老師說話"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  stroke="none"
                >
                  <rect x="6" y="6" width="12" height="12" rx="2.5" />
                </svg>
              </button>
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
            <button
              type="button"
              className="a1-quick-chip"
              onClick={() => openOverlay("quiz")}
            >
              📝 練習
            </button>
          </div>
          {displayStatus ? (
            <p className="muted" style={{ marginTop: "0.5rem" }}>
              {displayStatus}
            </p>
          ) : null}
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
            ) : activeOverlay === "idiom" ? (
              <A2Page onClose={closeOverlay} onComplete={onQuizComplete} />
            ) : (
              <QuizPage onClose={closeOverlay} onComplete={onQuizComplete} />
            )}
          </div>
        </div>
      )}
    </div>
    </SpeechCaptureContext.Provider>
  );
}
