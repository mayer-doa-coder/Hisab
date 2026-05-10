# Trust Scoring Objective and Evaluation Lock (v1)

Status: LOCKED
Date: 2026-04-10
Owner: ML + Product Analytics
Applies to: Hisab trust scoring system

## 1. Scoring Objective Definition

Objective:
Estimate the probability that a customer will become delinquent/default within the next 60 days, using only information available at scoring time.

Prediction output:
- Primary output: probability $p_{60} = P(Y=1 \mid X_t)$
- Secondary output: binary action tag from threshold policy (for product decisions), but model target remains probabilistic.

Decision unit:
- One customer snapshot at scoring timestamp $t$.

Horizon:
- Fixed forward window: $(t, t+60]$ days.

Scope:
- Customer-level credit risk for baki/ledger operations.

Non-goal:
- This model does not predict exact repayment date. It predicts 60-day default probability.

## 2. Target Label Specification

### 2.1 Formal label definition

For customer $c$ at scoring time $t$:

$$
Y_{c,t}^{(60)} =
\begin{cases}
1 & \text{if default event occurs in } (t, t+60] \\
0 & \text{otherwise}
\end{cases}
$$

A default event in $(t, t+60]$ is defined as:

$$
\text{Default}_{c,t}^{(60)} = \mathbb{1}\Big(\text{OverdueDays}_{c,t+60} > 30 \;\land\; \text{OutstandingDue}_{c,t+60} \ge 500\Big)
$$

Where:
- $\text{OverdueDays}_{c,t+60}$: age in days of the oldest unpaid credit line as of $t+60$.
- $\text{OutstandingDue}_{c,t+60}$: unpaid due amount (BDT) as of $t+60$.

Rationale:
- Overdue threshold of 30 days separates temporary delay from meaningful delinquency.
- Amount floor (500 BDT) avoids labeling trivial balances as default.

### 2.2 Observation window for features

Features must use data only up to time $t$.

Default observation windows for features:
- Short behavior window: last 30 days
- Medium behavior window: last 90 days
- Long behavior window: last 180 days (if available)

No future leakage rule:
- Any event timestamped after $t$ is forbidden for feature construction.

### 2.3 Label examples

Example records (illustrative):

| customer_id | score_time_t | oldest_unpaid_age_at_t+60 | outstanding_due_at_t+60 | label_Y_60 | reason |
|---|---|---:|---:|---:|---|
| C101 | 2026-01-01 | 45 days | 3200 | 1 | overdue > 30 and due >= 500 |
| C205 | 2026-01-01 | 18 days | 4100 | 0 | not overdue enough |
| C309 | 2026-01-01 | 52 days | 220 | 0 | amount below default floor |
| C444 | 2026-01-01 | 31 days | 900 | 1 | meets both conditions |

## 3. Evaluation Metrics and Justification

Primary classification metrics:

1. AUC-PR

Definition:
$$
\text{AUC-PR} = \int_0^1 P(R)\, dR
$$
where $P$ is precision as a function of recall $R$.

Why relevant:
- Default is relatively rare; AUC-PR is more informative than ROC-AUC under class imbalance.

2. Recall at fixed precision (90%)

Definition:
$$
\text{Recall@P>=0.90} = \max_{\tau: \; \text{Precision}(\tau) \ge 0.90} \text{Recall}(\tau)
$$

Why relevant:
- Product needs high precision to avoid wrongly restricting good customers, while still catching risky ones.

Calibration metrics:

3. Brier score

Definition:
$$
\text{Brier} = \frac{1}{N}\sum_{i=1}^{N}(p_i - y_i)^2
$$

Why relevant:
- Trust score is probability-based; poor calibration damages decision quality and user trust.

4. Expected Calibration Error (ECE)

Definition (with $M$ bins):
$$
\text{ECE} = \sum_{m=1}^{M} \frac{|B_m|}{N} \cdot \left|\text{acc}(B_m) - \text{conf}(B_m)\right|
$$

Why relevant:
- Measures probability reliability across score ranges, not just ranking quality.

Business metric:

5. Estimated bad-debt loss reduction vs baseline policy

Definition:
$$
\text{LossReduction} = \frac{\text{Loss}_{\text{baseline}} - \text{Loss}_{\text{model}}}{\text{Loss}_{\text{baseline}}}
$$

Where:
- Baseline policy: current rules-only decision policy.
- Model policy: thresholded probability policy on $p_{60}$.
- Loss includes unpaid exposure and late-recovery cost according to finance assumptions.

Why relevant:
- Ensures model improvements translate to business impact, not only offline score gains.

## 4. Fixed Acceptance Thresholds (Pre-training Gate)

Thresholds are fixed before model training and must be satisfied on out-of-time validation.

Primary quality gates:
1. AUC-PR >= 0.50
2. Recall@Precision>=0.90 >= 0.30

Calibration gates:
3. Brier score <= 0.18
4. ECE <= 0.06

Business gate:
5. Estimated bad-debt loss reduction >= 15% vs baseline

Stability gates:
6. Across 5 temporal folds, metric std-dev:
   - AUC-PR std <= 0.05
   - Brier std <= 0.02

Justification for small/noisy data:
- These thresholds are strict enough to demand meaningful lift, but realistic for early-stage, imbalanced credit datasets.
- Calibration constraints are included to avoid overconfident probabilities on sparse cohorts.

## 5. Assumptions and Constraints

### 5.1 Lightweight constraint

- Inference target: mobile-safe and low-resource backend.
- Model artifact budget target: <= 1 MB (preferred far lower).
- Median inference latency target: <= 10 ms per customer snapshot on standard device/backend runtime.

### 5.2 Explainability constraint

- Each prediction must expose top contributing factors (human-readable).
- Output schema must include interpretable risk reasons for product and research use.

### 5.3 Stability constraint

- Model must not show high variance across temporal folds.
- Confidence/fallback policy required for sparse-history customers.
- Rules fallback remains mandatory when minimum data quality is not met.

### 5.4 Data and leakage assumptions

- All features are computed from events at or before $t$.
- No label leakage from post-$t$ events.
- Customer snapshots must be time-sorted for train/validation/test splits.

## 6. Operational Protocol (Before Model Development)

1. Freeze this objective document.
2. Freeze label-generation SQL/spec implementation.
3. Freeze evaluation notebook/script templates with the metrics above.
4. Obtain sign-off from Product + ML owners.
5. Only then begin model training.

## 7. Exit Criteria

1. Target label definition is unambiguous and implemented exactly as specified.
2. Metrics are formula-defined and reproducible.
3. Thresholds are fixed and agreed before any training.
4. Training work is blocked until sections 1-6 are approved.

---
This document is the single source of truth for trust-score objective and evaluation lock for v1.
