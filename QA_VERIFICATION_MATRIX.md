# Pre-Release Verification Matrix (March 26, 2026)

## Execution Summary

- Backend static/syntax checks: ✅ Passed
- Backend dependency health: ✅ Passed
- Frontend lint regression: ⚠️ Passed with 2 warnings (no errors)
- Workspace compile/problem scan: ✅ No compile/runtime build errors detected by diagnostics

## A) Auth

| Test Case | Type | Status | Notes |
|---|---|---:|---|
| Signup flow (local + server sync) | Manual | ⏳ Pending | Requires app/device runtime and backend env (`MONGO_URI`, JWT secrets). |
| Login flow (offline/online hybrid) | Manual | ⏳ Pending | Validate fallback behavior and invalid credential errors. |
| Logout flow (session clear + token revoke) | Manual | ⏳ Pending | Validate frontend logout + backend revoke endpoint. |
| Access token expiry handling | Manual | ⏳ Pending | Confirm 401 + auto-refresh path + forced logout on refresh fail. |
| Refresh token rotation | Manual/API | ⏳ Pending | Ensure old refresh token rejected after refresh. |
| Account lockout after failed attempts | Manual/API | ⏳ Pending | Verify lock window and reset counter on successful login. |
| Rate limiting for auth routes | API | ⏳ Pending | Verify 429 behavior and `Retry-After`. |
| Password recovery request/reset | API/Manual | ⏳ Pending | Validate token expiry, reset success, and post-reset login. |

## B) Product Module

| Test Case | Type | Status | Notes |
|---|---|---:|---|
| Add product | Manual | ⏳ Pending | Confirm user-scoped creation with audit event. |
| Edit product | Manual | ⏳ Pending | Confirm calculations and ownership scope. |
| Delete product | Manual | ⏳ Pending | Confirm deletion + audit log. |
| Stock movement updates | Manual | ⏳ Pending | Confirm quantity before/after and audit. |
| Low stock alerts | Manual | ⏳ Pending | Validate thresholds and sorting. |
| Expiry/expiring alerts | Manual | ⏳ Pending | Validate date handling. |

## C) Customer Module

| Test Case | Type | Status | Notes |
|---|---|---:|---|
| Add/Edit/Delete customer | Manual | ⏳ Pending | Verify user ownership scope and audit coverage. |
| Search/filter/sort | Manual | ⏳ Pending | Verify no cross-user leakage. |
| Archive flow | Manual | ⏳ Pending | No dedicated archive implementation identified; verify expected behavior. |

## D) Baki / Ledger

| Test Case | Type | Status | Notes |
|---|---|---:|---|
| Add credit | Manual | ⏳ Pending | Verify due updates + audit event. |
| Partial payment | Manual | ⏳ Pending | Verify overpayment blocking and audit event. |
| Ledger accuracy | Manual | ⏳ Pending | Verify running due and transaction order. |
| Aging buckets | Manual | ⏳ Pending | Validate if implemented in current UI/data layer. |
| Reminder list | Manual | ⏳ Pending | Validate if implemented in current UI/data layer. |

## E) Dashboard

| Test Case | Type | Status | Notes |
|---|---|---:|---|
| KPI correctness | Manual | ⏳ Pending | Verify against known fixture data. |
| Date filters (daily/weekly/monthly) | Manual | ⏳ Pending | Validate filter recomputation and cards/lists. |

## Regression Results Executed

### 1) Frontend Lint (Executed)
- Command: `npm run lint` (frontend)
- Result: ✅ No errors, ⚠️ 2 warnings
- Warnings:
  - `SALES_AGGREGATION_DAILY_SQL` unused
  - `SALES_AGGREGATION_SUMMARY_SQL` unused

### 2) Backend Syntax Checks (Executed)
- Command: `node --check` for index/controllers/middleware/routes/models
- Result: ✅ Passed

### 3) Backend Dependency Integrity (Executed)
- Command: `npm ls --depth=0`
- Result: ✅ Passed

### 4) Workspace Problem Scan (Executed)
- Result: ✅ No reported compile errors

## Edge Case Checklist

| Scenario | Status | Notes |
|---|---:|---|
| Empty data startup | ⏳ Pending | Validate no crash + empty states visible. |
| Large datasets | ⏳ Pending | Validate list performance and dashboard query responsiveness. |
| Invalid inputs | ⏳ Pending | Validate error messages and no crash. |
| Offline mode | ⏳ Pending | Validate local session fallback and deferred sync queue behavior. |
| Token expiry scenarios | ⏳ Pending | Validate refresh success/failure and forced logout behavior. |

## Bug Fix Loop Status

- Critical issues fixed this run:
  - Ownership migration crash (`user_id` index timing) fixed.
  - Hybrid login fallback path improved to avoid false invalid-credential lockout.
- Re-validated via lint/syntax checks: ✅

## Pre-Release Checklist

| Item | Status |
|---|---:|
| No crashes (static checks) | ✅ |
| Correct calculations (manual KPI/ledger verification) | ⏳ Pending manual test |
| Secure auth flow (rate limit + lockout + token rotation + recovery) | ✅ Implemented, ⏳ runtime validation pending |
| Clean UI/UX | ⏳ Pending manual walkthrough |

## Recommended Final Gate Before Rollout

1. Run backend with real env values and execute API smoke suite.
2. Run full manual checklist on Android device (online + offline toggles).
3. Validate token expiry/refresh by shortening token TTL in staging.
4. Confirm no cross-user data visibility with at least 2 accounts.
