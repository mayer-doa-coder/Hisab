import { Platform } from 'react-native';

const getDefaultBaseUrl = () => {
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:5000';
  }

  return 'http://127.0.0.1:5000';
};

export const getBackendBaseUrl = () => {
  const envBase =
    typeof process !== 'undefined' && process?.env?.EXPO_PUBLIC_API_BASE_URL
      ? String(process.env.EXPO_PUBLIC_API_BASE_URL).trim()
      : '';

  return envBase || getDefaultBaseUrl();
};

export const fetchBackendHealth = async () => {
  const baseUrl = getBackendBaseUrl();

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

    return {
      ok: true,
      baseUrl,
      status: payload?.status || 'ok',
      serverTime: payload?.serverTime || null,
      database: payload?.database || null,
    };
  } catch (error) {
    return {
      ok: false,
      baseUrl,
      status: 'offline',
      serverTime: null,
      database: null,
      errorMessage: error?.message || 'Unable to reach backend server.',
    };
  }
};
