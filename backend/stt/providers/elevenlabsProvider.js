const DEFAULT_STT_URL = 'https://api.elevenlabs.io/v1/speech-to-text';
const DEFAULT_MODEL_ID = 'scribe_v1';

const providerName = 'elevenlabs';

const mapLocaleToLanguageCode = (locale) => {
  const normalized = String(locale || '').trim().toLowerCase();
  if (!normalized) return 'bn';
  const [language] = normalized.split('-');
  return language || 'bn';
};

const normalizeConfidence = (value) => {
  const x = Number(value);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
};

const parseJsonSafe = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const transcribe = async ({ audio, locale = 'bn-BD', hints = [] } = {}) => {
  const apiKey = String(process.env.STT_ELEVENLABS_API_KEY || '').trim();
  if (!apiKey) {
    const error = new Error('STT_ELEVENLABS_API_KEY is not configured.');
    error.code = 'ELEVENLABS_API_KEY_MISSING';
    throw error;
  }

  if (!audio?.buffer || !Buffer.isBuffer(audio.buffer) || audio.buffer.length === 0) {
    const error = new Error('Audio buffer is required for ElevenLabs transcription.');
    error.code = 'ELEVENLABS_AUDIO_MISSING';
    throw error;
  }

  const endpoint = String(process.env.STT_ELEVENLABS_URL || DEFAULT_STT_URL).trim() || DEFAULT_STT_URL;
  const modelId = String(process.env.STT_ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID).trim() || DEFAULT_MODEL_ID;
  const languageCode = mapLocaleToLanguageCode(locale);
  const providerStart = Date.now();

  const formData = new FormData();
  formData.append(
    'file',
    new Blob([audio.buffer], { type: audio.mimetype || 'audio/wav' }),
    audio.originalname || 'voice-input.wav',
  );
  formData.append('model_id', modelId);
  formData.append('language_code', languageCode);
  formData.append('tag_audio_events', 'false');
  formData.append('diarize', 'false');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      Accept: 'application/json',
    },
    body: formData,
  });

  const payload = await parseJsonSafe(response);

  if (!response.ok) {
    const error = new Error(
      payload?.detail?.message
      || payload?.error?.message
      || payload?.message
      || `ElevenLabs STT failed with status ${response.status}.`,
    );
    error.code = 'ELEVENLABS_PROVIDER_ERROR';
    error.details = { status: response.status, payload };
    throw error;
  }

  const text = String(payload?.text || '').trim();
  // ElevenLabs returns language_probability (0–1) as the confidence signal.
  const confidence = normalizeConfidence(payload?.language_probability ?? 0.85);

  return {
    text,
    confidence,
    latency_ms: Math.max(1, Date.now() - providerStart),
    provider: providerName,
  };
};

module.exports = {
  providerName,
  transcribe,
};
