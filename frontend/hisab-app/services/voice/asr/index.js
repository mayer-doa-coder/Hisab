import { applyGrammarConstraint } from './decoder';
import { transcribeRecordedAudio } from './sttAdapter';
import { VOICE_TUNING_CONFIG } from '../config/voiceTuningConfig';
import { logSttRequest } from '../voiceAnalyticsLogger';

const SILENCE_RETRY_MESSAGE = 'No speech detected. Please retry.';
const DEFAULT_MAX_UTTERANCE_MS = 4000;
const STT_TIMEOUT_MS = 12000;
const FRONTEND_STT_MIN_GAP_MS = 1200;
const MAX_AUDIO_SIZE_BYTES = 350 * 1024;
const MIN_VALID_AUDIO_MS = 120;
const MIN_STT_CONFIDENCE = Number(VOICE_TUNING_CONFIG?.thresholds?.asrAcceptance || 0.55);

const FAILURE_REASONS = Object.freeze({
  TIMEOUT: 'TIMEOUT',
  NETWORK_ERROR: 'NETWORK_ERROR',
  EMPTY_RESULT: 'EMPTY_RESULT',
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',
  STT_ERROR: 'STT_ERROR',
  NO_SPEECH: 'NO_SPEECH',
  GRAMMAR_REJECTED: 'GRAMMAR_REJECTED',
  AUDIO_TOO_LONG: 'AUDIO_TOO_LONG',
  AUDIO_TOO_LARGE: 'AUDIO_TOO_LARGE',
  THROTTLED: 'THROTTLED',
});

const mapSttFailureReason = (error) => {
  const code = String(error?.code || '').toUpperCase();
  if (code.includes('TIMEOUT')) {
    return FAILURE_REASONS.TIMEOUT;
  }
  if (code.includes('NETWORK')) {
    return FAILURE_REASONS.NETWORK_ERROR;
  }
  return FAILURE_REASONS.STT_ERROR;
};

const transcribeWithTimeoutRetry = async ({
  audioUri,
  accessToken,
  knownNames,
  fsmState,
}) => {
  try {
    return await transcribeRecordedAudio({
      audioUri,
      accessToken,
      locale: 'bn-BD',
      hints: buildSttHints(knownNames),
      fsmState,
      timeoutMs: STT_TIMEOUT_MS,
    });
  } catch (error) {
    const reason = mapSttFailureReason(error);
    if (reason !== FAILURE_REASONS.TIMEOUT) {
      throw error;
    }

    // One retry with a longer timeout helps slower networks/providers.
    return transcribeRecordedAudio({
      audioUri,
      accessToken,
      locale: 'bn-BD',
      hints: buildSttHints(knownNames),
      fsmState,
      timeoutMs: STT_TIMEOUT_MS + 4000,
    });
  }
};

let audioModuleCache = null;

const getAudioModule = () => {
  if (audioModuleCache) {
    return audioModuleCache;
  }

  try {
    const moduleRef = require('./audioRecorder');
    audioModuleCache = {
      requestMicrophonePermission: moduleRef.requestMicrophonePermission,
      startPushToTalkRecording: moduleRef.startPushToTalkRecording,
      stopPushToTalkRecording: moduleRef.stopPushToTalkRecording,
      MAX_UTTERANCE_MS: moduleRef.MAX_UTTERANCE_MS || DEFAULT_MAX_UTTERANCE_MS,
      MAX_AUDIO_FILE_BYTES: moduleRef.MAX_AUDIO_FILE_BYTES || MAX_AUDIO_SIZE_BYTES,
    };
    return audioModuleCache;
  } catch (_error) {
    audioModuleCache = {
      requestMicrophonePermission: async () => true,
      startPushToTalkRecording: async () => ({ recording: null, timer: null }),
      stopPushToTalkRecording: async () => ({ uri: null, durationMs: 0 }),
      MAX_UTTERANCE_MS: DEFAULT_MAX_UTTERANCE_MS,
      MAX_AUDIO_FILE_BYTES: MAX_AUDIO_SIZE_BYTES,
    };
    return audioModuleCache;
  }
};

const nowMs = () => Date.now();

