const express = require('express');
const multer = require('multer');

const { transcribeAudio } = require('../controllers/sttController');
const authMiddleware = require('../middleware/authMiddleware');
const { createRateLimiter } = require('../middleware/rateLimitMiddleware');

const router = express.Router();

const STT_MAX_AUDIO_UPLOAD_BYTES = 512 * 1024;
const MONTHLY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_MONTHLY_REQUEST_CAP = 12000;
const monthlyRequestCap = Math.max(1, Number(process.env.STT_MONTHLY_REQUEST_CAP || DEFAULT_MONTHLY_REQUEST_CAP));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: STT_MAX_AUDIO_UPLOAD_BYTES,
  },
});

const sttPerUserLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
  keyPrefix: 'stt-transcribe',
  scopeByUser: true,
});

const sttMonthlyLimiter = createRateLimiter({
  windowMs: MONTHLY_WINDOW_MS,
  maxRequests: monthlyRequestCap,
  keyPrefix: 'stt-transcribe-monthly',
  scopeByUser: true,
});

router.post('/transcribe', authMiddleware, sttPerUserLimiter, sttMonthlyLimiter, upload.single('audio'), transcribeAudio);

module.exports = router;
