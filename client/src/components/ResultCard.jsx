import React from 'react';

function ResultCard({ data }) {
  if (!data) return null;
  return (
    <div>
      <div className="transcription">
        You asked ({data.language || 'en'}): “{data.transcription}”
      </div>
      <p className="result-answer">{data.answer}</p>
      {data.metadata && (
        <dl className="facts">
          {data.metadata.period && (
            <div className="fact"><dt>Period</dt><dd>{data.metadata.period}</dd></div>
          )}
          {data.metadata.material && (
            <div className="fact"><dt>Material</dt><dd>{data.metadata.material}</dd></div>
          )}
          {data.metadata.type && (
            <div className="fact"><dt>Type</dt><dd>{data.metadata.type}</dd></div>
          )}
          {data.metadata.origin && (
            <div className="fact"><dt>Origin</dt><dd>{data.metadata.origin}</dd></div>
          )}
        </dl>
      )}
    </div>
  );
}

export default ResultCard;
