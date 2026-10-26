const axios = require('axios');
const FormData = require('form-data');
const crypto = require('crypto');

const META_API_KEY = process.env.META_API_KEY;
const BASE_URL = (process.env.META_API_BASE || 'https://api.meta.ai/v1').replace(/\/$/, '');
const SPARK_MODEL = process.env.SPARK_MODEL || 'muse-spark-1.3';
const SAM_MODEL = process.env.SAM_MODEL || 'sam-3.1';
const VOICE_MODEL = 'muse-voice-transcribe-1.0';
const MOCK_MODE = !META_API_KEY;

const MOCK_ANSWERS = {
  en: {
    text: 'This is a terracotta oil lamp from the 4th century BCE, commonly used in household rituals. Note the soot-blackened spout and the thumb-pressed rim — both signs of daily use, not damage from burial.',
    transcription: 'What is this made of, and why does the rim look broken?'
  },
  hi: {
    text: 'यह चौथी शताब्दी ईसा पूर्व का मिट्टी का दीया है, जो घरेलू अनुष्ठानों में उपयोग होता था। किनारे पर अंगूठे के निशान और कालिख दैनिक उपयोग के प्रमाण हैं।',
    transcription: 'यह किस चीज़ से बना है?'
  },
  ta: {
    text: 'இது கி.மு 4-ஆம் நூற்றாண்டைச் சேர்ந்த சுடுமண் விளக்கு. வீட்டு சடங்குகளில் பயன்படுத்தப்பட்டது. விளிம்பில் உள்ள கைரேகை தினசரி பயன்பாட்டைக் காட்டுகிறது.',
    transcription: 'இது எதனால் ஆனது?'
  },
  bn: {
    text: 'এটি খ্রিস্টপূর্ব ৪র্থ শতাব্দীর পোড়ামাটির প্রদীপ, গৃহস্থালী আচারে ব্যবহৃত হত। কিনারায় আঙুলের ছাপ দৈনন্দিন ব্যবহারের প্রমাণ।',
    transcription: 'এটি কী দিয়ে তৈরি?'
  }
};

function validateTapPoint(tapPoint) {
  const err = new Error('Tap point out of bounds. Tap inside the image (x and y between 0 and 1).');
  err.status = 400;
  if (!tapPoint || typeof tapPoint.x !== 'number' || typeof tapPoint.y !== 'number') throw err;
  if (tapPoint.x < 0 || tapPoint.x > 1 || tapPoint.y < 0 || tapPoint.y > 1) throw err;
}

/**
 * Orchestrates the 3-model pipeline: SAM 3.1 -> Voice Transcribe -> Muse Spark.
 * Live mode tries each real API and falls back to the mock for any stage that
 * fails, so a single outage degrades instead of killing the demo. `sources`
 * tells the client which stages were live.
 */
async function processIdentification(imageBuffer, audioBuffer, tapPoint, opts = {}) {
  const started = Date.now();
  const sources = { sam: 'mock', voice: 'mock', spark: 'mock' };
  const stages = {};
  try {
    validateTapPoint(tapPoint);
    // SAM segmentation and voice transcription are independent: run in parallel.
    const samTimer = Date.now();
    const voiceTimer = Date.now();
    const [maskData, transcription] = await Promise.all([
      runStage('sam', sources, () => callSam31Live(imageBuffer, tapPoint, opts),
        () => callSam31Mock(tapPoint)),
      runStage('voice', sources, () => callVoiceTranscribeLive(audioBuffer, opts),
        () => callVoiceTranscribeMock(audioBuffer, opts))
    ]);
    stages.samMs = Date.now() - samTimer;
    stages.voiceMs = Date.now() - voiceTimer;
    if (maskData.noDetection) {
      return {
        noDetection: true,
        transcription: transcription.text,
        language: transcription.language,
        message: 'No artifact found at that tap — try tapping the center of the object.',
        latencyMs: Date.now() - started,
        stages,
        sources,
        live: false
      };
    }
    const sparkTimer = Date.now();
    const answer = await runStage('spark', sources,
      () => callMuseSparkLive(imageBuffer, maskData, transcription, opts),
      () => callMuseSparkMock(transcription));
    stages.sparkMs = Date.now() - sparkTimer;

    return {
      mask: maskData.maskUrl || null,
      boundingBox: maskData.boundingBox,
      transcription: transcription.text,
      language: transcription.language,
      answer: answer.text,
      metadata: answer.metadata,
      latencyMs: Date.now() - started,
      stages,
      sources,
      live: sources.sam === 'live' && sources.voice === 'live' && sources.spark === 'live',
      mockMode: MOCK_MODE
    };
  } catch (error) {
    console.error('Pipeline error:', error.message);
    if (error.status) throw error; // preserve validation status (e.g. 400) for the client
    throw new Error('Failed to process identification pipeline');
  }
}

