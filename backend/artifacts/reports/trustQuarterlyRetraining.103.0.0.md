# Trust Quarterly Retraining Report

- generated_at: 2026-04-27T01:22:44.662Z
- bundle_version: 103.0.0
- model_label: trust_model_v103.0
- dataset_source: synthetic_fallback
- deployment_status: candidate_bundle

## Pipeline Steps

- dataset rebuild with latest snapshots
- feature recomputation with Phase 1 schema
- champion retraining (monotonic logistic)
- challenger retraining (lightgbm)
- phase 7 rolling-window backtest
- phase 8 guardrail gate check before deployment candidate creation

## Evaluation Gates

- objective_gate_pass: true
- phase7_backtest_gate_pass: true
- phase8_guardrail_gate_pass: true

## Champion Metrics

- auc_pr: 0.866493
- recall_at_precision_90: 0.441176
- brier_calibrated: 0.154384
- ece_calibrated: 0.00638

## Challenger Metrics

- auc_pr: 0.987072
- recall_at_precision_90: 0.985294
- brier_calibrated: 0.034547
- ece_calibrated: 0.004813

## Deployment Safety

- Candidate deployment remains feature-flagged and must roll out gradually (5% -> 25% -> 50% -> 100%).
- Block production cutover if any objective, backtest, or guardrail gate is failing.
