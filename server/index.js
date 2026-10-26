require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { processIdentification } = require('./services/metaApiService');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from the React client build
app.use(express.static('client/dist'));

/**
 * POST /api/identify
 * Receives an image and audio, processes them via Meta Model API, and returns a grounded answer.
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mockMode: !process.env.META_API_KEY, timestamp: new Date().toISOString() });
});

app.post('/api/identify', upload.fields([{ name: 'image' }, { name: 'audio' }]), async (req, res) => {
  try {
    const imageFile = req.files && req.files['image'] && req.files['image'][0];
    const audioFile = req.files && req.files['audio'] && req.files['audio'][0];
    const imageBuffer = imageFile ? imageFile.buffer : null;
    const audioBuffer = audioFile ? audioFile.buffer : null;
    let tapPoint = { x: 0.5, y: 0.5 };
    try {
      if (req.body.tapPoint) tapPoint = JSON.parse(req.body.tapPoint);
    } catch (e) { /* keep default */ }
    const language = req.body.language || 'auto';
    const question = (req.body.question || '').slice(0, 2000);
    const depth = req.body.depth === 'deep' ? 'deep' : 'quick';
    const frame = {
      width: Number(req.body.frameWidth) || 0,
      height: Number(req.body.frameHeight) || 0
    };
    let history = [];
    try {
      const parsed = JSON.parse(req.body.history || '[]');
      if (Array.isArray(parsed)) history = parsed.slice(-3);
    } catch (e) { /* no history */ }

    console.log('Processing request:', { tapPoint, language, hasImage: !!imageBuffer, hasAudio: !!audioBuffer });

    const result = await processIdentification(imageBuffer, audioBuffer, tapPoint, { language, question, frame, history, depth });

    res.json(result);
  } catch (error) {
    console.error('Error in /api/identify:', error);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Failed to process identification request' });
  }
});

// Fallback for SPA routing
app.get('*', (req, res) => {
  res.sendFile('client/dist/index.html');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`LookWhere server running on port ${PORT}`);
});