/** Runs the live fn in live mode, else the mock. Live failures fall back to mock. */
async function runStage(name, sources, liveFn, mockFn) {
  if (MOCK_MODE) return mockFn();
  try {
    const out = await liveFn();
    sources[name] = 'live';
    return out;
  } catch (err) {
    console.warn(`Live ${name} failed, using mock fallback:`, err.message);
    return mockFn();
  }
}

/* ---------------- SAM 3.1 (live) ---------------- */

async function callSam31Live(imageBuffer, tapPoint, opts) {
  if (!imageBuffer) throw new Error('SAM needs an image');
  const frame = opts.frame;
  if (!frame || !frame.width || !frame.height) throw new Error('SAM needs frame dimensions');
  const px = Math.max(0, Math.min(frame.width - 1, Math.floor(tapPoint.x * frame.width)));
  const py = Math.max(0, Math.min(frame.height - 1, Math.floor(tapPoint.y * frame.height)));
  const prompt = `<0f>1<|point;x=${px};y=${py};w=${frame.width};h=${frame.height}|>`;

  const res = await axios.post(`${BASE_URL}/responses`, {
    model: SAM_MODEL,
    input: [{
      type: 'message',
      role: 'user',
      content: [
        { type: 'input_text', text: prompt },
        { type: 'input_image', image_url: `data:image/jpeg;base64,${imageBuffer.toString('base64')}` }
      ]
    }],
    stream: true
  }, {
    headers: { Authorization: `Bearer ${META_API_KEY}`, 'Content-Type': 'application/json' },
    responseType: 'stream',
    timeout: 60000
  });

  const raw = await readStream(res.data);
  const box = parseSamBox(raw);
  if (!box) return { noDetection: true };
  const W = box.w, H = box.h;
  return {
    maskUrl: null,
    boundingBox: {
      x: box.x1 / W,
      y: box.y1 / H,
      width: (box.x2 - box.x1 + 1) / W,
      height: (box.y2 - box.y1 + 1) / H
    }
  };
}

function readStream(stream) {
  return new Promise((resolve, reject) => {
    let data = '';
    stream.on('data', (c) => { data += c.toString(); });
    stream.on('end', () => resolve(data));
    stream.on('error', reject);
  });
}

/** First `<|box;x1=..;y1=..;x2=..;y2=..;w=..;h=..|>` token in streamed output. */
function parseSamBox(raw) {
  const m = raw.match(/<\|box;x1=(\d+);y1=(\d+);x2=(\d+);y2=(\d+);w=(\d+);h=(\d+)\|>/);
  if (!m) return null;
  const [, x1, y1, x2, y2, w, h] = m.map(Number);
  if (!w || !h) return null;
  return { x1, y1, x2, y2, w, h };
}

/* ---------------- Voice Transcribe (live) ---------------- */

async function callVoiceTranscribeLive(audioBuffer, opts) {
  if (!audioBuffer) throw new Error('No audio to transcribe');
  const form = new FormData();
  form.append('request', JSON.stringify({
    mode: 'ENDPOINTING',
    model: VOICE_MODEL,
    audioEncoding: 'WAV'
  }), { contentType: 'application/json' });
  form.append('audio', audioBuffer, { filename: 'question.wav', contentType: 'audio/wav' });

  const sessionId = crypto.randomBytes(8).toString('hex');
  const res = await axios.post(`${BASE_URL}/asr/transcribe?sessionId=${sessionId}`, form, {
    headers: { Authorization: `Bearer ${META_API_KEY}`, ...form.getHeaders() },
    timeout: 60000
  });
  const text = (res.data && res.data.transcript ? String(res.data.transcript) : '').trim();
  if (!text) throw new Error('Empty transcript');
  const requested = (opts.language || 'auto').toLowerCase();
  return { text, language: requested === 'auto' ? 'auto' : requested };
}

/* ---------------- Muse Spark (live) ---------------- */

