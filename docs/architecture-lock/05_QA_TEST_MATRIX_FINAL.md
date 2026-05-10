# Hisab QA/Test Matrix (Finalized)

Version: 1.0 (Architecture Lock)
Date: 2026-04-10
Scope: Functional, edge, offline, sync conflict, and basic voice validation

Pass/Fail convention:
- Pass only when expected output exactly matches and no unintended side-effects occur.
- Fail if any mismatch, crash, unauthorized data visibility, or silent data loss occurs.

## 1. Auth and Session Tests

| ID | Feature | Test Case | Input / Precondition | Expected Output | Strict Pass/Fail Criteria | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| QA-AUTH-01 | Signup | Create new account | Valid email, valid password | 201 and user created | Pass if response code 201 and user retrievable by login | BE |
| QA-AUTH-02 | Signup | Duplicate email blocked | Existing email | 409 duplicate error | Pass if 409 and no extra user row created | BE |
| QA-AUTH-03 | Login | Valid login | Existing user credentials | 200 + tokens | Pass if access+refresh issued and session persisted | FE+BE |
| QA-AUTH-04 | Login | Wrong password | Existing email + wrong password | 401 invalid credentials | Pass if 401 and failed attempt counter increments | BE |
| QA-AUTH-05 | Lockout | Lock after repeated failures | 5 wrong attempts | 423 locked | Pass if lock enforced for configured duration | BE |
| QA-AUTH-06 | Refresh | Valid refresh rotation | Valid refresh token | 200 new token pair | Pass if old refresh no longer valid | BE |
| QA-AUTH-07 | Refresh replay | Replay old refresh token | Reuse revoked refresh token | 401 invalid refresh and session revoke | Pass if all active refresh tokens revoked | BE |
| QA-AUTH-08 | Logout | Token/session revoke | Valid refresh token | 200 logged out | Pass if subsequent refresh fails | FE+BE |
| QA-AUTH-09 | Offline session | Offline app reopen with valid local session | Airplane mode + active local session | Session restored locally | Pass if user remains logged in without crash | FE |
| QA-AUTH-10 | Forced logout | Expired/invalid refresh path | Access expired + invalid refresh | User is logged out | Pass if app clears session and shows login screen | FE |

## 2. Products and Inventory Functional Tests

| ID | Feature | Test Case | Input / Precondition | Expected Output | Strict Pass/Fail Criteria | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| QA-PROD-01 | Product create | Add valid product | Name, qty, price valid | Product saved | Pass if appears in list with exact values | FE+BE |
| QA-PROD-02 | Product validate | Reject empty name | Empty `name` | 400 validation error | Pass if no row inserted | BE |
| QA-PROD-03 | Product update | Update price/reorder level | Existing product + new fields | Updated entity returned | Pass if version increments by 1 | BE |
| QA-PROD-04 | Product delete/archive | Delete with dependencies | Product with references | Archive or 422 as per rule | Pass if integrity preserved and behavior matches contract | BE |
| QA-PROD-05 | Low stock alert | Detect threshold crossing | qty <= reorderLevel | Listed in low stock panel | Pass if item present exactly once | FE |
| QA-PROD-06 | Expiry alert | Expiring soon products | expiryDate within 7 days | Appears in expiring list | Pass if date-range filter exact | FE |
| QA-INV-01 | Stock in movement | Increase stock | movementType stock_in qty=5 | quantityAfter = before+5 | Pass if movement log and quantity both correct | FE+BE |
| QA-INV-02 | Stock out movement | Decrease stock | stock_out qty=3 | quantityAfter = before-3 | Pass if movement log and quantity both correct | FE+BE |
| QA-INV-03 | Negative stock guard | Block invalid stock_out | stock_out > quantityOnHand | 422 insufficient stock | Pass if product quantity unchanged | BE |
| QA-INV-04 | Expiry removal | Remove expired stock | movementType expiry_removal | quantity reduced and audited | Pass if audit event created with movement link | BE |

## 3. Customers and Baki Tests

| ID | Feature | Test Case | Input / Precondition | Expected Output | Strict Pass/Fail Criteria | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| QA-CUS-01 | Customer create | Add customer | Valid name/phone | Customer saved | Pass if retrievable in list | FE+BE |
| QA-CUS-02 | Customer search | Filter by name/phone | Search term present | Matching rows only | Pass if no false positives above 1% threshold in fixture | FE |
| QA-BAKI-01 | Credit entry | Add credit | amount=500 | Running due increases by 500 | Pass if ledger and summary both updated | FE+BE |
| QA-BAKI-02 | Payment entry | Add valid payment | amount <= due | Running due decreases | Pass if due equals previous minus payment | FE+BE |
| QA-BAKI-03 | Overpayment block | Block payment > due | amount > due | 422 overpayment | Pass if no ledger mutation written | BE |
| QA-BAKI-04 | No-due payment block | Payment when due=0 | amount any positive | 422 no due | Pass if no ledger mutation written | BE |
| QA-BAKI-05 | Ledger chronology | Order and running balance | Mixed credit/payment sequence | Deterministic runningDue sequence | Pass if all rows match expected fixture values | FE+BE |

## 4. Ownership and Data Isolation Tests

| ID | Feature | Test Case | Input / Precondition | Expected Output | Strict Pass/Fail Criteria | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| QA-OWN-01 | Products scope | User A cannot read User B products | Two users with data | User A list excludes B data | Pass if zero records leaked | BE |
| QA-OWN-02 | Customers scope | User A cannot update User B customer | A uses B customerId | 404 resource not found | Pass if no update occurred | BE |
| QA-OWN-03 | Ledger scope | User A cannot read User B ledger | A requests B customer ledger | 404 | Pass if no data fields exposed | BE |
| QA-OWN-04 | Audit scope | User A cannot see User B audit entries | Filter query with A token | Only A audit rows | Pass if zero leakage | BE |

