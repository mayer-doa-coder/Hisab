# HISAB Project Completion Roadmap (From Current State)

Date: 2026-04-10
Planning horizon: 18 weeks
Team assumption: 2 active developers (Frontend/UX + Backend/ML), with shared QA and release duties

## 1. Objective

Complete the full HISAB vision from the current codebase state, then define an advanced roadmap for post-launch innovation.

This plan is split into:
1. Core completion plan (must ship for v1.0)
2. Post-completion advanced plan (v1.1+)

## 2. Current Baseline (Starting Point)

Already strong and usable:
1. Local-first app shell and navigation
2. Core inventory, customers, baki, stock movement workflows
3. Local auth + hybrid online auth/session behavior
4. User ownership scoping in local data
5. Audit trail capture and audit history UI
6. Dashboard KPI foundation

Still missing or partial for full vision:
1. Backend business-domain APIs (products/customers/baki/movements/reports)
2. Full deterministic sync engine across business entities
3. Voice workflow (Bangla-first)
4. OCR workflow for khata image digitization
5. Markov predictor implementation (currently scaffolded)
6. Payment integrations (bKash/Nagad)
7. Full production readiness gate (automated tests, deployment pipeline, release governance)

## 3. Delivery Model

Cadence:
1. 1-week sprints
2. Weekly demo + retrospective
3. Hard quality gate at end of every 2 sprints

Execution tracks (run in parallel where possible):
1. Track A: Core platform and security
2. Track B: Backend domain APIs and sync
3. Track C: Intelligence features (voice/OCR/Markov)
4. Track D: QA, performance, release readiness

Definition of done for every phase:
1. Feature complete code merged to dev
2. Lint/static checks pass
3. Test cases updated and executed
4. No cross-user data leakage in validation
5. Documentation and runbook updates complete

## 4. 18-Week Core Completion Plan

## Phase 0 (Week 1): Re-baseline and Architecture Lock

Goal: Freeze architecture decisions and convert roadmap into sprint backlog.

Tasks:
1. Finalize API contracts for products/customers/baki/movements/reports/audit endpoints
2. Finalize sync contract (idempotency keys, conflict policy, retry policy)
3. Finalize security baseline decisions (password KDF strategy for local auth, token policy, secret management)
4. Break roadmap into sprint issues with owners and estimates
5. Update QA matrix with exact pass/fail criteria and test owners

Deliverables:
1. API contract document
2. Sync protocol document
3. Security baseline checklist
4. Sprint backlog for Weeks 2-18
5. QA/Test matrix finalized for execution gate

Locked outputs (generated on 2026-04-10):
1. architecture-lock/01_API_CONTRACT_DOCUMENT.md
2. architecture-lock/02_SYNC_PROTOCOL_DOCUMENT.md
3. architecture-lock/03_SECURITY_BASELINE_CHECKLIST.md
4. architecture-lock/04_SPRINT_BACKLOG_WEEKS_2_TO_18.md
5. architecture-lock/05_QA_TEST_MATRIX_FINAL.md

Exit criteria:
1. No major unresolved architecture blockers
2. All critical stories have acceptance criteria

## Phase 1 (Weeks 2-3): Security Hardening and Auth Stabilization

Goal: Make auth and session handling production-safe before scaling features.

Frontend tasks:
1. Replace custom local password hashing approach with standard KDF-compatible strategy
2. Add clearer auth/session state UX for offline, online, token refresh, and forced logout
3. Add account recovery and password update UI screens

Backend tasks:
1. Harden CORS policy by environment
2. Tighten auth middleware error taxonomy and response consistency
3. Add refresh-token reuse detection and explicit security logging

Database tasks:
1. Add migration for improved local credential storage
2. Add token/session cleanup jobs and retention policy settings

QA tasks:
1. Complete auth test matrix: signup/login/logout/refresh/lockout/recovery
2. Run negative security cases (invalid token, replayed token, expired token)

Deliverables:
1. Auth v2 hardening release tag
2. Security test report

Exit criteria:
1. All auth scenarios pass manual + API verification
2. No critical auth vulnerabilities in internal review

## Phase 2 (Weeks 4-6): Backend Domain API Completion

Goal: Build full cloud-side business modules matching local features.

Backend tasks:
1. Create domain models for products, customers, baki transactions, stock movements, audit logs
2. Implement REST modules with ownership scoping via user_id
3. Add domain validators and centralized error responses
4. Implement backend dashboard aggregates and report endpoints

Frontend tasks:
1. Build API clients for all domain modules
2. Add feature flags to switch between local-only and hybrid-online reads
3. Improve error-toasts and retry UX for server failures