async function callMuseSparkLive(imageBuffer, maskData, transcription, opts) {
  const history = Array.isArray(opts.history) ? opts.history.slice(-3) : [];
  const historyText = history
    .map((t, i) => `Earlier Q${i + 1}: ${t.q}\nEarlier A${i + 1}: ${t.a}`)
    .join('\n');
  const lang = transcription.language && transcription.language !== 'auto'
    ? `Reply in ${languageName(transcription.language)}.`
    : 'Reply in the same language as the question.';
  const depthAsk = opts.depth === 'deep'
    ? 'Give a detailed answer (4-6 sentences covering what it is, its history, and how it was made).'
    : 'Answer in 2-3 sentences.';
  const box = maskData.boundingBox;
  const content = [
    {
      type: 'text',
      text: `Question about the tapped artifact: ${transcription.text}\n\n` +
        `The tapped object sits inside this normalized box of the image: ` +
        `x=${box.x.toFixed(3)}, y=${box.y.toFixed(3)}, ` +
        `width=${box.width.toFixed(3)}, height=${box.height.toFixed(3)}. ` +
        `Describe ONLY that object, never the background.\n` +
        (historyText ? `Conversation so far:\n${historyText}\n` : '') +
        `${lang} ${depthAsk}\n\nRespond as JSON: ` +
        `{"answer": "...", "period": "..."|null, "material": "..."|null, ` +
        `"type": "..."|null, "origin": "..."|null}`
    }
  ];
  if (imageBuffer) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${imageBuffer.toString('base64')}` }
    });
  }

  const res = await axios.post(`${BASE_URL}/chat/completions`, {
    model: SPARK_MODEL,
    messages: [
      { role: 'system', content: 'You are LookWhere, a museum guide. You describe ONLY the user-tapped artifact, grounded in the image. If you are unsure about a fact, say so briefly rather than inventing it.' },
      { role: 'user', content }
    ],
    response_format: { type: 'json_object' },
    max_tokens: 2000
  }, {
    headers: { Authorization: `Bearer ${META_API_KEY}`, 'Content-Type': 'application/json' },
    timeout: 90000
  });

  const raw = res.data.choices[0].message.content;
  const parsed = JSON.parse(stripFences(raw));
  return {
    text: parsed.answer,
    metadata: {
      period: parsed.period || undefined,
      material: parsed.material || undefined,
      type: parsed.type || undefined,
      origin: parsed.origin || undefined
    }
  };
}

function languageName(code) {
  return { en: 'English', hi: 'Hindi', ta: 'Tamil', bn: 'Bengali' }[code] || 'English';
}

function stripFences(s) {
  return String(s).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

/* ---------------- Mocks (offline fallback + no-key mode) ---------------- */

function callSam31Mock(tapPoint) {
  console.log('Mock SAM 3.1 with tap point:', tapPoint);
  const EDGE = 0.03;
  if (tapPoint.x < EDGE || tapPoint.x > 1 - EDGE || tapPoint.y < EDGE || tapPoint.y > 1 - EDGE) {
    return { noDetection: true };
  }
  const w = 0.24, h = 0.3;
  return {
    maskUrl: 'mock:mask',
    boundingBox: {
      x: Math.min(0.72, Math.max(0.04, tapPoint.x - w / 2)),
      y: Math.min(0.66, Math.max(0.04, tapPoint.y - h / 2)),
      width: w,
      height: h
    }
  };
}

function callVoiceTranscribeMock(audioBuffer, opts = {}) {
  console.log('Mock Voice Transcribe...');
  const requested = (opts.language || 'auto').toLowerCase();
  if (audioBuffer) {
    const lang = requested === 'auto' ? 'en' : requested;
    const fix = MOCK_ANSWERS[lang] || MOCK_ANSWERS.en;
    return { text: fix.transcription, language: lang };
  }
  const typed = (opts.question || '').trim();
  if (typed) {
    const lang = requested === 'auto' ? 'en' : requested;
    return { text: typed, language: lang };
  }
  const fix = MOCK_ANSWERS[requested] || MOCK_ANSWERS.en;
  return { text: fix.transcription, language: requested === 'auto' ? 'en' : requested };
}

function callMuseSparkMock(transcription) {
  console.log('Mock Muse Spark with transcription:', transcription.text);
  const fix = MOCK_ANSWERS[transcription.language] || MOCK_ANSWERS.en;
  return {
    text: fix.text,
    metadata: {
      period: '4th Century BCE',
      material: 'Terracotta',
      type: 'Oil Lamp',
      origin: 'Gangetic Plain'
    }
  };
}

module.exports = {
  processIdentification,
  // exported for unit probing, not part of the HTTP contract
  _parseSamBox: parseSamBox
};