const buildSttHints = (knownNames = []) => {
  const lexicalHints = (Array.isArray(knownNames) ? knownNames : [])
    .map((item) => String(item?.name || item?.label || item || '').trim())
    .filter(Boolean)
    .slice(0, 12);

  return ['baki', 'joma', 'becha', 'kinbo', ...lexicalHints];
};

export class OfflineAsrEngine {
  constructor() {
    this.activeRecording = null;
    this.lastSttStartedAt = 0;
    this.requestCount = 0;
  }

  hasPendingRecording() {
    return Boolean(this.activeRecording?.recording);
  }

  async initialize(_config = {}) {
    return {
      ready: true,
      mode: 'backend_stt',
    };
  }

  async startListening({ maxDurationMs = MAX_UTTERANCE_MS, onAutoStop } = {}) {
    const { startPushToTalkRecording, MAX_UTTERANCE_MS } = getAudioModule();
    this.activeRecording = await startPushToTalkRecording({ maxDurationMs: maxDurationMs || MAX_UTTERANCE_MS, onAutoStop });
    return {
      listening: true,
      maxDurationMs,
    };
  }

  async stopAndTranscribe({
    fsmState,
    knownNames = [],
    hintedText = '',
    accessToken = null,
    detectionOnly = false,
  } = {}) {
    const e2eStarted = nowMs();

    const { stopPushToTalkRecording } = getAudioModule();
    const stopped = await stopPushToTalkRecording(this.activeRecording || {});
    this.activeRecording = null;

    const currentMs = nowMs();
    const minGapRemainingMs = Math.max(0, FRONTEND_STT_MIN_GAP_MS - (currentMs - Number(this.lastSttStartedAt || 0)));
    if (minGapRemainingMs > 0) {
      return {
        status: 'FAILED',
        text: '',
        tokens: [],
        confidence: 0,
        latency_ms: Math.max(1, nowMs() - e2eStarted),
        ok: false,
        reason: FAILURE_REASONS.THROTTLED,
        message: 'খুব দ্রুত আবার রেকর্ড করা হয়েছে। 1 সেকেন্ড পরে চেষ্টা করুন।',
        retry_after_ms: minGapRemainingMs,
      };
    }

    this.lastSttStartedAt = currentMs;

    const { MAX_UTTERANCE_MS, MAX_AUDIO_FILE_BYTES } = getAudioModule();
    const audioUri = String(stopped?.uri || '').trim();
    const capturedDurationMs = Number(stopped?.effectiveDurationMs || stopped?.durationMs || 0);
    const rawDurationMs = Number(stopped?.durationMs || capturedDurationMs);
    const fileSizeBytes = Number(stopped?.fileSizeBytes || 0);
    const maxDurationMs = Number(MAX_UTTERANCE_MS || DEFAULT_MAX_UTTERANCE_MS);
    const maxAudioFileBytes = Number(MAX_AUDIO_FILE_BYTES || MAX_AUDIO_SIZE_BYTES);

    const hasRecordedBytes = fileSizeBytes > 0;
    if (!audioUri || (!hasRecordedBytes && capturedDurationMs < MIN_VALID_AUDIO_MS)) {
      return {
        status: 'FAILED',
        text: '',
        tokens: [],
        confidence: 0,
        latency_ms: Math.max(1, nowMs() - e2eStarted),
        ok: false,
        reason: FAILURE_REASONS.NO_SPEECH,
        message: SILENCE_RETRY_MESSAGE,
        audio: {
          uri: stopped.uri,
          durationMs: capturedDurationMs,
          file_size_bytes: fileSizeBytes,
        },
      };
    }

    if (rawDurationMs > maxDurationMs + 120) {
      return {
        status: 'FAILED',
        text: '',
        tokens: [],
        confidence: 0,
        latency_ms: Math.max(1, nowMs() - e2eStarted),
        ok: false,
        reason: FAILURE_REASONS.AUDIO_TOO_LONG,
        message: 'রেকর্ডিং 4 সেকেন্ডের বেশি। ছোট করে আবার বলুন।',
        audio: {
          uri: stopped.uri,
          durationMs: capturedDurationMs,
          file_size_bytes: fileSizeBytes,
        },
      };
    }

    if (fileSizeBytes > 0 && fileSizeBytes > maxAudioFileBytes) {
      return {
        status: 'FAILED',
        text: '',
        tokens: [],
        confidence: 0,
        latency_ms: Math.max(1, nowMs() - e2eStarted),
        ok: false,
        reason: FAILURE_REASONS.AUDIO_TOO_LARGE,
        message: 'অডিও ফাইল অনেক বড় হয়েছে। আবার ছোট করে বলুন।',
        audio: {
          uri: stopped.uri,
          durationMs: capturedDurationMs,
          file_size_bytes: fileSizeBytes,
        },
      };
    }

    this.requestCount += 1;

    let sttResult;
    try {
      sttResult = await transcribeWithTimeoutRetry({
        audioUri,
        accessToken,
        knownNames,
        fsmState,
      });
    } catch (error) {
      const reason = mapSttFailureReason(error);

      const message = reason === FAILURE_REASONS.TIMEOUT
        ? 'সময় বেশি লেগেছে, আবার চেষ্টা করুন।'
        : (reason === FAILURE_REASONS.NETWORK_ERROR
          ? 'Network সমস্যা হয়েছে, আবার চেষ্টা করুন।'
          : 'Transcription failed. Please retry.');

      return {
        status: 'FAILED',
        text: '',
        tokens: [],
        confidence: 0,
        latency_ms: Math.max(1, nowMs() - e2eStarted),
        ok: false,
        reason,
        message,
        request_id: String(error?.details?.request_id || ''),
        audio: {
          uri: stopped.uri,
          durationMs: capturedDurationMs,
          file_size_bytes: fileSizeBytes,
        },
        cost_proxy: {
          audio_seconds: Number((capturedDurationMs / 1000).toFixed(2)),
          request_count: this.requestCount,
        },
      };
    }

    logSttRequest({
      latency_ms: Number(sttResult?.latency_ms || 0),
      audio_duration: Number((capturedDurationMs / 1000).toFixed(2)),
      file_size_kb: Number((fileSizeBytes / 1024).toFixed(2)),
      request_id: String(sttResult?.request_id || ''),
      audio_seconds: Number((capturedDurationMs / 1000).toFixed(2)),
      request_count: this.requestCount,
      status: 'SUCCESS',
    });

    const transcriptText = String(sttResult?.text || '').trim();
    const sttStatus = String(sttResult?.status || (transcriptText ? 'SUCCESS' : 'FAILED')).trim().toUpperCase();
    const sttConfidence = Number(sttResult?.confidence);
    const safeSttConfidence = Number.isFinite(sttConfidence) ? sttConfidence : 0;

    if (sttStatus !== 'SUCCESS' || !transcriptText) {
      return {
        status: 'FAILED',
        text: '',
        tokens: [],
        confidence: 0,
        latency_ms: Math.max(1, nowMs() - e2eStarted),
        ok: false,
        reason: FAILURE_REASONS.EMPTY_RESULT,
        message: 'Please speak again.',
        request_id: String(sttResult?.request_id || ''),
        raw_transcript: transcriptText,
        audio: {
          uri: stopped.uri,
          durationMs: capturedDurationMs,
          file_size_bytes: fileSizeBytes,
        },
        cost_proxy: {
          audio_seconds: Number((capturedDurationMs / 1000).toFixed(2)),
          request_count: this.requestCount,
        },
      };
    }

    if (detectionOnly) {
      const latencyMs = Math.max(1, nowMs() - e2eStarted);
      return {
        status: 'SUCCESS',
        text: transcriptText,
        tokens: transcriptText.split(/\s+/).filter(Boolean),
        acceptedToken: transcriptText,
        confidence: safeSttConfidence,
        latency_ms: latencyMs,
        ok: true,
        reason: 'DETECTION_ONLY',
        request_id: String(sttResult?.request_id || ''),
        raw_transcript: transcriptText,
        detection_only: true,
        audio: {
          uri: stopped.uri,
          durationMs: stopped.durationMs,
          file_size_bytes: fileSizeBytes,
        },
        stt: {
          confidence: safeSttConfidence,
          latency_ms: Number(sttResult?.latency_ms || 0),
          request_id: String(sttResult?.request_id || ''),
          provider: String(sttResult?.provider || ''),
        },
      };
    }

    const grammar = applyGrammarConstraint({
      text: transcriptText,
      state: fsmState,
      knownNames,
    });

    const acceptedToken = grammar.acceptedToken || '';
    if (!acceptedToken) {
      return {
        status: 'FAILED',
        text: '',
        tokens: grammar.tokens || [],
        confidence: 0,
        latency_ms: Math.max(1, nowMs() - e2eStarted),
        ok: false,
        reason: FAILURE_REASONS.GRAMMAR_REJECTED,
        message: 'কথা শোনা যায়নি, আবার বলুন।',
        request_id: String(sttResult?.request_id || ''),
        raw_transcript: transcriptText,
        audio: {
          uri: stopped.uri,
          durationMs: stopped.durationMs,
          file_size_bytes: fileSizeBytes,
        },
        cost_proxy: {
          audio_seconds: Number((capturedDurationMs / 1000).toFixed(2)),
          request_count: this.requestCount,
        },
      };
    }

    const grammarConfidence = Number(grammar?.confidence || 0);
    if (safeSttConfidence > 0 && safeSttConfidence < MIN_STT_CONFIDENCE && grammarConfidence < 0.65) {
      return {
        status: 'FAILED',
        text: '',
        tokens: grammar.tokens || [],
        confidence: safeSttConfidence,
        latency_ms: Math.max(1, nowMs() - e2eStarted),
        ok: false,
        reason: FAILURE_REASONS.LOW_CONFIDENCE,
        message: 'কথা স্পষ্ট হয়নি, আবার বলুন।',
        request_id: String(sttResult?.request_id || ''),
        raw_transcript: transcriptText,
        audio: {
          uri: stopped.uri,
          durationMs: capturedDurationMs,
          file_size_bytes: fileSizeBytes,
        },
        cost_proxy: {
          audio_seconds: Number((capturedDurationMs / 1000).toFixed(2)),
          request_count: this.requestCount,
        },
      };
    }

    const overallConfidence = Number((safeSttConfidence * grammar.confidence).toFixed(3));
    const latencyMs = Math.max(1, nowMs() - e2eStarted);

    return {
      status: 'SUCCESS',
      text: grammar.text,
      tokens: grammar.tokens,
      acceptedToken,
      confidence: overallConfidence,
      latency_ms: latencyMs,
      ok: true,
      reason: grammar.reason,
      request_id: String(sttResult?.request_id || ''),
      raw_transcript: transcriptText,
      audio: {
        uri: stopped.uri,
        durationMs: stopped.durationMs,
        file_size_bytes: fileSizeBytes,
      },
      cost_proxy: {
        audio_seconds: Number((capturedDurationMs / 1000).toFixed(2)),
        request_count: this.requestCount,
      },
      timing: {
        inference_ms: null,
        end_to_end_ms: latencyMs,
      },
      stt: {
        confidence: safeSttConfidence,
        latency_ms: Number(sttResult?.latency_ms || 0),
        request_id: String(sttResult?.request_id || ''),
        provider: String(sttResult?.provider || ''),
      },
      uiHint: String(hintedText || '').trim() || null,
    };
  }
}

export const createOfflineAsrEngine = () => new OfflineAsrEngine();

export const requestMicrophonePermission = async () => {
  const { requestMicrophonePermission: requestPermission } = getAudioModule();
  return requestPermission();
};

export const MAX_UTTERANCE_MS = DEFAULT_MAX_UTTERANCE_MS;

export const buildAsrErrorResult = ({ reason = 'UNKNOWN', message = 'ASR failed.' } = {}) => ({
  text: '',
  tokens: [],
  confidence: 0,
  latency_ms: 0,
  ok: false,
  reason,
  message,
});

export default {
  createOfflineAsrEngine,
  requestMicrophonePermission,
  MAX_UTTERANCE_MS,
  buildAsrErrorResult,
};
