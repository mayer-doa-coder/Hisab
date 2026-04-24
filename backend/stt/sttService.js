const crypto = require('crypto');

const whisperProvider = require('./providers/whisperProvider');
const googleProvider = require('./providers/googleProvider');
const assemblyAiProvider = require('./providers/assemblyAiProvider');
const elevenlabsProvider = require('./providers/elevenlabsProvider');

const PROVIDER_REGISTRY = Object.freeze({
  whisper: whisperProvider,
  google: googleProvider,
  assemblyai: assemblyAiProvider,
  elevenlabs: elevenlabsProvider,
});

const DEFAULT_PROVIDER = 'elevenlabs';
const INTENT_HINTS = new Set(['baki', 'joma', 'becha', 'kinbo']);
const DATE_HINTS = new Set(['aj', 'kal']);

const shouldUseDeterministicFallback = () => {
  const raw = String(process.env.STT_ALLOW_DETERMINISTIC_FALLBACK || '').trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'yes') {
    return true;
  }
  if (raw === '0' || raw === 'false' || raw === 'no') {
    return false;
  }

  // Default to enabled outside production to keep local/dev voice usable.
  return String(process.env.NODE_ENV || '').trim().toLowerCase() !== 'production';
};

const normalizeHints = (hints) => {
  if (!Array.isArray(hints)) {
    return [];
  }

  return hints
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 30);
};

const normalizeLocale = (locale) => {
  const value = String(locale || '').trim();
  return value || 'bn-BD';
};

const normalizeConfidence = (value) => {
  const x = Number(value);
  if (!Number.isFinite(x)) {
    return 0;
  }
  return Math.max(0, Math.min(1, x));
};

const pickProvider = () => {
  const key = String(process.env.STT_ACTIVE_PROVIDER || DEFAULT_PROVIDER).trim().toLowerCase();
  return PROVIDER_REGISTRY[key] || PROVIDER_REGISTRY[DEFAULT_PROVIDER];
};

const buildFallbackToken = ({ fsmState = '', hints = [] } = {}) => {
  const normalizedState = String(fsmState || '').trim().toUpperCase();
  const normalizedHints = (Array.isArray(hints) ? hints : [])
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean);

  const firstIntent = normalizedHints.find((item) => INTENT_HINTS.has(item)) || 'baki';
  const firstName = normalizedHints.find((item) => !INTENT_HINTS.has(item) && !DATE_HINTS.has(item) && !/^\d+(\.\d+)?$/.test(item)) || 'rahim';
  const firstAmount = normalizedHints.find((item) => /^\d+(\.\d+)?$/.test(item)) || '100';
  const firstDate = normalizedHints.find((item) => DATE_HINTS.has(item)) || 'aj';

  if (normalizedState === 'WAIT_INTENT') {
    return firstIntent;
  }
  if (normalizedState === 'WAIT_NAME') {
    return firstName;
  }
  if (normalizedState === 'WAIT_AMOUNT') {
    return firstAmount;
  }
  if (normalizedState === 'WAIT_DATE') {
    return firstDate;
  }
  if (normalizedState === 'CONFIRM') {
    return 'confirm';
  }

  return firstIntent;
};

const buildDeterministicFallbackResponse = ({ fsmState, hints, serviceStart, request_id }) => ({
  text: buildFallbackToken({ fsmState, hints }),
  confidence: 0,
  latency_ms: Math.max(1, Date.now() - serviceStart),
  request_id,
  provider: 'deterministic_fallback',
});

const logRequest = ({ request_id, provider, latency_ms, ok, errorCode = null, errorMessage = null }) => {
  const payload = {
    request_id,
    provider,
    latency_ms,
    ok,
    error_code: errorCode,
    error_message: errorMessage,
  };

  if (ok) {
    console.info('[stt] transcribe.success', payload);
    return;
  }

  console.error('[stt] transcribe.failure', payload);
};

const transcribe = async ({
  audio,
  locale = 'bn-BD',
  hints = [],
  fsmState = '',
  requestId = null,
} = {}) => {
  const request_id = String(requestId || '').trim() || crypto.randomUUID();
  const provider = pickProvider();
  const serviceStart = Date.now();

  try {
    const providerResult = await provider.transcribe({
      audio,
      locale: normalizeLocale(locale),
      hints: normalizeHints(hints),
    });

    const latency_ms = Math.max(1, Number(providerResult?.latency_ms || (Date.now() - serviceStart)));
    const text = String(providerResult?.text || '').trim();
    const confidence = normalizeConfidence(providerResult?.confidence);

    const result = {
      text,
      confidence,
      latency_ms,
      request_id,
      provider: String(provider?.providerName || DEFAULT_PROVIDER),
    };

    logRequest({
      request_id,
      provider: result.provider,
      latency_ms: result.latency_ms,
      ok: true,
    });

    return result;
  } catch (error) {
    if (shouldUseDeterministicFallback()) {
      const fallback = buildDeterministicFallbackResponse({
        fsmState,
        hints,
        serviceStart,
        request_id,
      });

      console.warn('[stt] transcribe.fallback', {
        request_id,
        source_provider: String(provider?.providerName || DEFAULT_PROVIDER),
        reason_code: String(error?.code || 'STT_PROVIDER_ERROR'),
        reason_message: error?.message || 'Provider failed',
        fsm_state: String(fsmState || '').trim().toUpperCase() || null,
      });

      logRequest({
        request_id,
        provider: fallback.provider,
        latency_ms: fallback.latency_ms,
        ok: true,
      });

      return fallback;
    }

    logRequest({
      request_id,
      provider: String(provider?.providerName || DEFAULT_PROVIDER),
      latency_ms: Math.max(1, Date.now() - serviceStart),
      ok: false,
      errorCode: String(error?.code || 'STT_PROVIDER_ERROR'),
      errorMessage: error?.message || 'Provider failed',
    });

    error.request_id = request_id;
    throw error;
  }
};

module.exports = {
  transcribe,
};
