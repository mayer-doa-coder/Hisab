# Hisab Auth System Recheck Report

Date: 2026-04-10
Scope: Full auth and authz re-audit, refactor, stabilization, and UX simplification

## 1. Audit Report

### Issues Found

1. Signup auto-authenticated users without email verification gate.
2. No OTP/email verification lifecycle (generation, expiry, resend cooldown, one-time use enforcement).
3. No PIN-based login path for low-typing users.
4. No trusted-device PIN restriction.
5. Frontend had no dedicated verify-email and PIN-first login screens.
6. API client did not preserve structured error details (`error.details`) needed for guided UX.
7. Local DB still carried legacy migration complexity from password-era local auth (schema-level legacy compatibility path persisted).

### Fixes Applied

1. Added email verification OTP flow on backend:
   - `POST /api/auth/verify-email/request`
   - `POST /api/auth/verify-email/confirm`
   - Signup now returns `202 verificationRequired` instead of direct auth tokens.
   - Login blocks unverified accounts with clear `EMAIL_NOT_VERIFIED` contract.
2. Added OTP security controls:
   - OTP code hash storage, expiry window, resend cooldown, single-use invalidation.
   - Security events for OTP issuance and verification outcomes.
3. Added PIN auth backend:
   - `POST /api/auth/pin/setup` (authenticated)
   - `POST /api/auth/pin/login`
   - PIN is bcrypt-hashed server-side.
   - Failed PIN attempt tracking and temporary lock.
   - Trusted-device PIN enforcement via hashed device ID.
4. Added frontend OTP/PIN UX:
   - `VerifyEmailScreen`, `PinLoginScreen`, `SetupPinScreen`.
   - Login now routes to verify-email flow when required.
   - Dashboard exposes PIN setup/change action.
5. Updated AuthContext state machine:
   - New actions for `requestEmailVerification`, `verifyEmailCode`, `loginWithPin`, `setupPin`.
   - Added local device-auth profile tracking (preferred email + trusted device id + pin-enabled flag).
6. Updated auth API layer:
   - Preserves `error.details` from backend responses.
   - Added verification and PIN endpoints.
7. Extended smoke coverage:
   - New positive and negative tests for verify-email and PIN auth paths.

## 2. Updated Architecture (Text Flow)

### Password + Verification + Session

1. Signup (`email`, `password`) -> user created/updated in unverified state -> OTP issued.
2. Verify Email (`email`, `verificationCode`) -> code hash checked, expiry checked, one-time use enforced -> account verified -> tokens issued.
3. Login (`email`, `password`) -> account lock check + password check + verified check -> tokens issued.
4. Refresh (`refreshToken`) -> rotation + reuse detection + token family revoke-on-reuse.
5. Logout (`refreshToken`) -> token revoked + user refresh state cleared.

### PIN Login

1. Authenticated user sets PIN (`pin`, `deviceId`, `trustDevice`) -> bcrypt hash stored, trusted-device hash stored.
2. Future login with PIN (`email`, `pin`, `deviceId`) -> lock check + trusted-device check + hash verify -> tokens issued.
3. Failed PIN attempts increment; lock activates after threshold.

### Security Side Controls

1. Route-level rate limiting for login, refresh, recovery, verification request/confirm, and PIN login/setup.
2. Security event audit records for high-risk and auth lifecycle events.
3. Periodic retention cleanup removes expired/revoked token records and old security events.

## 3. Improved Code Structure

### Backend

- `backend/controllers/authController.js`
  - Unified auth error envelope for all auth endpoints.
  - Added OTP + PIN handlers and stronger flow transitions.
- `backend/routes/authRoutes.js`
  - Added verification and PIN routes with dedicated limiters.
- `backend/models/User.js`
  - Added verification and PIN fields.
- `backend/middleware/authMiddleware.js`
  - Includes verification/PIN-related profile fields for user context.
- `backend/scripts/auth-v2-smoke.js`
  - Expanded test matrix for verification + PIN scenarios.

### Frontend

- `frontend/hisab-app/context/AuthContext.js`
  - Unified online auth orchestration for password + verification + PIN.
- `frontend/hisab-app/services/backend/authApi.js`
  - Added missing endpoints and structured error detail passthrough.
- `frontend/hisab-app/database/db.js`
  - Added `auth_device_profile` table for trusted device id + preferred email + local PIN readiness flag.
- New screens:
  - `frontend/hisab-app/screens/auth/VerifyEmailScreen.js`
  - `frontend/hisab-app/screens/auth/PinLoginScreen.js`
  - `frontend/hisab-app/screens/auth/SetupPinScreen.js`

## 4. PIN Login Implementation Details

1. PIN format policy: 4 to 6 digits.
2. PIN storage: bcrypt hash in backend user record (`pinHash`).
3. Lockout policy:
   - failed attempts tracked (`failedPinAttempts`)
   - temporary lock (`pinLockUntil`) after threshold.
4. Trusted device policy:
   - device id hashed (`trustedDeviceIdHash`)
   - PIN login denied on mismatch device.
5. Password update/reset invalidates PIN setup:
   - pin hash + trusted device + pin lock state cleared.

## 5. Removed Legacy Files

No physical file deletions were applied in this pass to avoid accidental feature regressions in unknown runtime paths.

Legacy logic cleanup applied instead:
1. Local credential-era behavior has been retired in active auth flow.
2. `users` table legacy credential columns are migrated away via runtime migration path in `db.js`.

## 6. UX Improvements Summary

1. Added direct, simple verify-email flow from signup/login without forcing users to guess next steps.
2. Added PIN-first quick login path to reduce typing burden.
3. Added preferred-email prefill and trusted-device storage for smoother repeat login.
4. Improved plain-language feedback examples:
   - Wrong PIN
   - Code expired
   - Session expired
   - Login successful
5. Added visible session state feedback card on login and dashboard.
6. Added one-tap access to setup/change PIN from dashboard.

## 7. Final Verification Checklist

### Positive Scenarios

- [x] Signup -> verification required response
- [x] Verify email code -> authenticated session issued
- [x] Login with password after verification
- [x] Login -> set PIN -> login via PIN on trusted device
- [x] Remember me passed through login/verify/PIN paths
- [x] Forgot password -> reset -> login flow

### Negative Scenarios

- [x] Wrong password rejected
- [x] Wrong verification code rejected
- [x] Verification code reuse rejected
- [x] Missing access token rejected on protected endpoint
- [x] Tampered access token rejected
- [x] Malformed refresh token rejected
- [x] Refresh reuse detection triggered correctly
- [x] Wrong PIN rejected
- [x] Untrusted-device PIN login rejected

### Security Controls

- [x] Password hashing: bcrypt
- [x] PIN hashing: bcrypt
- [x] No plaintext password/PIN persisted on frontend
- [x] OTP single-use and expiry enforcement
- [x] Auth route rate limits (login, OTP, PIN, recovery, refresh)
- [x] Protected route auth middleware in place
- [x] v1 ownership scoping via `userId` filtering verified across controllers

### Validation Commands

- Frontend lint: PASS (`npm run lint` in `frontend/hisab-app`)
- Backend smoke matrix: PASS (`npm run smoke:auth` in `backend`)

## Final Outcome

Auth system now enforces verification-first identity, provides secure PIN-based quick login, preserves robust token lifecycle protection, and delivers lower-friction UX for low digital literacy users while maintaining production-grade security posture.
