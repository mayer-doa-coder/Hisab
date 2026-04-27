# Trust Monthly Recalibration Report

- generated_at: 2026-04-27T02:22:31.662Z
- bundle_version: 103.1.0
- model_label: trust_model_v103.1
- dataset_source: synthetic_fallback
- samples_total: 320

## Calibration Updates

### champion
- calibration_before: a=1.009938, b=-0.012712
- calibration_after: a=0.829077, b=0.120192
- brier_before: 0.183719
- brier_after: 0.183148
- calibration_shift_before: 0.021815
- calibration_shift_after: 0.000001

### challenger
- calibration_before: a=0.546359, b=0.027786
- calibration_after: a=0.772809, b=0.120084
- brier_before: 0.190216
- brier_after: 0.185607
- calibration_shift_before: 0.022721
- calibration_shift_after: 0.000001

## Safety Notes

- Core model coefficients and tree structure were not modified.
- Only calibration layer parameters were updated.
- Candidate bundle should be deployed through Phase 8 feature flag rollout gates.
