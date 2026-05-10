const DEFAULT_UPLOAD_URL = 'https://api.assemblyai.com/v2/upload';
const DEFAULT_TRANSCRIPT_URL = 'https://api.assemblyai.com/v2/transcript';
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_POLL_INTERVAL_MS = 1200;
const DEFAULT_LANGUAGE_DETECTION = false;

const providerName = 'assemblyai';

const mapLocaleToLanguageCode = (locale) => {
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

const buildWordBoost = (hints = []) => {
  const rows = Array.isArray(hints) ? hints : [];
  return rows
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 40);
};

const throwProviderError = ({ code, message, status = null, payload = null }) => {
  const error = new Error(message);
  error.code = code;
  error.details = {
    status,
    payload,
  };
  throw error;
};

const parseJsonSafe = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const uploadAudio = async ({ apiKey, audio, uploadUrl }) => {
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': audio?.mimetype || 'application/octet-stream',
    },
    body: audio.buffer,
  });

  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    throwProviderError({
      code: 'ASSEMBLYAI_UPLOAD_ERROR',
      message: payload?.error || payload?.message || `AssemblyAI upload failed with status ${response.status}.`,
      status: response.status,
      payload,
    });
  }

  const audioUrl = String(payload?.upload_url || '').trim();
  if (!audioUrl) {
    throwProviderError({
      code: 'ASSEMBLYAI_UPLOAD_URL_MISSING',
      message: 'AssemblyAI upload succeeded but upload_url was missing.',
      status: response.status,
      payload,
    });
  }

  return audioUrl;
};

const startTranscript = async ({ apiKey, transcriptUrl, audioUrl, locale, hints }) => {
  const languageCode = mapLocaleToLanguageCode(locale);
  const wordBoost = buildWordBoost(hints);
  const languageDetectionEnabled = String(
    process.env.STT_ASSEMBLYAI_LANGUAGE_DETECTION
    ?? (DEFAULT_LANGUAGE_DETECTION ? '1' : '0')
  ).trim() !== '0';
  const speechModel = String(process.env.STT_ASSEMBLYAI_SPEECH_MODEL || 'best').trim() || 'best';
  const body = {
    audio_url: audioUrl,
    speech_model: speechModel,
    language_detection: languageDetectionEnabled,
  };

  if (!languageDetectionEnabled) {
    body.language_code = languageCode;
  }

  if (wordBoost.length) {
    body.word_boost = wordBoost;
  }

  const response = await fetch(transcriptUrl, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    throwProviderError({
      code: 'ASSEMBLYAI_TRANSCRIPT_START_ERROR',
      message: payload?.error || payload?.message || `AssemblyAI transcript start failed with status ${response.status}.`,
      status: response.status,
      payload,
    });
  }

  const transcriptId = String(payload?.id || '').trim();
  if (!transcriptId) {
    throwProviderError({
      code: 'ASSEMBLYAI_TRANSCRIPT_ID_MISSING',
      message: 'AssemblyAI transcript id missing from create response.',
      status: response.status,
      payload,
    });
  }

  return transcriptId;
};

const pollTranscript = async ({ apiKey, transcriptUrl, transcriptId, timeoutMs, pollIntervalMs }) => {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const response = await fetch(`${transcriptUrl}/${transcriptId}`, {
      method: 'GET',
      headers: {
        Authorization: apiKey,
        Accept: 'application/json',
      },
    });

    const payload = await parseJsonSafe(response);
    if (!response.ok) {
      throwProviderError({
        code: 'ASSEMBLYAI_TRANSCRIPT_POLL_ERROR',
        message: payload?.error || payload?.message || `AssemblyAI transcript poll failed with status ${response.status}.`,
        status: response.status,
        payload,
      });
    }

    const status = String(payload?.status || '').trim().toLowerCase();
    if (status === 'completed') {
      return payload;
    }

    if (status === 'error') {
      throwProviderError({
        code: 'ASSEMBLYAI_TRANSCRIPT_ERROR',
        message: payload?.error || payload?.message || 'AssemblyAI transcription failed.',
        status: response.status,
        payload,
      });
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throwProviderError({
    code: 'ASSEMBLYAI_TIMEOUT',
    message: 'AssemblyAI transcription timed out.',
    status: 408,
    payload: null,
  });
};

const transcribe = async ({ audio, locale = 'bn-BD', hints = [] } = {}) => {
  const apiKey = String(process.env.STT_ASSEMBLYAI_API_KEY || '').trim();
  if (!apiKey) {
    const error = new Error('STT_ASSEMBLYAI_API_KEY is not configured.');
    error.code = 'ASSEMBLYAI_API_KEY_MISSING';
    throw error;
  }

  if (!audio?.buffer || !Buffer.isBuffer(audio.buffer) || audio.buffer.length === 0) {
    const error = new Error('Audio buffer is required for AssemblyAI transcription.');
    error.code = 'ASSEMBLYAI_AUDIO_MISSING';
    throw error;
  }

  const uploadUrl = String(process.env.STT_ASSEMBLYAI_UPLOAD_URL || DEFAULT_UPLOAD_URL).trim() || DEFAULT_UPLOAD_URL;
  const transcriptUrl = String(process.env.STT_ASSEMBLYAI_TRANSCRIPT_URL || DEFAULT_TRANSCRIPT_URL).trim() || DEFAULT_TRANSCRIPT_URL;
  const timeoutMs = Math.max(5000, Number(process.env.STT_ASSEMBLYAI_TIMEOUT_MS || DEFAULT_TIMEOUT_MS));
  const pollIntervalMs = Math.max(300, Number(process.env.STT_ASSEMBLYAI_POLL_INTERVAL_MS || DEFAULT_POLL_INTERVAL_MS));
  const providerStart = Date.now();

  const audioUrl = await uploadAudio({ apiKey, audio, uploadUrl });
  const transcriptId = await startTranscript({ apiKey, transcriptUrl, audioUrl, locale, hints });
  const transcript = await pollTranscript({ apiKey, transcriptUrl, transcriptId, timeoutMs, pollIntervalMs });

  return {
    text: String(transcript?.text || '').trim(),
    confidence: normalizeConfidence(transcript?.confidence),
    latency_ms: Math.max(1, Date.now() - providerStart),
    provider: providerName,
  };
};

module.exports = {
  providerName,
  transcribe,
};