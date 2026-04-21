import { Platform } from 'react-native';
import Constants from 'expo-constants';

let resolvedBaseUrl = '';
const HEALTH_REQUEST_TIMEOUT_MS = 3500;

const normalizeBaseUrl = (value) => {
  const next = String(value || '').trim();
  return next ? next.replace(/\/+$/, '') : '';
};

const isPrivateIpv4Host = (host) => {
  const value = String(host || '').trim();
  const match = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) {
    return false;
  }

  const octets = match.slice(1).map((part) => Number(part));
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  // RFC1918 LAN ranges plus loopback-like fallback used by emulators.
  if (octets[0] === 10) {
    return true;
  }

  if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) {
    return true;
  }

  if (octets[0] === 192 && octets[1] === 168) {
    return true;
  }

  if (octets[0] === 127) {
    return true;
  }

  return false;
};

const canUseExpoHostForBackend = (host) => {
  const normalizedHost = String(host || '').trim().toLowerCase();
  if (!normalizedHost) {
    return false;
  }

  if (normalizedHost === 'localhost') {
    return true;
  }

  return isPrivateIpv4Host(normalizedHost);
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = HEALTH_REQUEST_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
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
  if (!canUseExpoHostForBackend(host)) {
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
      const response = await fetchWithTimeout(`${baseUrl}/health`, {
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
      if (String(error?.name || '') === 'AbortError') {
        lastErrorMessage = 'Backend health check timed out.';
      } else {
        lastErrorMessage = error?.message || 'Unable to reach backend server.';
      }
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
