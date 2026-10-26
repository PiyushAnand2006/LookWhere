# LookWhere — Demo Script (3 minutes)

**One-line pitch:** Point your phone at a crowded museum shelf, tap one artifact, and ask about it in your own language — the answer is grounded to that exact object.

## Setup (before stage)
1. `PORT=3001 node server/index.js` (serves app + API; needs `server/.env` with key).
2. Open http://localhost:3001 on the demo phone. Allow camera + mic.
3. Have 2–3 artifacts ready (see beats below). Keep one typed question ready as backup.

## The 3 beats
| # | Do | Say | Shows |
|---|---|-----|-------|
| 1 | Frame a **crowded shelf**, tap ONE object among many | "Generic guides describe the wrong object. Watch the pin — SAM 3.1 segments exactly this lamp." | Tap → real SAM box overlay |
| 2 | Ask in **Hindi/Tamil**: "यह किस चीज़ से बना है?" | "No English needed. Voice Transcribe hears 25 languages — and the answer comes back in mine." | Multilingual STT + grounded Spark answer |
| 3 | Tap **Listen**, then ask a follow-up: "Who made it?" | "It speaks the answer — and it remembers the object, so follow-ups stay grounded." | TTS + conversation memory |

## Closer (15 seconds)
Show the Reveal panel: green **"Live · all 3 Meta models"** badge + per-stage timings (Segment / Transcribe / Answer). Quote: "Three models, one tap, under six seconds — evaluated 8/8 on our multilingual eval set."

## If things break
- **No internet:** the app shows an offline banner before you send — narrate it as a feature, then switch to the backup screen recording.
- **Dark venue:** the app warns on dark frames — ask for house lights, it gets a laugh and proves the lighting check.
- **API outage:** any failed stage falls back to mock automatically; the badge honestly shows "Partially live." Keep going.
- **Mic denied:** type the question — the pipeline accepts text identically.