## 5. Sync Protocol Tests (Offline + Conflict)

| ID | Feature | Test Case | Input / Precondition | Expected Output | Strict Pass/Fail Criteria | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| QA-SYNC-01 | Queueing offline | Create mutation while offline | Airplane mode + create product | Local success + queued op | Pass if queue count increments by 1 | FE |
| QA-SYNC-02 | Push on reconnect | Process queued operations | Restore network | Queue drains and server reflects changes | Pass if queue reaches 0 and remote data matches local | FE+BE |
| QA-SYNC-03 | Idempotency replay | Send same operation twice | Same idempotency key + payload | Duplicate acknowledged, no double-write | Pass if only one server write exists | BE |
| QA-SYNC-04 | Idempotency mismatch | Reuse key different payload | Same key + modified payload | 409 idempotency error | Pass if second write rejected | BE |
| QA-SYNC-05 | Delta pull | Pull from cursor | Valid cursor with pending changes | Only post-cursor changes returned | Pass if change count equals expected delta | BE |
| QA-SYNC-06 | Cursor expired | Pull with expired cursor | Stale cursor | 410 cursor expired | Pass if client triggers full sync path | FE+BE |
| QA-SYNC-07 | Conflict detect | Version conflict on product update | baseVersion stale | conflict response | Pass if local item marked conflict and not auto-overwritten | FE+BE |
| QA-SYNC-08 | Conflict resolve merge | Resolve with merged update | User selects merge | New update accepted | Pass if final server version increments and values match chosen merge | FE+BE |
| QA-SYNC-09 | Retry policy | transient 503 from server | Push attempt during outage | Backoff retries executed | Pass if retry intervals follow formula within 10% tolerance | FE |
| QA-SYNC-10 | Dead-letter | Non-retryable validation fail | Invalid payload in queue | Item marked dead_letter | Pass if no automatic retries after classification | FE |

## 6. Reports and Reconciliation Tests

| ID | Feature | Test Case | Input / Precondition | Expected Output | Strict Pass/Fail Criteria | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| QA-REP-01 | Dashboard report | KPI correctness | Known fixture date range | KPI totals exact | Pass if all values equal expected fixture outputs | FE+BE |
| QA-REP-02 | Sales summary grouping | day/week/month aggregation | Report requests by groupBy | Correct grouped totals | Pass if each bucket total matches SQL reference | BE |
| QA-REP-03 | Baki aging report | Correct aging buckets | asOf date with known ledger states | Correct bucket distributions | Pass if all customers fall into expected buckets | BE |
| QA-REP-04 | Inventory health | low stock and expiry counts | Mixed stock dataset | Accurate counts returned | Pass if counts match expected baseline exactly | BE |
| QA-REP-05 | Export parity | CSV/PDF totals parity | Generate export for same date range | Export totals equal API totals | Pass if numeric values match exactly | FE+BE |

## 7. Basic Voice Validation Tests

| ID | Feature | Test Case | Input / Precondition | Expected Output | Strict Pass/Fail Criteria | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| QA-VOICE-01 | Intent parse | Credit command parse | Bangla command for credit | intent=credit, amount extracted | Pass if parsed fields match expected values | BE |
| QA-VOICE-02 | Intent parse | Payment command parse | Bangla command for payment | intent=payment, amount extracted | Pass if parsed fields match expected values | BE |
| QA-VOICE-03 | Low confidence handling | Ambiguous speech | confidence below threshold | Draft blocked from auto-commit | Pass if confirm button disabled until manual correction | FE |
| QA-VOICE-04 | Numeric extraction | Bangla numeral variants | Different spoken number styles | Same normalized amount | Pass if normalized output equals fixture value | BE |
| QA-VOICE-05 | Noise robustness | Command in shop-noise sample | Noisy audio clip | Graceful parse or fallback edit | Pass if no wrong auto-commit occurs | FE+BE |

## 8. Non-Functional and Reliability Tests

| ID | Feature | Test Case | Input / Precondition | Expected Output | Strict Pass/Fail Criteria | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| QA-NFR-01 | Startup time | Cold start on low-end device | Production build | Startup within target threshold | Pass if p95 startup <= target in 30 runs | FE |
| QA-NFR-02 | Memory usage | Long session with list navigation | 20-minute run | No OOM/crash | Pass if memory remains under agreed ceiling | FE |
| QA-NFR-03 | Sync reliability | 500 queued operations | Offline batch then reconnect | Complete sync without data loss | Pass if local/server row counts and checksums match | FE+BE |
| QA-NFR-04 | API resilience | Burst write load | 120 req/10 min/user | Controlled responses, no corruption | Pass if rate-limit behavior deterministic and data intact | BE |
| QA-NFR-05 | Audit completeness | All critical mutations logged | Execute full mutation set | Matching audit event for each mutation | Pass if audit coverage = 100% for required actions | BE |

## 9. Exit Gate Summary for QA Sign-off

Release gate pass requires:
1. 100% pass on all Critical tests: QA-AUTH-03, QA-AUTH-07, QA-OWN-01..04, QA-SYNC-01..10, QA-BAKI-03, QA-BAKI-04
2. >= 95% pass on all non-critical tests
3. 0 open defects with severity Critical/High
4. Documented rerun evidence for every previously failed critical test
