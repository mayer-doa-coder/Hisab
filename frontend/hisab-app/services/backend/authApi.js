import { getBackendBaseUrl } from './backendHealth';

const REQUEST_TIMEOUT_MS = 7000;

const createApiError = ({ message, status = null, code = null, isNetworkError = false }) => {
  const error = new Error(message || 'Request failed.');
  error.status = status;
  error.code = code;
  error.isNetworkError = isNetworkError;
  return error;
};

const requestJson = async ({ path, method = 'GET', body = null, accessToken = null }) => {
  const baseUrl = getBackendBaseUrl();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const headers = {
      Accept: 'application/json',
    };

    if (body !== null) {
      headers['Content-Type'] = 'application/json';
    }

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body !== null ? JSON.stringify(body) : undefined,
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
        message: payload?.message || `Request failed with status ${response.status}`,
        status: response.status,
        code: payload?.code || null,
      });
    }

    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw createApiError({
        message: 'Request timed out. Please try again.',
        isNetworkError: true,
      });
    }

    if (error?.status || error?.code || error?.isNetworkError) {
      throw error;
    }

    throw createApiError({
      message: error?.message || 'Unable to reach server.',
      isNetworkError: true,
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

export const isBackendOnline = async () => {
  try {
    await requestJson({ path: '/health', method: 'GET' });
    return true;
  } catch (error) {
    if (error?.isNetworkError) {
      return false;
    }

    return true;
  }
};

export const signupOnline = async ({ email, password }) => {
  return requestJson({
    path: '/api/auth/signup',
    method: 'POST',
    body: { email, password },
  });
};

export const loginOnline = async ({ email, password }) => {
  return requestJson({
    path: '/api/auth/login',
    method: 'POST',
    body: { email, password },
  });
};

export const refreshOnlineToken = async ({ refreshToken }) => {
  return requestJson({
    path: '/api/auth/refresh',
    method: 'POST',
    body: { refreshToken },
  });
};

export const fetchOnlineProfile = async ({ accessToken }) => {
  return requestJson({
    path: '/api/user/profile',
    method: 'GET',
    accessToken,
  });
};
