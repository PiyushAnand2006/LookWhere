# LookWhere — point, ask, discover

Multilingual, object-aware museum guide. Tap an artifact, ask in your language,
get an answer grounded to that exact object — powered by three Meta models at once:
**SAM 3.1** (segmentation), **Muse Voice Transcribe** (speech-to-text),
**Muse Spark** (grounded answers).

## Run it
```bash
npm install
cd client && npm install && cd ..
npm run server   # backend :3000 (or PORT=xxxx node server/index.js)
npm run client   # frontend :5173 (proxies /api → :3000)
```
Open http://localhost:5173 in a browser. The backend also serves `client/dist`
after `npm run build`, so one process can host everything.

## Configure live APIs
Copy `server/.env.example` to `server/.env` and set `META_API_KEY`
([dev.meta.ai](https://dev.meta.ai)). Without a key the server runs in
deterministic **mock mode** — every stage falls back gracefully, and the UI
badges each answer as Live / Partially live / Demo.

## Test it
```bash
npm run eval   # 5 multilingual cases + 3 edge probes, always mock (deterministic)
```

## How it works
1. Client sends frame (JPEG ≤1280px) + tap point + WAV voice note or typed question.
2. Server runs SAM 3.1 (point prompt → box) and Voice Transcribe in parallel.
3. Muse Spark answers with the image, box, question, and conversation history —
   JSON-structured with period / material / type / origin.
4. Client shows the answer, speaks it aloud, and keeps follow-up context.

See [docs/PRD.md](docs/PRD.md), [docs/architecture.md](docs/architecture.md),
[docs/implementation_plan.md](docs/implementation_plan.md), and the
[demo script](docs/DEMO.md).
