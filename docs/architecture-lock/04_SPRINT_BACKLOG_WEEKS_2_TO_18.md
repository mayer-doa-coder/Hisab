# Hisab Sprint Backlog (Weeks 2-18)

Version: 1.0 (Architecture Lock)
Date: 2026-04-10
Cadence: 1-week sprints
Capacity assumption:
- Frontend developer: 30 effective hours/week
- Backend developer: 30 effective hours/week
- Planned buffer: 8 hours/week (shared)

Legend:
- Owner: FE (Frontend/UX), BE (Backend/ML)
- Estimates are implementation hours
- Every story includes measurable acceptance criteria

## Week 2 - Security Hardening Kickoff

Sprint goal:
- Replace insecure local credential approach and lock auth control surface.

User stories:
1. As a shop owner, I can login securely without exposing credentials in local storage.
   - Acceptance criteria: passwords are bcrypt-hashed locally; plaintext password never persisted.
2. As a system admin, I can detect refresh token replay and revoke sessions.
   - Acceptance criteria: replay attempt triggers revocation and security event.

Tasks:
| ID | Task | Owner | Est. Hours | Dependency |
| --- | --- | --- | --- | --- |
| W2-01 | Implement bcrypt migration for local users table | FE | 8 | None |
| W2-02 | Add secure token storage abstraction (keystore-backed) | FE | 6 | W2-01 |
| W2-03 | Add refresh reuse detection logic | BE | 8 | None |
| W2-04 | Add security event logging model and writer | BE | 6 | W2-03 |
| W2-05 | Add auth regression tests (signup/login/refresh/logout) | FE+BE | 10 | W2-01,W2-03 |
| W2-BUF | Buffer (unexpected integration defects) | FE+BE | 8 | None |

## Week 3 - Auth Stability and Policy Completion

Sprint goal:
- Finalize token policy, CORS hardening, and auth UX states.

User stories:
1. As a user, I see clear session state when offline/online/expired.
   - Acceptance criteria: UI shows deterministic states with no silent logout.
2. As platform owner, production API does not allow wildcard CORS.
   - Acceptance criteria: allowlist enforced by env and validated in tests.

Tasks:
| ID | Task | Owner | Est. Hours | Dependency |
| --- | --- | --- | --- | --- |
| W3-01 | Add auth state banners and forced logout handling UI | FE | 8 | W2-02 |
| W3-02 | Add password recovery/update screens | FE | 8 | W2-01 |
| W3-03 | Implement environment-based CORS allowlist | BE | 6 | None |
| W3-04 | Standardize auth error codes and middleware mapping | BE | 8 | W2-03 |
| W3-05 | Security negative test suite (invalid token/replay/expired) | FE+BE | 10 | W3-03,W3-04 |
| W3-BUF | Buffer | FE+BE | 8 | None |

## Week 4 - Products API Foundation

Sprint goal:
- Deliver production-ready products module in `/api/v1`.

User stories:
1. As a user, I can create/list/update/delete products with ownership isolation.
   - Acceptance criteria: CRUD works; user A never sees user B records.

Tasks:
| ID | Task | Owner | Est. Hours | Dependency |
| --- | --- | --- | --- | --- |
| W4-01 | Create Product model + repository with user scoping | BE | 8 | W3-04 |
| W4-02 | Build product controllers/routes/validators | BE | 10 | W4-01 |
| W4-03 | Implement FE products API client + DTO mapper | FE | 8 | W4-02 |
| W4-04 | Add feature flag for local-first read with server shadow read | FE | 6 | W4-03 |
| W4-05 | Product API contract tests | FE+BE | 8 | W4-02 |
| W4-BUF | Buffer | FE+BE | 8 | None |

## Week 5 - Customers API Foundation

Sprint goal:
- Deliver customer module and due-aware listing contract.

User stories:
1. As a user, I can manage customers with due status and search.
   - Acceptance criteria: create/update/archive/list all pass with isolation.

Tasks:
| ID | Task | Owner | Est. Hours | Dependency |
| --- | --- | --- | --- | --- |
| W5-01 | Create Customer model + scoped repository | BE | 8 | W4-01 |
| W5-02 | Build customer routes/controllers/validators | BE | 10 | W5-01 |
| W5-03 | Implement FE customers API client + fallback wiring | FE | 8 | W5-02 |
| W5-04 | Add customer list shadow-read compare mode | FE | 6 | W5-03 |
| W5-05 | Customer API integration/isolation tests | FE+BE | 8 | W5-02 |
| W5-BUF | Buffer | FE+BE | 8 | None |

