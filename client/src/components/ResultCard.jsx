import React from 'react';

function ResultCard({ data }) {
  if (!data) return null;
  const facts = [];
  if (data.metadata?.period) facts.push({ label: data.metadata.period, tone: 'gold' });
  if (data.metadata?.material) facts.push({ label: data.metadata.material, tone: 'ivory' });
  if (data.metadata?.origin) facts.push({ label: data.metadata.origin, tone: '' });
  if (data.metadata?.type) facts.push({ label: data.metadata.type, tone: '' });

  return (
    <div>
      <p className="artifact-kicker">You asked ({data.language || 'en'}) — “{data.transcription}”</p>
      <h2 className="artifact-title">{data.metadata?.type || 'The Artifact'}</h2>
      <p className="artifact-body">{data.answer}</p>
      {facts.length > 0 && (
        <div className="chip-row">
          {facts.map((f, i) => (
            <span key={i} className={`fact-chip ${f.tone}`}>{f.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export default ResultCard;
