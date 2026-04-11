# Trust Rollout and Guardrails Lock (v1)

Status: LOCKED
Date: 2026-04-11
Owner: ML + Product + Engineering
Applies to: Hisab trust scoring runtime rollout (Phase 8)

## 1. Rollout Policy

Global flag:
- `enable_new_scoring` in rollout controller.

Deterministic bucketing:
- `bucket = hash(userId) % 100`
- New scoring active if `bucket < rollout_percentage` and `enable_new_scoring=true`.

Stages:
1. Stage 1: 5%
2. Stage 2: 25%
3. Stage 3: 50%
4. Stage 4: 100%

## 2. Monitoring Metrics

Performance:
- AUC-PR (approx) when labels available.
- Recall@Precision(>=0.90) when labels available.

Calibration:
- Brier score.
- Calibration shift `|mean(prediction) - mean(actual)|`.

System:
- Fallback rate.
- Error rate.
- Latency p95.

Drift:
- Feature drift by per-feature mean/variance shift.
- Prediction drift via PSI over probability histogram.

## 3. Guardrails (Active Thresholds)

- `fallback_rate > 0.30` => breach
- `error_rate > 0.02` => breach
- `latency_ms_p95 > 250` => breach
- `brier_degradation > 0.02` vs baseline => breach
- `calibration_shift > 0.05` => breach
- `feature_mean_shift > 0.35` or `feature_variance_shift > 0.50` => breach
- `prediction_drift_psi > 0.25` => breach

Minimum evidence before guardrails:
- `min_samples_for_guardrails = 40`
- `min_labeled_samples = 20` for label-dependent metrics

## 4. Auto-Revert Policy

On global breach:
1. `enable_new_scoring=false`
2. `challenger_enabled=false`
3. Route safely to champion (or rule-based if configured)
4. Emit rollback event with reason, timestamp, and snapshot id

On segment breach:
1. Disable challenger only for failing segment
2. Keep other segments active
3. Emit segment rollback event with segment key and breach reason

## 5. Observability Contract

Per request event must include:
- rollout percentage and stage
- selected model/method
- confidence and probability
- fallback usage
- latency
- error marker

Snapshot logs include:
- fallback/error/latency metrics
- drift metrics
- triggered guardrails list

## 6. Rollout Execution Runbook

1. Deploy with Stage 1 (5%) and monitor alerts.
2. If no breach, move to Stage 2 (25%) after stability window.
3. If no breach, move to Stage 3 (50%).
4. If no breach, move to Stage 4 (100%).
5. If breach at any stage:
- automatic rollback executes immediately
- investigate alerts and only resume after remediation

## 7. Exit Criteria

- Deterministic rollout confirmed.
- Metrics and drift are continuously observable.
- Guardrails trigger expected rollback behavior.
- Segment-level rollback is functional.
- No downtime during rollback transitions.
