import React, { useState } from 'react';
import { shareText } from '../lib/store';

function ShareButton({ entry, className }) {
  const [msg, setMsg] = useState(null);
  const share = async () => {
    const text = shareText(entry);
    try {
      if (navigator.share) {
        await navigator.share({ title: entry.metadata?.type || 'LookWhere artifact', text });
        return;
      }
      throw new Error('no-share');
    } catch (e) {
      try {
        await navigator.clipboard.writeText(text);
        setMsg('Copied — paste it anywhere');
        setTimeout(() => setMsg(null), 2200);
      } catch (err) {
        setMsg('Sharing is unavailable here');
        setTimeout(() => setMsg(null), 2200);
      }
    }
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button className={className || 'btn btn-ghost'} onClick={share}>Share</button>
      {msg && <span className="hint">{msg}</span>}
    </span>
  );
}

export default ShareButton;
