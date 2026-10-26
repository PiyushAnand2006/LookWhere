import React, { useState, useRef, useEffect } from 'react';
import CameraView from './components/CameraView';
import ResultCard from './components/ResultCard';
import './App.css';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ta', label: 'தமிழ்' },
  { code: 'bn', label: 'বাংলা' },
  { code: 'auto', label: 'Auto' }
];

const STAGE_LABELS = [
  { n: 1, label: 'Look', hint: 'Tap artifact' },
  { n: 2, label: 'Ask', hint: 'Voice or text' },
  { n: 3, label: 'Reveal', hint: 'Grounded story' }
];

const TTS_LANG = { en: 'en-US', hi: 'hi-IN', ta: 'ta-IN', bn: 'bn-IN', auto: 'en-US' };

/** Encode raw Float32 mono samples as 16-bit PCM WAV. */
function encodeWav(samples, sampleRate) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const wstr = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  wstr(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  wstr(8, 'WAVE'); wstr(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); wstr(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

function speak(text, lang) {
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = TTS_LANG[lang] || 'en-US';
    window.speechSynthesis.speak(u);
  } catch (e) { /* speech unsupported */ }
}

function SourcesBadge({ sources }) {
  if (!sources) return null;
  const liveCount = Object.values(sources).filter((s) => s === 'live').length;
  const names = { sam: 'SAM 3.1', voice: 'Voice', spark: 'Spark' };
  return (
    <div className="sources">
      <span className={`live-pill ${liveCount === 3 ? 'all-live' : 'mixed'}`}>
        {liveCount === 3 ? 'Live · all 3 Meta models' : liveCount > 0 ? 'Partially live · mock fallback' : 'Demo mode · mock'}
      </span>
      <span className="source-chips">
        {Object.entries(names).map(([k, label]) => (
          <span key={k} className={`chip ${sources[k] === 'live' ? 'on' : 'off'}`}>
            {label} {sources[k] === 'live' ? '●' : '○'}
          </span>
        ))}
      </span>
    </div>
  );
}

function App() {
  const [step, setStep] = useState(1);
  const [tapPoint, setTapPoint] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [language, setLanguage] = useState('en');
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [darkWarning, setDarkWarning] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

  const recCtxRef = useRef(null);
  const recStreamRef = useRef(null);
  const recProcRef = useRef(null);
  const recChunksRef = useRef([]);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      try { window.speechSynthesis.cancel(); } catch (e) {}
      stopTracks();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopTracks = () => {
    try { recProcRef.current?.disconnect(); } catch (e) {}
    try { recStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch (e) {}
    try { recCtxRef.current?.close(); } catch (e) {}
    recCtxRef.current = recStreamRef.current = recProcRef.current = null;
  };

  const handleTap = (point) => {
    setTapPoint({ x: point.x, y: point.y });
    if (point.uploadedFile) setUploadedFile(point.uploadedFile);
    setError(null);
  };

  const toggleRecording = async () => {
    if (isRecording) {
      const ctx = recCtxRef.current;
      const chunks = recChunksRef.current;
      const rate = ctx ? ctx.sampleRate : 16000;
      stopTracks();
      setIsRecording(false);
      if (chunks.length > 0) {
        const flat = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
        let off = 0;
        chunks.forEach((c) => { flat.set(c, off); off += c.length; });
        const blob = encodeWav(flat, rate);
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
      }
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx({ sampleRate: 16000 });
      const src = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      recChunksRef.current = [];
      proc.onaudioprocess = (e) => {
        recChunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      src.connect(proc);
      proc.connect(ctx.destination);
      recCtxRef.current = ctx;
      recStreamRef.current = stream;
      recProcRef.current = proc;
      setAudioBlob(null);
      setAudioUrl(null);
      setIsRecording(true);
    } catch (err) {
      setError('Microphone unavailable. Type your question instead — that works just as well.');
    }
  };

  const frameDimensions = async (blob, isUpload) => {
    if (!isUpload) {
      const video = document.querySelector('.camera-frame video');
      if (video && video.videoWidth) return { blob, w: video.videoWidth, h: video.videoHeight, dark: false };
    }
    try {
      const bmp = await createImageBitmap(blob);
      const w = bmp.width, h = bmp.height;
      bmp.close();
      return { blob, w, h, dark: false };
    } catch (e) {
      return { blob, w: 0, h: 0, dark: false };
    }
  };

  const captureFrame = async () => {
    if (uploadedFile) return frameDimensions(uploadedFile, true);
    const video = document.querySelector('.camera-frame video');
    if (!video || !video.videoWidth) return { blob: null, w: 0, h: 0, dark: false };
    const MAX_EDGE = 1280;
    const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    let dark = false;
    try {
      const sample = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = sample.data;
      const stride = Math.max(4, Math.floor(d.length / 4 / 4000) * 4);
      let sum = 0, n = 0;
      for (let i = 0; i < d.length; i += stride) {
        sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        n++;
      }
      dark = n > 0 && sum / n < 35;
    } catch (e) { /* cross-origin taint: skip check */ }
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    return { blob, w: canvas.width, h: canvas.height, dark };
  };

  const sendToBackend = async () => {
    if (!tapPoint) {
      setError('Tap the artifact first so we know which object you mean.');
      setStep(1);
      return;
    }
    if (!question.trim() && !audioBlob) {
      setError('Ask something — tap to record, or type your question.');
      return;
    }
    if (!online) {
      setError('You appear to be offline. Reconnect, then try again — answers need a connection.');
      return;
    }
    try { window.speechSynthesis.cancel(); } catch (e) {}
    setIsLoading(true);
    setError(null);
    setDarkWarning(false);
    setStep(3);
    try {
      const { blob: imageBlob, w, h, dark } = await captureFrame();
      setDarkWarning(dark);
      const formData = new FormData();
      if (imageBlob) formData.append('image', imageBlob, 'frame.jpg');
      if (audioBlob) formData.append('audio', audioBlob, 'question.wav');
      formData.append('tapPoint', JSON.stringify({ x: tapPoint.x, y: tapPoint.y }));
      formData.append('language', language);
      formData.append('question', question);
      formData.append('frameWidth', String(w));
      formData.append('frameHeight', String(h));
      formData.append('history', JSON.stringify(history));

      const res = await fetch('/api/identify', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Server responded ${res.status}`);
      if (data.noDetection) {
        setError(data.message || 'No artifact found at that tap — try tapping the center of the object.');
        setResult(null);
        return;
      }
      setResult(data);
      setHistory((prev) => [...prev.slice(-2), { q: data.transcription, a: data.answer }]);
      setQuestion('');
      setAudioBlob(null);
      setAudioUrl(null);
    } catch (err) {
      setError(err.message || 'Could not reach the guide. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const resetAll = () => {
    setStep(1);
    setTapPoint(null);
    setUploadedFile(null);
    setQuestion('');
    setHistory([]);
    setAudioBlob(null);
    setAudioUrl(null);
    setResult(null);
    setError(null);
    try { window.speechSynthesis.cancel(); } catch (e) {}
  };

  return (
    <div className="app-shell">
      <header className="masthead">
        <div className="masthead-inner">
          <p className="eyebrow">Multilingual museum guide · SAM 3.1 + Voice + Spark</p>
          <h1>LookWhere — <em>point, ask, discover.</em></h1>
          <p className="lede">
            Tap the exact artifact in a crowded case, ask in your own language,
            and get an answer grounded to that object — not the room around it.
          </p>
        </div>
      </header>

      <div className="stepbar" aria-label="Progress">
        {STAGE_LABELS.map((s) => (
          <div key={s.n} className={`step ${step === s.n ? 'active' : ''} ${step > s.n || (s.n === 3 && result) ? 'done' : ''}`}>
            <span className="step-num">{step > s.n || (s.n === 3 && result) ? '✓' : s.n}</span>
            <span className="step-label">{s.label}<span className="step-hint">{s.hint}</span></span>
          </div>
        ))}
      </div>

      <main className="stage">
        {!online && (
          <p className="error" role="alert">
            You are offline. The guide needs a connection — your place in the flow is saved.
          </p>
        )}
        {(step === 1 || (step > 1 && !result)) && (
          <section className="panel" key={`look-${step}`}>
            <div className="panel-head">
              <h2>1 · Look and tap</h2>
              <p>Frame the shelf, then tap the one artifact you mean. We pin it so the answer stays grounded.</p>
            </div>
            <div className="panel-body">
              <CameraView onTap={handleTap} tapPoint={tapPoint} maskBox={result?.boundingBox} />
              <div className="row" style={{ marginTop: 14 }}>
                {tapPoint && <span className="coords">Pinned at {tapPoint.x}, {tapPoint.y}</span>}
                <span style={{ flex: 1 }} />
                <button className="btn btn-ghost" onClick={resetAll}>Retake</button>
                <button className="btn btn-primary" disabled={!tapPoint} onClick={() => setStep(2)}>
                  Continue to Ask →
                </button>
              </div>
              {!tapPoint && <p className="hint">Tip: on desktop without a camera, use Upload photo inside the frame.</p>}
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="panel" key="ask">
            <div className="panel-head">
              <h2>2 · Ask in your language</h2>
              <p>Record a question or type it. Choose a language, or leave it on Auto.</p>
            </div>
            <div className="panel-body">
              <div className="lang-grid" role="radiogroup" aria-label="Language">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    className={`lang ${language === l.code ? 'selected' : ''}`}
                    onClick={() => setLanguage(l.code)}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
              <div className="row">
                <button
                  className={`btn ${isRecording ? 'btn-record recording' : 'btn-ghost'}`}
                  onClick={toggleRecording}
                >
                  {isRecording ? '● Recording — tap to stop' : 'Tap to record'}
                </button>
                {audioUrl && <audio controls src={audioUrl} style={{ flex: 1, minWidth: 200 }} />}
              </div>
              <div style={{ marginTop: 12 }}>
                <textarea
                  className="question"
                  placeholder="e.g. What is this made of? Who made it, and why is it broken at the rim?"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                />
              </div>
              {history.length > 0 && (
                <p className="hint">Follow-up #{history.length + 1} — the guide remembers this object.</p>
              )}
              {error && <p className="error">{error}</p>}
              <div className="row" style={{ marginTop: 14 }}>
                <button className="btn btn-ghost" onClick={() => setStep(1)}>← Back</button>
                <span style={{ flex: 1 }} />
                <button className="btn btn-primary" onClick={sendToBackend}>
                  Reveal the story →
                </button>
              </div>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="panel" key="reveal">
            <div className="panel-head">
              <h2>3 · The grounded story</h2>
              <p>Answered only for the pinned object — never the background shelf.</p>
            </div>
            <div className="panel-body">
              {isLoading && (
                <div>
                  <p className="hint">Segmenting the artifact → transcribing → grounding the answer…</p>
                  <div className="loading-bar"><span /></div>
                </div>
              )}
              {darkWarning && !isLoading && (
                <p className="error">The frame looks very dark — the answer may be less reliable. Try more light and retake.</p>
              )}
              {error && <p className="error">{error}</p>}
              {result && !isLoading && (
                <div>
                  <SourcesBadge sources={result.sources} />
                  {history.length > 1 && (
                    <div className="thread">
                      {history.slice(0, -1).map((t, i) => (
                        <details key={i}>
                          <summary>Earlier: “{t.q}”</summary>
                          <p>{t.a}</p>
                        </details>
                      ))}
                    </div>
                  )}
                  <ResultCard data={result} />
                  <div className="row" style={{ marginTop: 12 }}>
                    <button className="btn btn-ghost" onClick={() => speak(result.answer, result.language)}>
                      Listen
                    </button>
                    {result.stages && (
                      <span className="hint">
                        Segment {(result.stages.samMs / 1000).toFixed(1)}s · Transcribe {(result.stages.voiceMs / 1000).toFixed(1)}s · Answer {(result.stages.sparkMs / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>
                </div>
              )}
              <div className="row" style={{ marginTop: 16 }}>
                <button className="btn btn-ghost" onClick={() => { setResult(null); setStep(2); }}>
                  ← Ask a follow-up
                </button>
                <span style={{ flex: 1 }} />
                <button className="btn btn-ghost" onClick={resetAll}>Start over</button>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
