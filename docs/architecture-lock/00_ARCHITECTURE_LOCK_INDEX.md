# Hisab Architecture Lock Pack (Pre-Implementation Finalization)

Date: 2026-04-10
Status: Finalized baseline for execution start

This folder contains the frozen architecture and execution baseline for Phase 0.

## Mandatory Deliverables

1. API Contract Document
- File: `01_API_CONTRACT_DOCUMENT.md`
- Covers: `/api/v1` contracts for products, customers, baki, inventory movements, transactions, reports, audit logs

2. Sync Protocol Document
- File: `02_SYNC_PROTOCOL_DOCUMENT.md`
- Covers: idempotency format, conflict policy per entity, retry/backoff, push/pull delta sync, consistency guarantees

3. Security Baseline Checklist
- File: `03_SECURITY_BASELINE_CHECKLIST.md`
- Covers: password hashing decision, token policy, secret management, API protection, data protection controls

4. Sprint Backlog (Weeks 2-18)
- File: `04_SPRINT_BACKLOG_WEEKS_2_TO_18.md`
- Covers: sprint goals, user stories, acceptance criteria, granular tasks, owners, effort, dependencies, buffer

5. QA/Test Matrix
- File: `05_QA_TEST_MATRIX_FINAL.md`
- Covers: functional, edge, offline, sync conflict, ownership isolation, and basic voice validation tests

6. Trust Rollout Guardrails Lock
- File: `08_TRUST_ROLLOUT_GUARDRAILS_V1.md`
- Covers: staged rollout, deterministic bucketing, monitoring metrics, drift detection, guardrails, and auto-revert protocol

7. Trust Continuous Optimization Lock
- File: `09_TRUST_CONTINUOUS_OPTIMIZATION_V1.md`
- Covers: monthly recalibration, quarterly retraining, drift-triggered emergency updates, versioning, and automation schedule

8. Trust Inference Architecture Policy Lock
- File: `10_TRUST_INFERENCE_ARCHITECTURE_POLICY_V1.md`
- Covers: final Option A architecture choice, governance boundaries, and future hybrid scalability plan

9. Trust Production Readiness Checklist
- File: `11_TRUST_PRODUCTION_READINESS_CHECKLIST_V1.md`
- Covers: executable readiness checks for monitoring, gates, promotion, rollback, and frontend trust tests

## Integration Alignment Notes

Frontend-backend-database connectivity guardrails are locked in this pack:
1. Existing auth flow (`/api/auth/*`) remains active for compatibility during migration.
2. New business domain APIs are versioned under `/api/v1/*`.
3. SQLite remains UI source of truth; sync protocol bridges local queue to backend.
4. Ownership enforcement is required in every backend data path (`user_id` scope).
5. Sync idempotency guarantees exactly-once server effect for retried operations.

## Phase 0 Exit Validation Checklist

1. No critical architecture decision left undefined
2. Auth, sync, and financial mutation flows fully specified
3. Sprint stories contain acceptance criteria
4. QA pass/fail criteria are measurable and explicit
