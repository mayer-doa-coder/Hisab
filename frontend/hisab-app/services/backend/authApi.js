import { fetchBackendHealth, getBackendBaseUrl } from './backendHealth';

const REQUEST_TIMEOUT_MS = 7000;

const pickErrorMessage = (payload, status) => {
  return (
    payload?.error?.message
    || payload?.message
    || `Request failed with status ${status}`
  );
};

const pickErrorCode = (payload) => payload?.error?.code || payload?.code || null;
const pickErrorDetails = (payload) => payload?.error?.details || payload?.details || null;

const createApiError = ({ message, status = null, code = null, details = null, isNetworkError = false }) => {
  const error = new Error(message || 'Request failed.');
  error.status = status;
  error.code = code;
  error.details = details;
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
        message: pickErrorMessage(payload, response.status),
        status: response.status,
        code: pickErrorCode(payload),
        details: pickErrorDetails(payload),
      });
    }

    return payload?.data || payload;
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
  const health = await fetchBackendHealth();
  return Boolean(health?.ok);
};

export const signupOnline = async ({ email, pin, rememberMe = false }) => {
  return requestJson({
    path: '/api/auth/signup',
    method: 'POST',
    body: { email, pin, rememberMe },
  });
};

export const loginOnline = async ({ email, pin, deviceId = null, rememberMe = false }) => {
  return requestJson({
    path: '/api/auth/login',
    method: 'POST',
    body: { email, pin, deviceId, rememberMe },
  });
};

export const loginWithPinOnline = async ({ email, pin, deviceId, rememberMe = true }) => {
  return requestJson({
    path: '/api/auth/pin/login',
    method: 'POST',
    body: { email, pin, deviceId, rememberMe },
  });
};

export const setupPinOnline = async ({ accessToken, pin, deviceId, trustDevice = true }) => {
  return requestJson({
    path: '/api/auth/pin/setup',
    method: 'POST',
    body: { pin, deviceId, trustDevice },
    accessToken,
  });
};

export const requestEmailVerificationOnline = async ({ email }) => {
  return requestJson({
    path: '/api/auth/verify-email/request',
    method: 'POST',
    body: { email },
  });
};

export const verifyEmailCodeOnline = async ({ email, verificationCode, rememberMe = false }) => {
  return requestJson({
    path: '/api/auth/verify-email/confirm',
    method: 'POST',
    body: { email, verificationCode, rememberMe },
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

export const requestPinRecoveryOnline = async ({ email }) => {
  return requestJson({
    path: '/api/auth/recover/request-pin',
    method: 'POST',
    body: { email },
  });
};

export const resetPinOnline = async ({ resetToken, newPin }) => {
  return requestJson({
    path: '/api/auth/recover/reset-pin',
    method: 'POST',
    body: { resetToken, newPin },
  });
};

export const updatePinOnline = async ({ accessToken, currentPin, newPin }) => {
  return requestJson({
    path: '/api/auth/update-pin',
    method: 'POST',
    body: { currentPin, newPin },
    accessToken,
  });
};

export const requestPasswordRecoveryOnline = async ({ email }) => requestPinRecoveryOnline({ email });
export const resetPasswordOnline = async ({ resetToken, newPassword }) => resetPinOnline({ resetToken, newPin: newPassword });
export const updatePasswordOnline = async ({ accessToken, currentPassword, newPassword }) => updatePinOnline({ accessToken, currentPin: currentPassword, newPin: newPassword });

export const logoutOnline = async ({ refreshToken }) => {
  return requestJson({
    path: '/api/auth/logout',
    method: 'POST',
    body: { refreshToken },
  });
};
