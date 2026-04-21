# Deployment Playbook: Pilot-to-Scale (Hisab)

## 1. Objective
Roll out Hisab to pilot shops safely, validate adoption KPIs, and iterate quickly before wider launch.

## 2. Pilot Scope
- Target: 5-10 shops
- Mix: grocery, pharmacy, general store
- Duration: 4-6 weeks
- Success criteria:
  - DAO trend increasing week-over-week
  - Digital sales ratio improving
  - Feedback response loop active (bug/feature/ux)

## 3. Pre-Launch Checklist
- Backend API is running and reachable from mobile app.
- MongoDB is connected and writable.
- Mobile app has latest build with:
  - Onboarding screen
  - Help center screen
  - Feedback screen
- Auth works online and session refresh is healthy.
- Backup and restore checks completed.

## 4. Pilot Setup Steps
1. Open Onboarding screen.
2. Register each pilot shop with type and estimated daily sales.
3. Use the guided walkthrough with operator.
4. Validate first sale, first payment, and dashboard visibility.

## 5. Training Checklist
- Operator can create a sale in under 3 minutes.
- Operator can record payment and verify baki ledger updates.
- Operator can access help center articles.
- Operator submits at least one feedback entry in first week.

## 6. Support Process
- Daily support window: fixed 2-hour slot.
- Triage categories:
  - `bug`: blocking or incorrect behavior
  - `feature`: workflow request
  - `ux`: friction/confusion
- SLA guideline:
  - Critical bug: same day
  - Non-critical bug: 48 hours
  - Feature/UX: weekly review

## 7. KPI Review Cadence
- Daily:
  - DAO
  - Digital sales ratio
  - New feedback entries
- Weekly:
  - Shop retention
  - Feature usage trend
  - Bug burn-down

## 8. Rollout Decision Gates
- Gate 1 (end of week 2):
  - No critical unresolved bug older than 72 hours.
  - At least 70% pilot shops active.
- Gate 2 (end of week 4):
  - DAO trending upward.
  - Digital sales ratio stable/improving.
  - Feedback themes mapped to action items.
- Gate 3 (scale approval):
  - Training process repeatable.
  - Support load predictable.
  - Operational metrics stable for 2 consecutive weeks.

## 9. Rollback Plan
- Pause onboarding for new shops.
- Keep existing pilot shops in support-only mode.
- Revert risky feature flags/config only (no destructive data actions).
- Restore from known-good backup if data anomaly is confirmed.

## 10. Communication Template
- Daily update:
  - Active shops: X/Y
  - DAO: X
  - Digital sales ratio: X%
  - Feedback (bug/feature/ux): X/X/X
  - Blockers + owner + ETA
