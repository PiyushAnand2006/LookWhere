import React, { useState, useRef, useEffect } from 'react';
import CameraView from './components/CameraView';
import ResultCard from './components/ResultCard';
import CollectionView from './components/CollectionView';
import TourOverlay from './components/TourOverlay';
import ShareButton from './components/ShareButton';
import { makeEntry, loadSaved, toggleSaved, loadHistory, addHistory, clearHistory } from './lib/store';
import './App.css';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ta', label: 'தமிழ்' },
  { code: 'bn', label: 'বাংলা' },
  { code: 'auto', label: 'Auto' }
];

const TTS_LANG = { en: 'en-US', hi: 'hi-IN', ta: 'ta-IN', bn: 'bn-IN', auto: 'en-US' };

const IconEye = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const IconMic = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v4" />
  </svg>
);
const IconBook = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4a1 1 0 0 0-1-1H6.5A2.5 2.5 0 0 0 4 5.5v14Z" /><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
  </svg>
);

const IconShelf = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4v16M20 4v16M4 9h16M4 15h16" />
  </svg>
);

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
  const [speaking, setSpeaking] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [depth, setDepth] = useState('quick');
  const [visitEntry, setVisitEntry] = useState(null);
  const [savedList, setSavedList] = useState(() => loadSaved());
  const [histList, setHistList] = useState(() => loadHistory());
  const [tourItems, setTourItems] = useState(null);

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
      stopSpeech();
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

  const stopSpeech = () => {
    try { window.speechSynthesis.cancel(); } catch (e) {}
    setSpeaking(false);
  };

  const speak = (text, lang) => {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = TTS_LANG[lang] || 'en-US';
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      setSpeaking(true);
      window.speechSynthesis.speak(u);
    } catch (e) { setSpeaking(false); }
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

  const frameDimensions = async (blob) => {
    try {
      const bmp = await createImageBitmap(blob);
      const w = bmp.width, h = bmp.height;
      bmp.close();
      return { w, h };
    } catch (e) {
      return { w: 0, h: 0 };
    }
  };

  const captureFrame = async () => {
    if (uploadedFile) {
      const { w, h } = await frameDimensions(uploadedFile);
      return { blob: uploadedFile, w, h, dark: false };
    }
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
    stopSpeech();
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
      formData.append('depth', depth);

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
      const visit = makeEntry({
        transcription: data.transcription,
        answer: data.answer,
        metadata: data.metadata,
        language: data.language,
        tapPoint
      });
      addHistory(visit);
      setHistList(loadHistory());
      setVisitEntry(visit);
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
    stopSpeech();
  };

  const goTab = (n) => {
    if (n === 4) { setError(null); setStep(4); return; }
    if (n === 2 && !tapPoint) return;
    if (n === 3 && !result && !isLoading) return;
    setError(null);
    setStep(n);
  };

  const handleToggleSave = (entry) => {
    if (!entry) return;
    toggleSaved(entry);
    setSavedList(loadSaved());
  };

  const openEntry = (entry) => {
    stopSpeech();
    setResult({ ...entry, sources: entry.sources || null, stages: entry.stages || null });
    setVisitEntry(entry);
    setTapPoint(entry.tapPoint || null);
    setError(null);
    setStep(3);
  };

  const openFeatured = (f) => {
    openEntry({
      id: f.id,
      ts: Date.now(),
      transcription: `Tell me about the ${f.name}`,
      answer: f.blurb,
      metadata: { type: f.name, period: f.period, material: f.material, origin: f.origin },
      language: 'en',
      tapPoint: null
    });
  };

  const savedNow = visitEntry ? savedList.some((s) => s.id === visitEntry.id) : false;

  const liveCount = result?.sources ? Object.values(result.sources).filter((s) => s === 'live').length : 0;

  return (
    <div className="phone">
      <header className="topbar">
        <div>
          <span className="brand">MUSEUM GUIDE</span>
          <span className="sub">LOOKWHERE</span>
        </div>
        <div className="stepdots" aria-label="Progress">
          {[1, 2, 3].map((n) => (
            <i key={n} className={step === n ? 'on' : step > n || (n === 3 && result) ? 'done' : ''} />
          ))}
        </div>
      </header>

      {step === 1 && (
        <main className="screen screen-look" key="look">
          <div>
            <p className="eyebrow">Step 1 · Look</p>
            <h1 className="hero-title">Tap the <em>one object</em> you mean.</h1>
          </div>
          <div className="glow-wrap">
            <CameraView onTap={handleTap} tapPoint={tapPoint} maskBox={result?.boundingBox} />
          </div>
          {tapPoint
            ? <p className="coords">Pinned at {tapPoint.x}, {tapPoint.y} — the guide will answer only for this.</p>
            : <p className="hint">Frame a crowded shelf, then tap a single artifact. No camera? Use Upload photo.</p>}
          {error && <p className="error">{error}</p>}
          <div style={{ flex: 1 }} />
          <button className="btn btn-primary" disabled={!tapPoint} onClick={() => setStep(2)}>
            Continue to Ask
          </button>
        </main>
      )}

      {step === 2 && (
        <main className="screen screen-ask" key="ask">
          <div>
            <p className="eyebrow">Step 2 · Ask</p>
            <h1 className="hero-title">Ask in <em>your language.</em></h1>
          </div>
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
          <div className="seg" role="radiogroup" aria-label="Answer depth">
            {['quick', 'deep'].map((d) => (
              <button
                key={d}
                className={`seg-btn ${depth === d ? 'on' : ''}`}
                onClick={() => setDepth(d)}
              >
                {d === 'quick' ? 'Quick take' : 'Deep dive'}
              </button>
            ))}
          </div>
          <button
            className={`btn ${isRecording ? 'btn-record recording' : 'btn-ghost'}`}
            onClick={toggleRecording}
            style={isRecording ? {} : { width: '100%' }}
          >
            {isRecording ? '● Recording — tap to stop' : 'Tap to record'}
          </button>
          {audioUrl && <audio controls src={audioUrl} />}
          <textarea
            className="question"
            placeholder="e.g. What is this made of? Who made it?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          {history.length > 0 && (
            <p className="hint">Follow-up #{history.length + 1} — the guide remembers this object.</p>
          )}
          {error && <p className="error">{error}</p>}
          <div style={{ flex: 1 }} />
          <div className="btn-row">
            <button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={sendToBackend}>
              Reveal the story
            </button>
          </div>
        </main>
      )}

      {step === 3 && (
        <main className="screen screen-reveal" key="reveal">
          <div>
            <p className="eyebrow">Step 3 · Reveal</p>
            {isLoading && <h1 className="hero-title">Reading the <em>artifact…</em></h1>}
          </div>
          {isLoading && (
            <div>
              <p className="hint">Segmenting → transcribing → grounding the answer…</p>
              <div className="loading-bar"><span /></div>
            </div>
          )}
          {darkWarning && !isLoading && (
            <p className="notice">The frame looks very dark — the answer may be less reliable. Try more light.</p>
          )}
          {!online && <p className="error">You are offline. Reconnect — your place in the flow is saved.</p>}
          {error && <p className="error">{error}</p>}
          {result && !isLoading && (
            <div>
              <ResultCard data={result} />
              <div className="player">
                <button
                  className={`play-btn ${speaking ? 'playing' : ''}`}
                  onClick={() => (speaking ? stopSpeech() : speak(result.answer, result.language))}
                  aria-label={speaking ? 'Stop narration' : 'Listen to the story'}
                >
                  {speaking ? (
                    <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5-11-6.5Z" /></svg>
                  )}
                </button>
                <div className={`player-meta ${speaking ? 'playing' : ''}`}>
                  <strong>
                    {speaking && <span className="eq"><i /><i /><i /></span>}
                    {speaking ? 'Narrating…' : 'Hear the story'}
                  </strong>
                  {result.stages
                    ? `Segment ${(result.stages.samMs / 1000).toFixed(1)}s · Transcribe ${(result.stages.voiceMs / 1000).toFixed(1)}s · Answer ${(result.stages.sparkMs / 1000).toFixed(1)}s`
                    : 'Tap play for audio narration'}
                </div>
              </div>
              <div className="btn-row" style={{ marginTop: 12 }}>
                <button className="btn btn-ghost" onClick={() => handleToggleSave(visitEntry)}>
                  {savedNow ? 'Saved ✓' : 'Save'}
                </button>
                {visitEntry && <ShareButton entry={visitEntry} />}
              </div>
              <div className="sources">
                <span className={`live-pill ${liveCount === 3 ? '' : 'mixed'}`}>
                  {liveCount === 3 ? 'Live · all 3 Meta models' : liveCount > 0 ? 'Partially live · mock fallback' : 'Demo mode · mock'}
                </span>
              </div>
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
            </div>
          )}
          <div style={{ flex: 1 }} />
          <div className="btn-row">
            <button className="btn btn-ghost" onClick={() => { setResult(null); setStep(2); }}>
              Follow-up
            </button>
            <button className="btn btn-ghost" onClick={resetAll}>New object</button>
          </div>
        </main>
      )}

      {step === 4 && (
        <main className="screen screen-collection" key="collection">
          <div>
            <p className="eyebrow">Collection</p>
            <h1 className="hero-title">Your <em>museum.</em></h1>
          </div>
          <CollectionView
            saved={savedList}
            history={histList}
            onToggleSave={handleToggleSave}
            onOpenEntry={openEntry}
            onExplore={openFeatured}
            onStartTour={(items) => setTourItems(items)}
            onClearHistory={() => { clearHistory(); setHistList([]); }}
          />
        </main>
      )}

      <nav className="tabbar" aria-label="Steps">
        <button className={`tab ${step === 1 ? 'active' : ''}`} onClick={() => goTab(1)}>
          {IconEye}Look
        </button>
        <button className={`tab ${step === 2 ? 'active' : ''}`} onClick={() => goTab(2)} disabled={!tapPoint}>
          {IconMic}Ask
        </button>
        <button className={`tab ${step === 3 ? 'active' : ''}`} onClick={() => goTab(3)} disabled={!result && !isLoading}>
          {IconBook}Reveal
        </button>
        <button className={`tab ${step === 4 ? 'active' : ''}`} onClick={() => goTab(4)}>
          {IconShelf}Saved
        </button>
      </nav>
      {tourItems && <TourOverlay items={tourItems} onExit={() => setTourItems(null)} />}
    </div>
  );
}

export default App;
