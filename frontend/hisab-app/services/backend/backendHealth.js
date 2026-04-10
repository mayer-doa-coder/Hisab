import { Platform } from 'react-native';
import Constants from 'expo-constants';

let resolvedBaseUrl = '';

const normalizeBaseUrl = (value) => {
  const next = String(value || '').trim();
  return next ? next.replace(/\/+$/, '') : '';
};

const pickExpoHost = () => {
  const candidates = [
    Constants?.expoConfig?.hostUri,
    Constants?.manifest2?.extra?.expoGo?.debuggerHost,
    Constants?.manifest?.debuggerHost,
  ];

  for (const raw of candidates) {
    const value = String(raw || '').trim();
    if (!value) {
      continue;
    }

    const host = value.split(':')[0].trim();
    if (host) {
      return host;
    }
  }

  return '';
};

const getEnvBaseUrl = () => {
  const envBase =
    typeof process !== 'undefined' && process?.env?.EXPO_PUBLIC_API_BASE_URL
      ? String(process.env.EXPO_PUBLIC_API_BASE_URL).trim()
      : '';

  return normalizeBaseUrl(envBase);
};

const getExpoLanBaseUrl = () => {
  const host = pickExpoHost();
  if (!host) {
    return '';
  }

  return normalizeBaseUrl(`http://${host}:5000`);
};

const getDefaultBaseUrl = () => {
  if (Platform.OS === 'android') {
    return normalizeBaseUrl('http://10.0.2.2:5000');
  }

  return normalizeBaseUrl('http://127.0.0.1:5000');
};

const uniqueBaseUrls = (values) => {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const normalized = normalizeBaseUrl(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
};

export const getBackendCandidateBaseUrls = () => {
  return uniqueBaseUrls([
    getEnvBaseUrl(),
    resolvedBaseUrl,
    getExpoLanBaseUrl(),
    getDefaultBaseUrl(),
  ]);
};

export const getBackendBaseUrl = () => {
  const [first] = getBackendCandidateBaseUrls();
  return first || getDefaultBaseUrl();
};

export const fetchBackendHealth = async () => {
  const candidates = getBackendCandidateBaseUrls();
  let lastErrorMessage = 'Unable to reach backend server.';

  for (const baseUrl of candidates) {
    try {
      const response = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Backend responded with ${response.status}`);
      }

      const payload = await response.json();
      resolvedBaseUrl = baseUrl;

      return {
        ok: true,
        baseUrl,
        status: payload?.status || 'ok',
        serverTime: payload?.serverTime || null,
        database: payload?.database || null,
      };
    } catch (error) {
      lastErrorMessage = error?.message || 'Unable to reach backend server.';
    }
  }

  return {
    ok: false,
    baseUrl: candidates[0] || getDefaultBaseUrl(),
    status: 'offline',
    serverTime: null,
    database: null,
    errorMessage: lastErrorMessage,
  };
};
