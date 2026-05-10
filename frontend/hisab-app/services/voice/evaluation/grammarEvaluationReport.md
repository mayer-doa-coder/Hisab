# Grammar Evaluation Report

Generated: 2026-04-25T19:56:52.052Z  
Dataset: v1.2.0 · 2665 samples  
Confidence floor: 0.68

## Overall Metrics

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Intent accuracy (WAIT_INTENT) | 1 | ≥ 0.9 | ✅ |
| Name accuracy (WAIT_NAME) | 1 | ≥ 0.9 | ✅ |
| Amount accuracy (WAIT_AMOUNT) | 1 | ≥ 0.95 | ✅ |
| False execution rate | 0 | ≤ 0.02 | ✅ |
| Noise reduction rate (avg tokens stripped) | 0.7437 | — | — |

## Breakdown by Noise Tag

| Tag | Intent Acc | Name Acc | Amount Acc | False Exec | Noise Redux |
|-----|-----------|----------|------------|------------|-------------|
| shop_noise | 1 | 1 | 1 | 0 | 0.7441 |
| interrupted | 1 | 1 | 1 | 0 | 0.744 |
| mispronounced | 1 | 1 | 1 | 0 | 0.7436 |
| mixed | 1 | 1 | 1 | 0 | 0.743 |
| clean | 1 | 1 | 1 | 0 | 0.7439 |

## Failure Analysis

Total failures: **0**

| State | Failures |
|-------|---------|
| WAIT_INTENT | 0 |
| WAIT_NAME | 0 |
| WAIT_AMOUNT | 0 |

### WAIT_INTENT Failure Samples

_None_

### WAIT_NAME Failure Samples

_None_

### WAIT_AMOUNT Failure Samples

_None_

## Tuning Recommendations

### [INFO] all — overall
- **Action**: All metrics are within release-gate thresholds. No immediate tuning required.