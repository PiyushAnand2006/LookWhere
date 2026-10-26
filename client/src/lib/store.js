/** Local persistence for saved artifacts and visit history. No login needed. */

const SAVED_KEY = 'lw_saved_v1';
const HISTORY_KEY = 'lw_history_v1';
const MAX_HISTORY = 20;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : fallback;
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (e) {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) { /* storage full or unavailable */ }
}

export function makeEntry({ transcription, answer, metadata, language, tapPoint }) {
  return {
    id: `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    ts: Date.now(),
    transcription: transcription || '',
    answer: answer || '',
    metadata: metadata || {},
    language: language || 'en',
    tapPoint: tapPoint || null
  };
}

export function loadSaved() {
  return read(SAVED_KEY, []);
}

export function isSaved(id) {
  return loadSaved().some((s) => s.id === id);
}

export function toggleSaved(entry) {
  const saved = loadSaved();
  const ix = saved.findIndex((s) => s.id === entry.id);
  if (ix >= 0) {
    saved.splice(ix, 1);
  } else {
    saved.unshift(entry);
  }
  write(SAVED_KEY, saved);
  return ix < 0;
}

export function loadHistory() {
  return read(HISTORY_KEY, []);
}

export function addHistory(entry) {
  const hist = loadHistory();
  hist.unshift(entry);
  write(HISTORY_KEY, hist.slice(0, MAX_HISTORY));
}

export function clearHistory() {
  write(HISTORY_KEY, []);
}

export function shareText(entry) {
  const name = entry.metadata?.type || 'Museum artifact';
  const bits = [entry.metadata?.period, entry.metadata?.material, entry.metadata?.origin].filter(Boolean);
  return (
    `${name} — via LookWhere\n` +
    (bits.length ? `${bits.join(' · ')}\n` : '') +
    `Q: ${entry.transcription}\nA: ${entry.answer}`
  );
}