## Week 6 - Baki and Inventory Movement APIs

Sprint goal:
- Complete financial mutation APIs with strict business rules.

User stories:
1. As a user, I can add credit/payment and cannot overpay.
   - Acceptance criteria: overpayment returns deterministic 422.
2. As a user, stock out cannot create negative quantity.
   - Acceptance criteria: insufficient stock returns 422 and no write.

Tasks:
| ID | Task | Owner | Est. Hours | Dependency |
| --- | --- | --- | --- | --- |
| W6-01 | Implement baki credits/payments APIs with immutable entries | BE | 10 | W5-02 |
| W6-02 | Implement inventory movement API and stock guards | BE | 10 | W4-02 |
| W6-03 | FE API adapters for baki and movement writes | FE | 8 | W6-01,W6-02 |
| W6-04 | FE error handling UX for 422 business rules | FE | 6 | W6-03 |
| W6-05 | Contract tests for baki/movement edge cases | FE+BE | 8 | W6-02 |
| W6-BUF | Buffer | FE+BE | 8 | None |

## Week 7 - Transactions and Reports APIs

Sprint goal:
- Deliver generic transactions and core reporting endpoints.

User stories:
1. As a user, I can retrieve dashboard and sales summary from backend.
   - Acceptance criteria: report values match fixture calculations.

Tasks:
| ID | Task | Owner | Est. Hours | Dependency |
| --- | --- | --- | --- | --- |
| W7-01 | Build transaction model/routes (create/list/void) | BE | 10 | W6-01 |
| W7-02 | Build reports endpoints (dashboard, sales, baki aging, inventory health) | BE | 10 | W6-01,W6-02 |
| W7-03 | FE report API clients and integration to dashboard toggles | FE | 8 | W7-02 |
| W7-04 | Add report fixture-based assertion tests | FE+BE | 8 | W7-02 |
| W7-BUF | Buffer | FE+BE | 8 | None |

## Week 8 - Sync Engine Core (Push)

Sprint goal:
- Implement queued push synchronization with idempotency.

User stories:
1. As a user, my offline writes are reliably pushed when network returns.
   - Acceptance criteria: queued operations eventually apply without duplicates.

Tasks:
| ID | Task | Owner | Est. Hours | Dependency |
| --- | --- | --- | --- | --- |
| W8-01 | Add local sync queue schema extensions (operationId, retries, state) | FE | 8 | W6-03 |
| W8-02 | Build sync worker for push batches with retries | FE | 10 | W8-01 |
| W8-03 | Build `/api/v1/sync/push` endpoint + idempotency table | BE | 10 | W6-01 |
| W8-04 | Add result-state mapping (applied, conflict, dead-letter) | FE+BE | 8 | W8-02,W8-03 |
| W8-BUF | Buffer | FE+BE | 8 | None |

## Week 9 - Sync Engine Core (Pull + Cursor)

Sprint goal:
- Implement pull delta sync and cursor handling.

User stories:
1. As a user, I receive server-side changes without full re-download.
   - Acceptance criteria: cursor-based pull returns only new/updated entities.

Tasks:
| ID | Task | Owner | Est. Hours | Dependency |
| --- | --- | --- | --- | --- |
| W9-01 | Build backend change-log and cursor store | BE | 10 | W8-03 |
| W9-02 | Implement `/api/v1/sync/pull` endpoint with paging | BE | 10 | W9-01 |
| W9-03 | Implement local cursor persistence + transactional apply | FE | 8 | W9-02 |
| W9-04 | Add pull loop and recovery handling (`CURSOR_EXPIRED`) | FE | 6 | W9-03 |
| W9-05 | Sync delta correctness tests | FE+BE | 8 | W9-02,W9-03 |
| W9-BUF | Buffer | FE+BE | 8 | None |

## Week 10 - Conflict Resolution UX and Policies

Sprint goal:
- Complete conflict detection/resolution flow for mutable entities.

User stories:
1. As a user, when conflict occurs I can resolve deterministically without data loss.
   - Acceptance criteria: conflict card appears with server/local diff and explicit action.

