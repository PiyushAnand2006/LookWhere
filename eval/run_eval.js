/**
 * LookWhere Phase 6 eval runner.
 * Spawns the backend on a test port, runs the 5-case eval set plus edge probes,
 * and reports accuracy + latency. Success bar: 100% of cases pass, p100 latency < 5000ms.
 *
 * Usage: node eval/run_eval.js
 */
const { spawn, execSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 3123;
const LATENCY_BUDGET_MS = 5000;

// 1x1 pixel JPEG fixture: exercises the multipart image path without bulky assets.
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP///////////////////////////////////////////////wgARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AX//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Al//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IX//2gAMAwEAAhADEAAAAdT/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==',
  'base64'
);

const evalset = require('./evalset.json');

function postIdentify({ tapPoint, language, question, withImage = true }) {
  const form = new FormData();
  if (withImage) form.append('image', new Blob([TINY_JPEG], { type: 'image/jpeg' }), 'frame.jpg');
  form.append('tapPoint', JSON.stringify(tapPoint));
  form.append('language', language);
  form.append('question', question);
  return form;
}

async function waitForHealth() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/api/health`);
      if (res.ok) return;
    } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Server did not become healthy in time');
}

function bboxCoversTap(box, tap) {
  if (!box) return false;
  return (
    tap.x >= box.x && tap.x <= box.x + box.width &&
    tap.y >= box.y && tap.y <= box.y + box.height
  );
}

async function main() {
  const server = spawn('node', ['server/index.js'], {
    cwd: ROOT,
    // Blank the key so the eval always exercises the deterministic mock path,
    // even when server/.env holds a real key (dotenv never overrides existing env).
    env: { ...process.env, PORT: String(PORT), META_API_KEY: '' },
    stdio: 'ignore'
  });
  let failures = 0;
  try {
    await waitForHealth();
    console.log(`eval: server healthy on :${PORT} (mockMode expected without META_API_KEY)\n`);

    let maxLatency = 0;
    let passed = 0;
    for (const c of evalset) {
      const t0 = Date.now();
      const res = await fetch(`http://localhost:${PORT}/api/identify`, {
        method: 'POST',
        body: postIdentify(c)
      });
      const latency = Date.now() - t0;
      maxLatency = Math.max(maxLatency, latency);
      const data = await res.json();
      const checks = {
        status200: res.ok,
        language: data.language === c.expectLanguage,
        keyword: typeof data.answer === 'string' && data.answer.includes(c.expectContains),
        bboxTracksTap: bboxCoversTap(data.boundingBox, c.tapPoint),
        latency: latency < LATENCY_BUDGET_MS
      };
      const ok = Object.values(checks).every(Boolean);
      if (ok) passed++; else failures++;
      console.log(`${ok ? 'PASS' : 'FAIL'} ${c.id} (${latency}ms) ${JSON.stringify(checks)}`);
    }

    // Edge probe 1: tap on background edge -> structured noDetection, not a crash.
    {
      const res = await fetch(`http://localhost:${PORT}/api/identify`, {
        method: 'POST',
        body: postIdentify({ tapPoint: { x: 0.995, y: 0.5 }, language: 'en', question: 'what is this?' })
      });
      const data = await res.json();
      const ok = res.ok && data.noDetection === true && typeof data.message === 'string';
      if (ok) passed++; else failures++;
      console.log(`${ok ? 'PASS' : 'FAIL'} edge-background-tap (noDetection=${data.noDetection})`);
    }

    // Edge probe 2: out-of-bounds tap -> 400 with a human message.
    {
      const res = await fetch(`http://localhost:${PORT}/api/identify`, {
        method: 'POST',
        body: postIdentify({ tapPoint: { x: 1.4, y: 0.5 }, language: 'en', question: 'what is this?' })
      });
      const data = await res.json().catch(() => ({}));
      const ok = res.status === 400 && typeof data.error === 'string';
      if (ok) passed++; else failures++;
      console.log(`${ok ? 'PASS' : 'FAIL'} edge-out-of-bounds-tap (status=${res.status})`);
    }

    // Edge probe 3: text-only request (no image, no audio) still answers.
    {
      const res = await fetch(`http://localhost:${PORT}/api/identify`, {
        method: 'POST',
        body: postIdentify({ tapPoint: { x: 0.5, y: 0.5 }, language: 'en', question: 'What is this?', withImage: false })
      });
      const data = await res.json();
      const ok = res.ok && typeof data.answer === 'string' && data.answer.length > 20;
      if (ok) passed++; else failures++;
      console.log(`${ok ? 'PASS' : 'FAIL'} edge-text-only (answerLen=${(data.answer || '').length})`);
    }

    const total = evalset.length + 3;
    console.log(`\nResult: ${passed}/${total} passed, max latency ${maxLatency}ms (budget ${LATENCY_BUDGET_MS}ms)`);
    if (failures > 0) {
      console.log('EVAL FAILED');
      process.exitCode = 1;
    } else {
      console.log('EVAL PASSED');
    }
  } finally {
    try {
      if (process.platform === 'win32') execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: 'ignore' });
      else server.kill();
    } catch (e) { /* already down */ }
  }
}

main().catch((e) => {
  console.error('EVAL ERROR:', e.message);
  process.exitCode = 1;
});