Database tasks:
1. Finalize Mongo indexes for user-scoped query performance
2. Add migration/version metadata for API payload compatibility

QA tasks:
1. API integration test suite for all new endpoints
2. Ownership isolation tests with at least two active users

Deliverables:
1. Domain API v1
2. API test collection and CI-ready smoke scripts

Exit criteria:
1. CRUD parity achieved between local data layer and backend APIs
2. Zero cross-user leakage in test results

## Phase 3 (Weeks 7-8): Deterministic Offline Sync Engine

Goal: Reliable bidirectional sync for all business entities.

Sync tasks:
1. Extend pending_sync_queue from auth events to entity-level operations
2. Add operation UUID/idempotency key per mutation
3. Implement retry with exponential backoff and dead-letter handling
4. Implement conflict resolution policy by entity type
5. Add sync telemetry counters and failure reasons

Frontend tasks:
1. Add sync status center screen (pending, failed, retry, resolved)
2. Add per-entity conflict resolution UI for human intervention where needed

Backend tasks:
1. Create sync ingest endpoints with idempotent writes
2. Add server acknowledgement protocol for queued operations

QA tasks:
1. Offline-first test suite (airplane mode, reconnect storms, duplicate submissions)
2. Data consistency checks after long offline sessions

Deliverables:
1. Sync engine v1
2. Sync observability dashboard and logs

Exit criteria:
1. No data loss in offline to online reconciliation tests
2. Idempotency validated for repeated payload delivery

## Phase 4 (Weeks 9-10): Voice Assistant (Bangla-first)

Goal: Add voice command flow for key retail actions.

ML/voice tasks:
1. Choose inference stack and model packaging strategy within app size budget
2. Implement command intent extraction for core actions (credit, payment, add stock, stock query)
3. Add number extraction for Bangla numeric phrases

Frontend tasks:
1. Add voice input UI with clear confirmation step before committing transactions
2. Add fallback edit screen for low-confidence recognition

Backend/data tasks:
1. Add optional voice-command audit record with confidence score metadata

QA tasks:
1. Evaluate command accuracy against curated Bangla retail dataset
2. Validate behavior in noisy low-end-device conditions

Deliverables:
1. Voice command v1 for top 4 transactional flows
2. Accuracy report and error analysis

Exit criteria:
1. Meets minimum internal voice accuracy target for pilot readiness
2. No incorrect auto-commit without user confirmation

## Phase 5 (Weeks 11-12): OCR Khata Digitization

Goal: Convert handwritten khata entries into draft transactions.

OCR tasks:
1. Implement image capture/import flow
2. Implement OCR extraction pipeline and parser to structured drafts
3. Add confidence scoring and mandatory human review before save

Frontend tasks:
1. Add OCR review and correction screen
2. Add bulk apply and partial reject actions

Backend/data tasks:
1. Store OCR metadata and source image references for auditability

QA tasks:
1. Evaluate OCR on real handwritten samples
2. Validate no silent data corruption from OCR misreads

Deliverables:
1. OCR import v1
2. Reviewed dataset and correction analytics

Exit criteria:
1. OCR output always goes through review workflow
2. Accuracy threshold met for production pilot

## Phase 6 (Weeks 13-14): Markov Demand Prediction and Insights

Goal: Replace placeholder predictor path with a real Markov pipeline.

ML tasks:
1. Implement Markov-chain demand model for per-product next-period demand state
2. Add fallback to rule-based predictions on sparse history
3. Add model confidence and explainability fields in output

Frontend tasks:
1. Add recommendation confidence UI and suggested order rationale
2. Add compare view: last period actual vs predicted

Backend tasks:
1. Optional server-side batch recomputation endpoint for advanced analytics

QA tasks:
1. Backtest against historical data and compare with rule-based baseline
2. Validate recommendation quality for top-selling SKUs

Deliverables:
1. Markov predictor v1 in production path
2. Prediction quality report

Exit criteria:
1. Markov mode is fully implemented and stable
2. Prediction quality exceeds predefined baseline target

## Phase 7 (Weeks 15-16): Payments, Receipts, and Reporting

Goal: Complete financial loop and operator accountability workflows.

Payment tasks:
1. Integrate bKash/Nagad payment initiation and status reconciliation
2. Add payment event storage and reconciliation tools

Receipt/reporting tasks:
1. Generate shareable receipts for credit/payment transactions
2. Add daily, weekly, monthly business summary reports
3. Add export options (PDF/CSV) for financial and inventory reports

QA tasks:
1. Payment success/failure/cancel edge-case testing
2. Report correctness validation using known fixture datasets

