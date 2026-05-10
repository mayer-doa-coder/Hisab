# Trust Model Backtesting and Promotion Report (Phase 7)

- Generated at: 2026-04-27T10:08:20.162329Z
- Dataset source: synthetic_seed_1337
- Windows evaluated: 5
- Gate version: 1.0.0

## Segment Decisions

### sparse_history
- Decision: KEEP_CHAMPION
- Reason: No eligible windows for evaluation.
- Evaluated windows: 0
- Window pass ratio: 0

### normal_history
- Decision: KEEP_CHAMPION
- Reason: Window-level lift is not consistent enough. Statistical lift thresholds are not met. Calibration degradation exceeds gate limits. Business gain thresholds are not met.
- Evaluated windows: 5
- Window pass ratio: 0.0
- Avg delta AUC-PR: -0.04439
- Avg delta Recall@P90: -0.202222
- Avg business gain: 0.049248
- Avg delta Brier: 0.061311
- Avg delta ECE: 0.047882

### rich_volatile
- Decision: KEEP_CHAMPION
- Reason: Window-level lift is not consistent enough. Statistical lift thresholds are not met. Calibration degradation exceeds gate limits. Business gain thresholds are not met.
- Evaluated windows: 5
- Window pass ratio: 0.0
- Avg delta AUC-PR: -0.031795
- Avg delta Recall@P90: -0.061588
- Avg business gain: 0.047034
- Avg delta Brier: 0.08076
- Avg delta ECE: 0.051438

### high_due_amount
- Decision: KEEP_CHAMPION
- Reason: Window-level lift is not consistent enough. Statistical lift thresholds are not met. Calibration degradation exceeds gate limits. Business gain thresholds are not met.
- Evaluated windows: 4
- Window pass ratio: 0.0
- Avg delta AUC-PR: -0.044667
- Avg delta Recall@P90: -0.125595
- Avg business gain: 0.101205
- Avg delta Brier: 0.093653
- Avg delta ECE: 0.048097

### high_delay
- Decision: KEEP_CHAMPION
- Reason: Window-level lift is not consistent enough. Statistical lift thresholds are not met. Calibration degradation exceeds gate limits. Business gain thresholds are not met.
- Evaluated windows: 5
- Window pass ratio: 0.0
- Avg delta AUC-PR: -0.099495
- Avg delta Recall@P90: -0.034286
- Avg business gain: -0.040771
- Avg delta Brier: 0.0962
- Avg delta ECE: 0.080119