Tasks:
| ID | Task | Owner | Est. Hours | Dependency |
| --- | --- | --- | --- | --- |
| W10-01 | Backend conflict payload and ack endpoint | BE | 8 | W9-02 |
| W10-02 | Frontend conflict center screen and actions | FE | 10 | W9-04 |
| W10-03 | Implement merge/discard/retry action handlers | FE | 8 | W10-02 |
| W10-04 | End-to-end sync conflict tests | FE+BE | 10 | W10-01,W10-03 |
| W10-BUF | Buffer | FE+BE | 8 | None |

## Week 11 - Voice Command Foundation

Sprint goal:
- Ship first-pass Bangla voice intent flow for core actions.

User stories:
1. As a user, I can speak a command and review parsed draft before commit.
   - Acceptance criteria: no mutation happens without explicit confirmation.

Tasks:
| ID | Task | Owner | Est. Hours | Dependency |
| --- | --- | --- | --- | --- |
| W11-01 | Select inference stack and package integration | BE | 8 | None |
| W11-02 | Implement intent parser for credit/payment/stock query | BE | 10 | W11-01 |
| W11-03 | Build voice input and draft confirmation UI | FE | 10 | W11-02 |
| W11-04 | Add confidence threshold and fallback edit flow | FE | 6 | W11-03 |
| W11-05 | Voice smoke test set (clean environment) | FE+BE | 8 | W11-02,W11-03 |
| W11-BUF | Buffer | FE+BE | 8 | None |

## Week 12 - Voice Reliability and Basic Analytics

Sprint goal:
- Improve voice reliability for noisy retail environment.

User stories:
1. As a user, low-confidence voice output is safely routed for correction.
   - Acceptance criteria: confidence below threshold blocks auto-commit 100% of tests.

Tasks:
| ID | Task | Owner | Est. Hours | Dependency |
| --- | --- | --- | --- | --- |
| W12-01 | Add noisy-sample test harness | BE | 8 | W11-02 |
| W12-02 | Improve number extraction for Bangla numerals/phrases | BE | 10 | W11-02 |
| W12-03 | Add voice audit metadata persistence | BE | 6 | W12-02 |
| W12-04 | UI refinements for correction speed | FE | 8 | W11-04 |
| W12-05 | Voice validation matrix execution | FE+BE | 10 | W12-02,W12-04 |
| W12-BUF | Buffer | FE+BE | 8 | None |

## Week 13 - OCR Pipeline Foundation

Sprint goal:
- Build OCR capture/import and draft extraction pipeline.

User stories:
1. As a user, I can capture khata image and receive structured draft entries.
   - Acceptance criteria: parser outputs schema-valid drafts with confidence score.

Tasks:
| ID | Task | Owner | Est. Hours | Dependency |
| --- | --- | --- | --- | --- |
| W13-01 | Implement camera/import workflow | FE | 8 | None |
| W13-02 | Build OCR extraction pipeline and parser | BE | 12 | None |
| W13-03 | Define OCR draft schema and validation | BE | 6 | W13-02 |
| W13-04 | Build OCR draft review UI | FE | 10 | W13-03 |
| W13-05 | OCR sample-set functional tests | FE+BE | 8 | W13-02,W13-04 |
| W13-BUF | Buffer | FE+BE | 8 | None |

## Week 14 - OCR Corrections and Reliability

Sprint goal:
- Complete OCR correction loop and safe apply.

User stories:
1. As a user, I can edit/reject OCR drafts before final save.
   - Acceptance criteria: 100% of imported rows require explicit accept action.

Tasks:
| ID | Task | Owner | Est. Hours | Dependency |
| --- | --- | --- | --- | --- |
| W14-01 | Add bulk accept/reject and partial apply actions | FE | 10 | W13-04 |
| W14-02 | Add OCR metadata storage and audit references | BE | 8 | W13-03 |
| W14-03 | Build OCR misread detection rules | BE | 8 | W13-02 |
| W14-04 | OCR safety and corruption prevention tests | FE+BE | 10 | W14-01,W14-02 |
| W14-BUF | Buffer | FE+BE | 8 | None |

## Week 15 - Markov Predictor Implementation

Sprint goal:
- Replace placeholder Markov mode with production logic.