Deliverables:
1. Payment integration v1
2. Receipt and reporting pack v1

Exit criteria:
1. End-to-end payment and reporting workflows pass UAT
2. Reconciliation mismatch rate remains under agreed threshold

## Phase 8 (Weeks 17-18): Production Readiness and Launch

Goal: Ship stable v1.0 with full release governance.

Engineering tasks:
1. Performance optimization for low-end devices (startup, memory, list rendering)
2. App size optimization against target constraints
3. Crash handling and telemetry wiring

QA tasks:
1. Execute full regression and acceptance matrix
2. Conduct pilot dry-run with representative shopkeeper scenarios

Release tasks:
1. Create deployment pipeline and release checklist
2. Prepare rollback strategy and incident runbook
3. Tag v1.0 and publish release notes

Deliverables:
1. Release candidate builds
2. Signed-off v1.0 launch bundle

Exit criteria:
1. All critical acceptance tests pass
2. Stakeholder sign-off complete

## 5. Cross-Cutting Workstreams (Run Every Week)

1. Data safety: daily backup validation and restore drill
2. Security: weekly threat review and dependency updates
3. Observability: logs, metrics, and error dashboards maintained
4. Documentation: update API, DB schema, and operator manuals continuously
5. UX localization: progressive Bangla-first terminology improvements

## 6. Weekly Operating Checklist (Use as Sprint Template)

1. Monday: confirm sprint goal, scope, and risks
2. Tuesday-Wednesday: implementation and unit-level verification
3. Thursday: integration and bug burn-down
4. Friday: demo, QA checkpoint, and next-sprint adjustments

## 7. Minimum Release Gates Before v1.0

1. Security gate: auth/session/token and ownership tests all pass
2. Data gate: zero-loss offline-sync validation
3. Functional gate: all core flows pass acceptance matrix
4. Performance gate: startup time, memory, and app size meet targets
5. Reliability gate: crash-free pilot threshold reached
6. Documentation gate: operator guide, technical runbook, and recovery procedures complete

## 8. Post-Completion Advanced Feature Roadmap (v1.1+)

These features should start only after v1.0 stabilization.

## Advanced Phase A: Multi-Store and Team Roles

1. Add multi-shop profiles under one account
2. Add roles: owner, manager, cashier, auditor
3. Add role-based permissions for financial actions and edits

Business value:
1. Supports growing retailers with branch operations

## Advanced Phase B: Smart Credit Intelligence

1. Build data-driven customer trust scoring with explainable factors
2. Add suggested credit limits and repayment risk alerts
3. Add proactive reminder strategy recommendations

Business value:
1. Reduces bad debt and improves cash flow

## Advanced Phase C: Supplier and Procurement Intelligence

1. Supplier catalog and lead-time reliability scoring
2. Purchase optimization by margin, demand forecast, and budget
3. Seasonal procurement planning with auto-generated orders

Business value:
1. Increases profitability and lowers stockouts

## Advanced Phase D: Area Trends and Federated Insights

1. Privacy-preserving aggregated trend intelligence
2. Nearby demand heatmaps by category
3. Alerting for emerging high-demand SKUs

Business value:
1. Improves buying decisions using market signals

## Advanced Phase E: Vision and Anti-Fraud Enhancements

1. Counterfeit packaging signal checks via image models
2. Shelf/expiry detection from camera scans
3. Invoice and receipt authenticity checks

Business value:
1. Lowers fraud and expiry losses

## Advanced Phase F: Conversational Assistant and Automation

1. Bangla conversational copilot for business Q and A
2. Explain trends, risk, and reorder actions in natural language
3. Automated daily brief and weekly action plan

Business value:
1. Improves usability for low digital literacy operators

## 9. Success Metrics (Track from Week 1)

Engineering metrics:
1. Build success rate
2. Defect escape rate
3. Sync failure rate
4. Crash-free session rate

Product metrics:
1. Daily active usage per shop
2. On-time repayment ratio improvement
3. Stockout reduction percentage
4. Expiry loss reduction percentage

ML metrics:
1. Voice intent accuracy
2. OCR field accuracy
3. Forecast error versus baseline

## 10. Immediate Next Actions (This Week)

1. Convert this roadmap into sprint tickets for Phase 0 and Phase 1
2. Finalize and approve API/sync/security design docs
3. Start security hardening implementation and auth test completion
4. Set up weekly review board using this plan as source of truth

---

Owner note:
Use this document as the execution master plan. Update status weekly with a simple marker after each phase title: Not Started, In Progress, Blocked, Complete.
