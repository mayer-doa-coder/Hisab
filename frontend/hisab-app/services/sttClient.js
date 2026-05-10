import { getBackendBaseUrl, getBackendCandidateBaseUrls } from './backend/backendHealth';
import { createApiError } from './backend/httpClient';
import * as FileSystem from 'expo-file-system/legacy';

const DEFAULT_STT_PATH = '/api/stt/transcribe';
const STT_UPLOAD_CACHE_DIR = `${FileSystem.cacheDirectory || ''}stt-upload-cache/`;
const STT_MAX_CACHE_FILES = 25;

const getFileExtension = (audioUri) => {
  const tail = String(audioUri || '').trim().split('/').pop() || '';
  const dotIndex = tail.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === tail.length - 1) {
    return 'wav';
  }
  return tail.slice(dotIndex + 1).toLowerCase();
};

const ensureSttCacheDir = async () => {
  if (!STT_UPLOAD_CACHE_DIR) {
    return false;
  }

  try {
    await FileSystem.makeDirectoryAsync(STT_UPLOAD_CACHE_DIR, { intermediates: true });
    return true;
  } catch {
    return false;
  }
};

const trimSttCache = async () => {
  if (!STT_UPLOAD_CACHE_DIR) {
    return;
  }

  try {
    const files = await FileSystem.readDirectoryAsync(STT_UPLOAD_CACHE_DIR);
    if (!Array.isArray(files) || files.length <= STT_MAX_CACHE_FILES) {
      return;
    }

    const infos = await Promise.all(
      files.map(async (name) => {
        const uri = `${STT_UPLOAD_CACHE_DIR}${name}`;
        const info = await FileSystem.getInfoAsync(uri);
        return {
          uri,
          exists: Boolean(info?.exists),
          modified: Number(info?.modificationTime || 0),
        };
      })
    );

    const toDelete = infos
      .filter((entry) => entry.exists)
      .sort((a, b) => a.modified - b.modified)
      .slice(0, Math.max(0, infos.length - STT_MAX_CACHE_FILES));

    await Promise.all(
      toDelete.map((entry) => FileSystem.deleteAsync(entry.uri, { idempotent: true }))
    );
  } catch {
    // Best effort only; caching should not block STT upload.
  }
};

const stageAudioInCache = async (audioUri) => {
  const sourceUri = String(audioUri || '').trim();
  if (!sourceUri) {
    return sourceUri;
  }

  const canCache = await ensureSttCacheDir();
  if (!canCache) {
    return sourceUri;
  }

  const extension = getFileExtension(sourceUri);
  const cachedUri = `${STT_UPLOAD_CACHE_DIR}stt-${Date.now()}-${Math.floor(Math.random() * 1000000)}.${extension}`;

  try {
    await FileSystem.copyAsync({ from: sourceUri, to: cachedUri });
    void trimSttCache();
    return cachedUri;
  } catch {
    return sourceUri;
  }
};

const inferMimeType = (audioUri) => {
  const value = String(audioUri || '').toLowerCase();
  if (value.endsWith('.wav')) {
    return 'audio/wav';
  }
  if (value.endsWith('.mp3')) {
    return 'audio/mpeg';
  }
  if (value.endsWith('.m4a')) {
    return 'audio/mp4';
  }
  if (value.endsWith('.aac')) {
    return 'audio/aac';
  }
  if (value.endsWith('.ogg')) {
    return 'audio/ogg';
  }
  if (value.endsWith('.caf')) {
    return 'audio/x-caf';
  }
  return 'audio/wav';
};

const safeFileNameFromUri = (audioUri) => {
  const uri = String(audioUri || '').trim();
  if (!uri) {
    return 'voice-input.wav';
  }

  const tail = uri.split('/').pop() || '';
  return tail || 'voice-input.wav';
};

const normalizeConfidence = (value) => {
  const x = Number(value);
  if (!Number.isFinite(x)) {
    return 0;
  }
  return Math.max(0, Math.min(1, x));
};

export const transcribeAudio = async (audioUri, {
  accessToken = null,
  locale = 'bn-BD',
  hints = [],
  fsmState = '',
  endpointPath = DEFAULT_STT_PATH,
  timeoutMs = 15000,
} = {}) => {
  const normalizedUri = String(audioUri || '').trim();
  if (!normalizedUri) {
    throw createApiError({
      code: 'AUDIO_URI_MISSING',
      message: 'Recorded audio URI is required.',
    });
  }

  const baseCandidates = [
    getBackendBaseUrl(),
    ...getBackendCandidateBaseUrls(),
  ].filter((value, index, arr) => Boolean(value) && arr.indexOf(value) === index);

  const baseUrls = baseCandidates.length > 0 ? baseCandidates : [getBackendBaseUrl()];
  const uploadUri = await stageAudioInCache(normalizedUri);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const formData = new FormData();
    formData.append('audio', {
      uri: uploadUri,
      name: safeFileNameFromUri(uploadUri),
      type: inferMimeType(uploadUri),
    });
    formData.append('locale', String(locale || 'bn-BD'));
    formData.append('hints', JSON.stringify(Array.isArray(hints) ? hints : []));
    formData.append('fsmState', String(fsmState || '').trim().toUpperCase());

    const headers = {
      Accept: 'application/json',
    };

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    let lastTransportError = null;
    for (let index = 0; index < baseUrls.length; index += 1) {
      const baseUrl = baseUrls[index];

      try {
        const response = await fetch(`${baseUrl}${endpointPath}`, {
          method: 'POST',
          headers,
          body: formData,
          signal: controller.signal,
        });

        let payload = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        if (!response.ok) {
          throw createApiError({
            status: response.status,
            code: payload?.error?.code || payload?.code || 'STT_REQUEST_FAILED',
            message: payload?.error?.message || payload?.message || 'STT request failed.',
            details: payload?.error?.details || payload?.details || null,
          });
        }

        const data = payload?.data || payload || {};
        return {
          text: String(data?.text || '').trim(),
          confidence: normalizeConfidence(data?.confidence),
          latency_ms: Number(data?.latency_ms || 0),
          request_id: String(data?.request_id || ''),
          provider: String(data?.provider || ''),
        };
      } catch (error) {
        const isAbort = String(error?.name || '') === 'AbortError';
        const isTransportError = isAbort || (!error?.status && !error?.code && !error?.isNetworkError);
        const canTryNext = index < baseUrls.length - 1;

        if (isTransportError && canTryNext) {
          lastTransportError = error;
          continue;
        }

        throw error;
      }
    }

    throw lastTransportError || createApiError({
      code: 'STT_NETWORK_FAILURE',
      message: 'Unable to reach STT endpoint.',
      isNetworkError: true,
    });
  } catch (error) {
    if (String(error?.name || '') === 'AbortError') {
      throw createApiError({
        code: 'STT_TIMEOUT',
        message: 'STT request timed out. Please retry.',
        isNetworkError: true,
      });
    }

    if (error?.status || error?.code || error?.isNetworkError) {
      throw error;
    }

    throw createApiError({
      code: 'STT_NETWORK_FAILURE',
      message: error?.message || 'Unable to reach STT endpoint.',
      isNetworkError: true,
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

export default {
  transcribeAudio,
};
