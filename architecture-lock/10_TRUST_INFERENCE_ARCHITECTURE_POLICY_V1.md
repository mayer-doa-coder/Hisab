# Trust Inference Architecture Policy (v1)

Status: LOCKED
Date: 2026-04-11
Owner: ML + Backend + Mobile + Product
Applies to: Trust scoring serving architecture

## Decision

Chosen architecture: **Option A (Client-side inference primary)**

Policy:
1. React Native app performs trust inference locally using versioned artifacts.
2. Backend remains the control plane for training, validation, monitoring ingestion, and promotion/rollback governance.
3. Promotion is controlled by backend registry and staged rollout controls.

## Why Option A

Pros retained:
1. Full offline scoring for দোকান owners with poor/unstable internet.
2. Very low inference latency on-device.
3. Predictable app UX even during backend outages.

Mitigations for Option A risks:
1. Backend-managed model lifecycle (`candidate_bundle -> validated_bundle -> active_bundle`).
2. Monitoring snapshots are uploaded to backend and consumed by emergency/monthly/quarterly automation.
3. Strict rollout guardrails and auto-revert protect model changes.

## Serving Contract

1. Frontend runtime uses:
   - `trustChampionModel.v1.js`
   - `trustChallengerModel.v1.js`
   - `trustSegmentPromotion.v1.js`
2. Backend artifacts remain source-of-truth for candidates and active state:
   - `trustModelRegistry.v1.json`
   - `trustDeploymentCandidate.v1.json`
   - `trustActiveBundle.v1.json`
3. Any active bundle promotion requires validated gates and explicit promotion command.

## Scalability Plan (Future)

Phase A (current):
1. Client-side inference primary.
2. Backend governance and optimization scheduler.

Phase B (future hybrid extension):
1. Add optional backend trust scoring endpoint for online mode shadow scoring.
2. Compare backend vs client predictions for drift and consistency telemetry.
3. Keep offline fallback to local inference when connectivity is unavailable.

Phase C (enterprise control):
1. Policy-driven runtime selection per tenant/segment.
2. Server-side explainability and centralized A/B infra.
3. Signed model bundles and integrity checks before frontend activation.

## Non-Negotiable Safety Rules

1. No direct promotion from candidate to active without validation pass.
2. Any guardrail breach can trigger rollback path.
3. Every promotion/rollback must produce an audit event.
4. Objective gates from `06_TRUST_SCORING_OBJECTIVE_V1.md` remain binding.

## Exit Criteria

1. Architecture decision is explicit and versioned.
2. Promotion/rollback governance is enforceable.
3. Offline-first reliability is preserved.
4. Path to hybrid/server-assisted scaling is documented.