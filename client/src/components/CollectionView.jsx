import React, { useState } from 'react';
import FEATURED from '../data/featured';
import ShareButton from './ShareButton';

function fmtDate(ts) {
  try {
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch (e) {
    return '';
  }
}

function EntryRow({ entry, saved, onToggleSave, onOpen, onShareEntry }) {
  return (
    <div className="entry-row">
      <button className="entry-main" onClick={() => onOpen(entry)}>
        <span className="entry-name">{entry.metadata?.type || 'Artifact'}</span>
        <span className="entry-sub">“{entry.transcription}” · {fmtDate(entry.ts)}</span>
      </button>
      <button
        className={`save-btn ${saved ? 'on' : ''}`}
        onClick={() => onToggleSave(entry)}
        aria-label={saved ? 'Remove bookmark' : 'Bookmark this story'}
      >
        <svg viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
          <path d="M6 3h12v18l-6-4.5L6 21V3Z" />
        </svg>
      </button>
    </div>
  );
}

function CollectionView({ saved, history, onToggleSave, onOpenEntry, onStartTour, onClearHistory, onExplore }) {
  const [tab, setTab] = useState('saved');

  return (
    <div>
      <div className="seg" role="tablist" aria-label="Collection">
        {['saved', 'history', 'explore'].map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`seg-btn ${tab === t ? 'on' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'saved' ? `Saved (${saved.length})` : t === 'history' ? 'History' : 'Explore'}
          </button>
        ))}
      </div>

      {tab === 'saved' && (
        <div style={{ marginTop: 12 }}>
          {saved.length === 0 && (
            <p className="hint">Nothing bookmarked yet. After a Reveal, tap Save to keep the story here.</p>
          )}
          {saved.map((e) => (
            <EntryRow
              key={e.id}
              entry={e}
              saved
              onToggleSave={onToggleSave}
              onOpen={onOpenEntry}
            />
          ))}
          {saved.length > 1 && (
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => onStartTour(saved)}>
              Start guided tour ({saved.length} stops)
            </button>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div style={{ marginTop: 12 }}>
          {history.length === 0 && (
            <p className="hint">Your past identifications will appear here.</p>
          )}
          {history.map((e) => (
            <EntryRow
              key={e.id}
              entry={e}
              saved={saved.some((s) => s.id === e.id)}
              onToggleSave={onToggleSave}
              onOpen={onOpenEntry}
            />
          ))}
          {history.length > 0 && (
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="btn btn-ghost" onClick={() => onStartTour(history.slice(0, 5))}>
                Tour recent 5
              </button>
              <button className="btn btn-ghost" onClick={onClearHistory}>Clear</button>
            </div>
          )}
        </div>
      )}

      {tab === 'explore' && (
        <div style={{ marginTop: 12 }}>
          <p className="hint">Curated stories to try — no camera needed.</p>
          <div className="feat-grid">
            {FEATURED.map((f) => (
              <button
                key={f.id}
                className="feat-card"
                style={{ '--hue': f.hue }}
                onClick={() => onExplore(f)}
              >
                <span className="feat-mono">{f.monogram}</span>
                <span className="feat-name">{f.name}</span>
                <span className="feat-sub">{f.period} · {f.material}</span>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <ShareButton entry={history[0] || {
              transcription: 'What is this made of?',
              answer: 'Try LookWhere on a real artifact.',
              metadata: { type: 'LookWhere' }
            }} />
          </div>
        </div>
      )}
    </div>
  );
}

export default CollectionView;
