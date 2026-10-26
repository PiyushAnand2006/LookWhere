import React, { useState, useEffect } from 'react';

/** Guided tour overlay: steps through stops with narration. */
function TourOverlay({ items, onExit }) {
  const [ix, setIx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const stop = items[Math.min(ix, items.length - 1)];

  const stopAll = () => {
    try { window.speechSynthesis.cancel(); } catch (e) {}
    setPlaying(false);
  };

  useEffect(() => {
    stopAll();
    return stopAll;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ix]);

  useEffect(() => () => { try { window.speechSynthesis.cancel(); } catch (e) {} }, []);

  const narrate = () => {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(`${stopName(stop)}. ${stop.answer}`);
      u.onend = () => setPlaying(false);
      u.onerror = () => setPlaying(false);
      setPlaying(true);
      window.speechSynthesis.speak(u);
    } catch (e) {
      setPlaying(false);
    }
  };

  if (!stop) return null;

  return (
    <div className="tour-veil" role="dialog" aria-label="Guided tour">
      <div className="tour-card">
        <p className="eyebrow">Guided tour · stop {ix + 1} of {items.length}</p>
        <h2 className="artifact-title">{stopName(stop)}</h2>
        <p className="artifact-body">{stop.answer}</p>
        <div className="btn-row" style={{ marginTop: 14 }}>
          <button className="btn btn-ghost" disabled={ix === 0} onClick={() => setIx(ix - 1)}>
            ← Prev
          </button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => (playing ? stopAll() : narrate())}>
            {playing ? 'Stop' : 'Narrate'}
          </button>
          <button
            className="btn btn-ghost"
            disabled={ix >= items.length - 1}
            onClick={() => setIx(ix + 1)}
          >
            Next →
          </button>
        </div>
        <button className="btn btn-ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => { stopAll(); onExit(); }}>
          Exit tour
        </button>
      </div>
    </div>
  );
}

function stopName(stop) {
  return stop.metadata?.type || stop.name || 'Artifact';
}

export default TourOverlay;
