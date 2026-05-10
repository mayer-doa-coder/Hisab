# Trust Production Readiness Checklist (v1)

Status: LOCKED
Date: 2026-04-11
Owner: ML + Backend + Mobile + Ops

## A. Monitoring Integration

1. Phase 8 snapshot upload endpoint is reachable:
   - `POST /api/v1/reports/trust-monitoring-snapshot`
2. Canonical artifact is written:
   - `backend/artifacts/trustMonitoringSnapshot.v1.json`
3. Snapshot includes:
   - `feature_drift`
   - `metrics.calibration_shift`
   - `fallback_rate`
   - `prediction_drift_psi`

## B. Objective Gates

1. Run quarterly pipeline:
   - `npm run trust:retrain:quarterly`
2. Verify gate pass in candidate manifest:
   - objective pass
   - phase7 pass
   - phase8 pass
3. Thresholds must match `06_TRUST_SCORING_OBJECTIVE_V1.md`.

## C. Promotion Lifecycle

1. Validate candidate:
   - `npm run trust:bundle:validate -- --bundle <version>`
2. Promote validated bundle:
   - `npm run trust:bundle:promote -- --bundle <version> --actor <name> --reason <reason>`
3. Confirm active artifact:
   - `backend/artifacts/trustActiveBundle.v1.json`
4. Rollback test:
   - `npm run trust:bundle:rollback -- --target <previous_version> --actor <name> --reason <reason>`
5. Audit trail exists:
   - `backend/artifacts/trustPromotionAuditLog.v1.json`

## D. Frontend Trust Test Automation

1. Run frontend trust suites:
   - `npm run trust:test` (inside `frontend/hisab-app`)
2. Required suites:
   - fallback policy
   - champion/challenger/hybrid routing
   - phase8 rollout + guardrail behavior

## E. Continuous Optimization

1. Scheduler check:
   - `npm run trust:optimize:check`
2. Monthly run:
   - `npm run trust:recalibrate:monthly`
3. Emergency trigger simulation:
   - `npm run trust:update:emergency -- --dry-run`

## F. Go-Live Criteria

All items must be true:
1. Candidate status is `validated_bundle` before promotion.
2. Active bundle is set through promotion command only.
3. Monitoring snapshot age is within policy window.
4. Objective gates have no failing checks.
5. Rollback command works and is audited.
6. Frontend trust test suite passes.