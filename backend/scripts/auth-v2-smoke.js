/* eslint-disable no-console */
const crypto = require('crypto');

const BASE_URL = String(process.env.AUTH_SMOKE_BASE_URL || 'http://127.0.0.1:5000').replace(/\/+$/, '');
const DEFAULT_TIMEOUT_MS = Number(process.env.AUTH_SMOKE_TIMEOUT_MS || 10000);

const randomSuffix = crypto.randomBytes(4).toString('hex');
const email = `authv2_${Date.now()}_${randomSuffix}@example.com`;
const initialPin = '4455';
const updatedPin = '667788';
const loginPin = '445566';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createCase = (name, fn) => ({ name, fn });

const requestJson = async ({ path, method = 'GET', body = null, accessToken = null, timeoutMs = DEFAULT_TIMEOUT_MS }) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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

    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === null ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const code = payload?.error?.code || payload?.code || null;
    const message = payload?.error?.message || payload?.message || null;

    return {
      ok: response.ok,
      status: response.status,
      payload,
      code,
      message,
    };
  } finally {
    clearTimeout(timeoutId);
  }
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const state = {
  accessToken: null,
  refreshToken: null,
  oldRefreshToken: null,
  resetToken: null,
  verificationCode: null,
};

const cases = [
  createCase('Health endpoint reachable', async () => {
    const result = await requestJson({ path: '/health' });
    assert(result.ok, `Expected /health to succeed. status=${result.status} code=${result.code}`);
  }),
  createCase('Reject invalid signup PIN', async () => {
    const result = await requestJson({
      path: '/api/auth/signup',
      method: 'POST',
      body: { email, pin: '12ab' },
    });

    assert(!result.ok, 'Expected invalid signup PIN to fail.');
    assert(result.code === 'INVALID_PIN_FORMAT', `Expected INVALID_PIN_FORMAT, got ${result.code || 'none'}`);
  }),
  createCase('Signup with valid PIN', async () => {
    const result = await requestJson({
      path: '/api/auth/signup',
      method: 'POST',
      body: { email, pin: initialPin },
    });

    assert(result.ok, `Expected signup success. status=${result.status} code=${result.code}`);
    assert(result.status === 202, `Expected 202 for verification-required signup, got ${result.status}`);
    assert(result.payload?.verificationRequired === true, 'Expected verificationRequired=true on signup.');
    state.verificationCode = String(result.payload?.verificationCode || '');
  }),
  createCase('Handle duplicate signup for unverified account', async () => {
    const result = await requestJson({
      path: '/api/auth/signup',
      method: 'POST',
      body: { email, pin: initialPin },
    });

    assert(!result.ok, 'Expected duplicate signup to fail.');
    assert(
      result.code === 'OTP_REQUEST_RATE_LIMITED' || result.code === 'EMAIL_ALREADY_EXISTS',
      `Expected OTP_REQUEST_RATE_LIMITED or EMAIL_ALREADY_EXISTS, got ${result.code || 'none'}`
    );
  }),
  createCase('Reject login with invalid PIN', async () => {
    const result = await requestJson({
      path: '/api/auth/login',
      method: 'POST',
      body: { email, pin: '1111' },
    });

    assert(!result.ok, 'Expected invalid PIN login to fail.');
    assert(
      result.code === 'INVALID_PIN' || result.code === 'EMAIL_NOT_VERIFIED',
      `Expected INVALID_PIN or EMAIL_NOT_VERIFIED, got ${result.code || 'none'}`
    );
  }),
  createCase('Reject login before email verification', async () => {
    const result = await requestJson({
      path: '/api/auth/login',
      method: 'POST',
      body: { email, pin: initialPin },
    });

    assert(!result.ok, 'Expected unverified login to fail.');
    assert(result.code === 'EMAIL_NOT_VERIFIED', `Expected EMAIL_NOT_VERIFIED, got ${result.code || 'none'}`);
    if (!state.verificationCode) {
      state.verificationCode = String(result.payload?.error?.details?.verificationCode || '');
    }
  }),
  createCase('Reject email verification with wrong code', async () => {
    const result = await requestJson({
      path: '/api/auth/verify-email/confirm',
      method: 'POST',
      body: {
        email,
        verificationCode: '000000',
      },
    });

    assert(!result.ok, 'Expected wrong verification code to fail.');
    assert(result.code === 'INVALID_VERIFICATION_CODE', `Expected INVALID_VERIFICATION_CODE, got ${result.code || 'none'}`);
  }),
  createCase('Verify email code and login', async () => {
    assert(state.verificationCode, 'Missing verification code from signup/login response.');

    const result = await requestJson({
      path: '/api/auth/verify-email/confirm',
      method: 'POST',
      body: {
        email,
        verificationCode: state.verificationCode,
      },
    });

    assert(result.ok, `Expected email verification success. status=${result.status} code=${result.code}`);
    assert(result.payload?.accessToken, 'Verification did not return accessToken.');
    assert(result.payload?.refreshToken, 'Verification did not return refreshToken.');
    state.accessToken = result.payload?.accessToken || null;
    state.refreshToken = result.payload?.refreshToken || null;
  }),
  createCase('Reject verification code reuse after verification', async () => {
    const result = await requestJson({
      path: '/api/auth/verify-email/confirm',
      method: 'POST',
      body: {
        email,
        verificationCode: state.verificationCode,
      },
    });

    assert(!result.ok, 'Expected verification code reuse to fail.');
    assert(result.code === 'EMAIL_ALREADY_VERIFIED', `Expected EMAIL_ALREADY_VERIFIED, got ${result.code || 'none'}`);
  }),
  createCase('Login with valid PIN', async () => {
    const result = await requestJson({
      path: '/api/auth/login',
      method: 'POST',
      body: { email, pin: initialPin },
    });

    assert(result.ok, `Expected login success. status=${result.status} code=${result.code}`);
    state.accessToken = result.payload?.accessToken || null;
    state.refreshToken = result.payload?.refreshToken || null;
    assert(state.accessToken, 'Login did not return accessToken.');
    assert(state.refreshToken, 'Login did not return refreshToken.');
  }),
  createCase('Setup PIN for quick login', async () => {
    const result = await requestJson({
      path: '/api/auth/pin/setup',
      method: 'POST',
      accessToken: state.accessToken,
      body: {
        pin: loginPin,
        trustDevice: true,
        deviceId: 'smoke-device-1',
      },
    });

    assert(result.ok, `Expected PIN setup success. status=${result.status} code=${result.code}`);
  }),
  createCase('Reject PIN login with wrong PIN', async () => {
    const result = await requestJson({
      path: '/api/auth/pin/login',
      method: 'POST',
      body: {
        email,
        pin: '111111',
        deviceId: 'smoke-device-1',
      },
    });

    assert(!result.ok, 'Expected wrong PIN login to fail.');
    assert(result.code === 'INVALID_PIN', `Expected INVALID_PIN, got ${result.code || 'none'}`);
  }),
  createCase('PIN login succeeds on trusted device', async () => {
    const result = await requestJson({
      path: '/api/auth/pin/login',
      method: 'POST',
      body: {
        email,
        pin: loginPin,
        deviceId: 'smoke-device-1',
      },
    });

    assert(result.ok, `Expected PIN login success. status=${result.status} code=${result.code}`);
    state.accessToken = result.payload?.accessToken || state.accessToken;
    state.refreshToken = result.payload?.refreshToken || state.refreshToken;
  }),
  createCase('Reject PIN login from untrusted device', async () => {
    const result = await requestJson({
      path: '/api/auth/pin/login',
      method: 'POST',
      body: {
        email,
        pin: loginPin,
        deviceId: 'smoke-device-2',
      },
    });

    assert(!result.ok, 'Expected untrusted device PIN login to fail.');
    assert(result.code === 'PIN_DEVICE_NOT_TRUSTED', `Expected PIN_DEVICE_NOT_TRUSTED, got ${result.code || 'none'}`);
  }),
  createCase('Fetch profile using access token', async () => {
    const result = await requestJson({
      path: '/api/user/profile',
      method: 'GET',
      accessToken: state.accessToken,
    });

    assert(result.ok, `Expected profile success. status=${result.status} code=${result.code}`);
    assert(String(result.payload?.user?.email || '').toLowerCase() === email, 'Profile email does not match created user.');
  }),
  createCase('Reject profile request without access token', async () => {
    const result = await requestJson({
      path: '/api/user/profile',
      method: 'GET',
    });

    assert(!result.ok, 'Expected missing access token to fail.');
    assert(result.code === 'MISSING_ACCESS_TOKEN', `Expected MISSING_ACCESS_TOKEN, got ${result.code || 'none'}`);
  }),
  createCase('Reject tampered access token', async () => {
    const accessToken = String(state.accessToken || '');
    const tamperedAccessToken = accessToken ? `${accessToken.slice(0, -1)}x` : 'invalid.token.value';

    const result = await requestJson({
      path: '/api/user/profile',
      method: 'GET',
      accessToken: tamperedAccessToken,
    });

    assert(!result.ok, 'Expected tampered access token to fail.');
    assert(result.code === 'INVALID_ACCESS_TOKEN', `Expected INVALID_ACCESS_TOKEN, got ${result.code || 'none'}`);
  }),
  createCase('Reject malformed refresh token', async () => {
    const result = await requestJson({
      path: '/api/auth/refresh',
      method: 'POST',
      body: { refreshToken: 'malformed-refresh-token' },
    });

    assert(!result.ok, 'Expected malformed refresh token to fail.');
    assert(result.code === 'INVALID_REFRESH_TOKEN', `Expected INVALID_REFRESH_TOKEN, got ${result.code || 'none'}`);
  }),
  createCase('Refresh token rotation succeeds', async () => {
    const result = await requestJson({
      path: '/api/auth/refresh',
      method: 'POST',
      body: { refreshToken: state.refreshToken },
    });

    assert(result.ok, `Expected refresh success. status=${result.status} code=${result.code}`);
    assert(result.payload?.refreshToken, 'Refresh did not return a next refresh token.');

    state.oldRefreshToken = state.refreshToken;
    state.refreshToken = result.payload.refreshToken;
    state.accessToken = result.payload.accessToken || state.accessToken;
  }),
  createCase('Detect refresh-token reuse on old token', async () => {
    const result = await requestJson({
      path: '/api/auth/refresh',
      method: 'POST',
      body: { refreshToken: state.oldRefreshToken },
    });

    assert(!result.ok, 'Expected old refresh token reuse to fail.');
    assert(result.code === 'REFRESH_TOKEN_REUSE_DETECTED', `Expected REFRESH_TOKEN_REUSE_DETECTED, got ${result.code || 'none'}`);
  }),
  createCase('New refresh token revoked after reuse detection', async () => {
    const result = await requestJson({
      path: '/api/auth/refresh',
      method: 'POST',
      body: { refreshToken: state.refreshToken },
    });

    assert(!result.ok, 'Expected latest refresh token to be revoked after reuse detection.');
    assert(
      result.code === 'REFRESH_TOKEN_REUSE_DETECTED' || result.code === 'INVALID_REFRESH_TOKEN',
      `Expected refresh revocation error, got ${result.code || 'none'}`
    );
  }),
  createCase('PIN recovery request accepted', async () => {
    const result = await requestJson({
      path: '/api/auth/recover/request-pin',
      method: 'POST',
      body: { email },
    });

    assert(result.ok, `Expected recovery request success. status=${result.status} code=${result.code}`);
    if (result.payload?.resetToken) {
      state.resetToken = String(result.payload.resetToken);
    }
  }),
  createCase('Reject PIN reset with invalid token', async () => {
    const result = await requestJson({
      path: '/api/auth/recover/reset-pin',
      method: 'POST',
      body: {
        resetToken: 'invalid-token',
        newPin: '2233',
      },
    });

    assert(!result.ok, 'Expected invalid reset token to fail.');
    assert(result.code === 'INVALID_RESET_TOKEN', `Expected INVALID_RESET_TOKEN, got ${result.code || 'none'}`);
  }),
  createCase('Reset PIN with valid token (non-production only)', async () => {
    if (!state.resetToken) {
      console.log('SKIP: No reset token returned by backend (likely production mode).');
      return;
    }

    const result = await requestJson({
      path: '/api/auth/recover/reset-pin',
      method: 'POST',
      body: {
        resetToken: state.resetToken,
        newPin: updatedPin,
      },
    });

    assert(result.ok, `Expected reset PIN success. status=${result.status} code=${result.code}`);
  }),
  createCase('Login with updated PIN', async () => {
    if (!state.resetToken) {
      console.log('SKIP: Updated-PIN login skipped because reset token was unavailable.');
      return;
    }

    const result = await requestJson({
      path: '/api/auth/login',
      method: 'POST',
      body: { email, pin: updatedPin },
    });

    assert(result.ok, `Expected login with updated PIN to succeed. status=${result.status} code=${result.code}`);
    state.accessToken = result.payload?.accessToken || state.accessToken;
    state.refreshToken = result.payload?.refreshToken || state.refreshToken;
  }),
  createCase('Update PIN endpoint rejects bad current PIN', async () => {
    if (!state.accessToken) {
      console.log('SKIP: Update PIN tests skipped due to missing access token.');
      return;
    }

    const result = await requestJson({
      path: '/api/auth/update-pin',
      method: 'POST',
      accessToken: state.accessToken,
      body: {
        currentPin: '1122',
        newPin: '3344',
      },
    });

    assert(!result.ok, 'Expected update-pin with wrong current PIN to fail.');
    assert(result.code === 'CURRENT_PIN_INCORRECT', `Expected CURRENT_PIN_INCORRECT, got ${result.code || 'none'}`);
  }),
  createCase('Logout succeeds with refresh token', async () => {
    if (!state.refreshToken) {
      console.log('SKIP: Logout check skipped due to missing refresh token.');
      return;
    }

    const result = await requestJson({
      path: '/api/auth/logout',
      method: 'POST',
      body: { refreshToken: state.refreshToken },
    });

    assert(result.ok, `Expected logout success. status=${result.status} code=${result.code}`);
  }),
];

const main = async () => {
  console.log(`Running Auth v2 smoke matrix against ${BASE_URL}`);
  console.log(`Test user email: ${email}`);

  const failures = [];

  for (const testCase of cases) {
    const startedAt = Date.now();
    process.stdout.write(`- ${testCase.name} ... `);

    try {
      await testCase.fn();
      const elapsed = Date.now() - startedAt;
      console.log(`PASS (${elapsed}ms)`);
    } catch (error) {
      const elapsed = Date.now() - startedAt;
      console.log(`FAIL (${elapsed}ms)`);
      console.log(`  Reason: ${error?.message || error}`);
      failures.push({
        name: testCase.name,
        message: error?.message || String(error),
      });

      // Small delay to keep logs readable on consecutive failures.
      await delay(50);
    }
  }

  console.log('');
  if (!failures.length) {
    console.log('Auth v2 smoke matrix: PASS');
    process.exit(0);
  }

  console.log(`Auth v2 smoke matrix: FAIL (${failures.length} failing case(s))`);
  for (const failure of failures) {
    console.log(`- ${failure.name}: ${failure.message}`);
  }

  process.exit(1);
};

main().catch((error) => {
  console.error(`Fatal smoke script error: ${error?.message || error}`);
  process.exit(1);
});