User stories:
1. As a user, reorder suggestions are generated by Markov model when enough history exists.
   - Acceptance criteria: model output contains prediction, confidence, and rationale.

Tasks:
| ID | Task | Owner | Est. Hours | Dependency |
| --- | --- | --- | --- | --- |
| W15-01 | Implement Markov state model and transition builder | BE | 12 | W7-02 |
| W15-02 | Add sparse-data fallback to rule-based engine | BE | 6 | W15-01 |
| W15-03 | Integrate model output into FE reorder cards | FE | 8 | W15-01 |
| W15-04 | Add confidence and rationale display | FE | 8 | W15-03 |
| W15-05 | Backtest suite against historical fixtures | FE+BE | 8 | W15-02,W15-04 |
| W15-BUF | Buffer | FE+BE | 8 | None |

## Week 16 - Payments and Reconciliation

Sprint goal:
- Integrate payment workflows with reconciliation records.

User stories:
1. As a user, I can record and reconcile bKash/Nagad payment status.
   - Acceptance criteria: initiated, success, failed, and canceled states persist correctly.

Tasks:
| ID | Task | Owner | Est. Hours | Dependency |
| --- | --- | --- | --- | --- |
| W16-01 | Implement payment provider abstraction | BE | 8 | W7-01 |
| W16-02 | Add payment initiation/status endpoints | BE | 10 | W16-01 |
| W16-03 | Add payment flow UI and status tracking | FE | 10 | W16-02 |
| W16-04 | Build reconciliation report queries | BE | 6 | W16-02 |
| W16-05 | Payment edge-case QA suite | FE+BE | 8 | W16-03,W16-04 |
| W16-BUF | Buffer | FE+BE | 8 | None |

## Week 17 - Reporting, Exports, and Final Integration

Sprint goal:
- Complete reporting outputs and stabilize full-stack flows.

User stories:
1. As a user, I can export core reports to CSV/PDF.
   - Acceptance criteria: exported totals match API report totals exactly.

Tasks:
| ID | Task | Owner | Est. Hours | Dependency |
| --- | --- | --- | --- | --- |
| W17-01 | Implement report export endpoints | BE | 8 | W7-02 |
| W17-02 | Add FE report export actions and download UX | FE | 10 | W17-01 |
| W17-03 | Full flow integration test (auth->sync->ledger->reports) | FE+BE | 12 | W10-04,W16-05 |
| W17-04 | Performance tuning pass (query + list rendering) | FE+BE | 10 | W17-03 |
| W17-BUF | Buffer | FE+BE | 8 | None |

## Week 18 - Release Hardening and Launch

Sprint goal:
- Deliver production candidate and go-live package.

User stories:
1. As a stakeholder, I can approve launch from objective release gates.
   - Acceptance criteria: all critical QA gates pass; rollback plan verified.

Tasks:
| ID | Task | Owner | Est. Hours | Dependency |
| --- | --- | --- | --- | --- |
| W18-01 | Execute full regression matrix and triage | FE+BE | 14 | W17-03 |
| W18-02 | Prepare deployment pipeline and release checklist | BE | 8 | W17-04 |
| W18-03 | Final UX polish and localization pass | FE | 8 | W17-04 |
| W18-04 | Run rollback drill and incident runbook test | FE+BE | 8 | W18-02 |
| W18-05 | Publish v1.0 release notes and sign-off packet | FE+BE | 6 | W18-01,W18-04 |
| W18-BUF | Buffer | FE+BE | 8 | None |

## Dependencies Map (Critical Path)

1. Auth hardening (W2-W3) -> Domain APIs (W4-W7)
2. Domain APIs (W4-W7) -> Sync engine (W8-W10)
3. Sync engine (W8-W10) -> Production stability and launch (W17-W18)
4. Reports foundation (W7) -> Export and analytics finish (W17)
5. Voice/OCR/Markov track (W11-W15) runs parallel but must not block core launch gates unless marked mandatory in release scope

## Release Scope Guardrails

Mandatory for v1.0 launch:
1. W2-W10 and W16-W18 completion with all critical QA pass
2. W11-W15 can ship as phased enablement only if risk-accepted

No-rollover rules:
1. Security defects severity Critical/High cannot be deferred
2. Data consistency defects in sync cannot be deferred
3. Ownership leakage defects cannot be deferred
