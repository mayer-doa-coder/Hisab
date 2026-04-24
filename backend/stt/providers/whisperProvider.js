const DEFAULT_WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';
const DEFAULT_WHISPER_MODEL = 'whisper-1';

const mapLocaleToLanguage = (locale) => {
  const normalized = String(locale || '').trim().toLowerCase();
  if (!normalized) {
    return 'bn';
  }

  const [language] = normalized.split('-');
  return language || 'bn';
};

const normalizeConfidence = (value) => {
  const x = Number(value);
  if (!Number.isFinite(x)) {
    return 0;
  }
  return Math.max(0, Math.min(1, x));
};

const normalizeText = (payload) => {
  const source = payload?.data || payload || {};
  return String(source?.text || '').trim();
};

const buildPromptFromHints = (hints) => {
  const rows = Array.isArray(hints) ? hints : [];
  const normalized = rows
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 30);

  if (!normalized.length) {
    return '';
  }

  return `Keywords: ${normalized.join(', ')}`;
};

const providerName = 'whisper';

const transcribe = async ({ audio, locale = 'bn-BD', hints = [] } = {}) => {
  const apiKey = String(process.env.STT_WHISPER_API_KEY || '').trim();
  if (!apiKey) {
    const error = new Error('STT_WHISPER_API_KEY is not configured.');
    error.code = 'WHISPER_API_KEY_MISSING';
    throw error;
  }

  const endpoint = String(process.env.STT_WHISPER_URL || DEFAULT_WHISPER_URL).trim() || DEFAULT_WHISPER_URL;
  const model = String(process.env.STT_WHISPER_MODEL || DEFAULT_WHISPER_MODEL).trim() || DEFAULT_WHISPER_MODEL;

  const providerStart = Date.now();

  const formData = new FormData();
  formData.append('file', new Blob([audio.buffer], { type: audio.mimetype || 'application/octet-stream' }), audio.originalname || 'voice-input.wav');
  formData.append('model', model);
  formData.append('language', mapLocaleToLanguage(locale));
  formData.append('response_format', 'json');

  const prompt = buildPromptFromHints(hints);
  if (prompt) {
    formData.append('prompt', prompt);
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
    body: formData,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error(payload?.error?.message || payload?.message || `Whisper provider failed with status ${response.status}.`);
    error.code = 'WHISPER_PROVIDER_ERROR';
    error.details = {
      status: response.status,
      payload,
    };
    throw error;
  }

  const text = normalizeText(payload);
  // Whisper does not return a confidence score; use a sensible default.
  const confidence = payload?.confidence != null ? normalizeConfidence(payload.confidence) : 0.85;

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
