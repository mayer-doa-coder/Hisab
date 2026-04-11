import json
import math
import os
import pathlib
import statistics
import sys
from datetime import datetime, timezone

import lightgbm as lgb
import numpy as np

from trainTrustChallengerModel import CHALLENGER_CONFIG, FEATURE_KEYS, build_synthetic_dataset

SCRIPT_VERSION = "1.0.0"

FEATURE_DIRECTIONS = {
    "due_amount": 1,
    "late_count": 1,
    "avg_delay_days": 1,
    "transaction_depth": -1,
    "recency_days": 1,
    "payment_consistency": -1,
    "payment_volatility": 1,
}

DEFAULT_SEGMENT_THRESHOLDS = {
    "sparse_history_max_depth": 3,
    "rich_history_min_depth": 12,
    "high_volatility_min": 45,
    "high_due_amount_min": 5000,
    "high_delay_min_days": 20,
}

DEFAULT_ROLLING_WINDOW_CONFIG = {
    "train_size": 140,
    "test_size": 40,
    "step_size": 20,
    "min_segment_samples_per_window": 12,
}

DEFAULT_PROMOTION_GATES = {
    "gate_set": "trust_segment_promotion",
    "version": "1.0.0",
    "status": "LOCKED",
    "requires_review_to_change": True,
    "review_policy": "Any threshold change requires ML + Product Analytics sign-off and a new gate version.",
    "business_policy": {
        "high_risk_threshold": 0.7,
        "missed_good_cost_rate": 0.05,
        "exposure_feature": "due_amount",
    },
    "global": {
        "min_windows_required": 3,
        "min_consistent_pass_ratio": 0.6,
        "min_positive_labels_per_window": 1,
    },
    "segments": {
        "default": {
            "min_auc_pr_gain": 0.02,
            "min_recall_gain": 0.02,
            "max_brier_degradation": 0.01,
            "max_ece_degradation": 0.01,
            "min_business_gain_pct": 0.1,
            "max_false_positive_increase": 0.05,
        },
        "rich_volatile": {
            "min_auc_pr_gain": 0.015,
            "min_recall_gain": 0.02,
            "max_brier_degradation": 0.01,
            "max_ece_degradation": 0.01,
            "min_business_gain_pct": 0.1,
            "max_false_positive_increase": 0.06,
        },
        "sparse_history": {
            "min_auc_pr_gain": 0.01,
            "min_recall_gain": 0.015,
            "max_brier_degradation": 0.008,
            "max_ece_degradation": 0.008,
            "min_business_gain_pct": 0.05,
            "max_false_positive_increase": 0.03,
        },
    },
}

OUTPUT_PATHS = {
    "gates": pathlib.Path("backend/artifacts/trustPromotionGates.v1.json"),
    "report_json": pathlib.Path("backend/artifacts/trustBacktestReport.v1.json"),
    "report_md": pathlib.Path("backend/artifacts/trustBacktestReport.v1.md"),
    "decisions_json": pathlib.Path("backend/artifacts/trustSegmentPromotion.v1.json"),
    "frontend_decisions_json": pathlib.Path("frontend/hisab-app/services/customers/models/trustSegmentPromotion.v1.json"),
    "frontend_decisions_js": pathlib.Path("frontend/hisab-app/services/customers/models/trustSegmentPromotion.v1.js"),
}


def _round(value, digits=6):
    if not math.isfinite(float(value)):
        return 0.0
    return round(float(value), digits)


def _clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def _sigmoid(value):
    if value >= 0:
        z = math.exp(-value)
        return 1.0 / (1.0 + z)
    z = math.exp(value)
    return z / (1.0 + z)


def _env_flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None or str(raw).strip() == "":
        return default
    return str(raw).strip().lower() in ("1", "true", "yes", "on")


def _must_use_real_dataset() -> bool:
    node_env = str(os.getenv("NODE_ENV", "")).strip().lower()
    return node_env == "production" or _env_flag("TRUST_REQUIRE_REAL_DATASET", False)


def _can_use_synthetic_dataset() -> bool:
    if not _must_use_real_dataset():
        return True
    return _env_flag("TRUST_ALLOW_SYNTHETIC_DATASET", False)


def _to_timestamp(row):
    value = row.get("score_time") or row.get("score_time_t") or row.get("timestamp") or row.get("created_at")
    if not value:
        return 0

    try:
        if isinstance(value, str) and value.endswith("Z"):
            value = value[:-1] + "+00:00"
        return int(datetime.fromisoformat(str(value)).timestamp())
    except Exception:
        return 0


def _extract_label(row):
    raw = row.get("label", row.get("target", row.get("default_60d", row.get("target_default_60d", 0))))
    if raw in (1, True, "1", "true", "True"):
        return 1
    return 0


def _feature_value(row, key):
    if isinstance(row.get("features"), dict):
        return float(row["features"].get(key, 0.0))
    return float(row.get(key, 0.0))


def load_dataset(dataset_path):
    if dataset_path and pathlib.Path(dataset_path).exists():
        payload = json.loads(pathlib.Path(dataset_path).read_text(encoding="utf-8"))
        if not isinstance(payload, list):
            raise ValueError("Dataset JSON must be an array of rows.")
        return payload, str(pathlib.Path(dataset_path).resolve())

    if not _can_use_synthetic_dataset():
        raise ValueError(
            "No training dataset was provided. Set TRUST_TRAINING_DATASET_PATH (or pass dataset path as CLI argument). "
            "Synthetic fallback is blocked when NODE_ENV=production or TRUST_REQUIRE_REAL_DATASET=true."
        )

    return build_synthetic_dataset(), "synthetic_seed_1337"


def build_sorted_matrix(rows):
    sorted_rows = sorted(rows, key=_to_timestamp)
    x = np.array([[_feature_value(row, key) for key in FEATURE_KEYS] for row in sorted_rows], dtype=np.float64)
    y = np.array([_extract_label(row) for row in sorted_rows], dtype=np.int64)
    timestamps = [
        row.get("score_time")
        or row.get("score_time_t")
        or row.get("timestamp")
        or row.get("created_at")
        or ""
        for row in sorted_rows
    ]
    return sorted_rows, x, y, timestamps


def fit_standard_scaler(x):
    if x.size == 0:
        return np.array([], dtype=np.float64), np.array([], dtype=np.float64)

    mean = np.mean(x, axis=0)
    std = np.std(x, axis=0)
    std = np.where(std < 1e-9, 1.0, std)
    return mean, std


def transform_with_scaler(x, mean, std):
    if x.size == 0:
        return x
    return (x - mean) / std


def compute_logits(x, weights, intercept):
    if x.size == 0:
        return np.array([], dtype=np.float64)
    return np.dot(x, weights) + intercept


def apply_monotonic_projection(weights):
    for idx, key in enumerate(FEATURE_KEYS):
        direction = FEATURE_DIRECTIONS.get(key, 1)
        if direction >= 0 and weights[idx] < 0:
            weights[idx] = 0.0
        if direction < 0 and weights[idx] > 0:
            weights[idx] = 0.0


def train_monotonic_logistic(x, y, epochs=1600, learning_rate=0.045, l2_lambda=0.001):
    if x.shape[0] == 0 or y.shape[0] != x.shape[0]:
        raise ValueError("Champion training data is empty or inconsistent.")

    n_samples, n_features = x.shape
    weights = np.zeros((n_features,), dtype=np.float64)
    intercept = 0.0
    previous_loss = float("inf")

    for _ in range(epochs):
        logits = compute_logits(x, weights, intercept)
        probs = np.array([_sigmoid(v) for v in logits], dtype=np.float64)
        errors = probs - y

        grad_w = np.dot(x.T, errors) / float(n_samples)
        grad_b = float(np.sum(errors) / float(n_samples))

        grad_w = grad_w + (l2_lambda * weights)
        weights = weights - (learning_rate * grad_w)
        intercept = intercept - (learning_rate * grad_b)

        apply_monotonic_projection(weights)

        probs = np.clip(probs, 1e-9, 1.0 - 1e-9)
        loss = float(
            -np.mean(y * np.log(probs) + (1 - y) * np.log(1 - probs))
            + (0.5 * l2_lambda * np.sum(weights * weights))
        )
        if abs(previous_loss - loss) < 1e-8:
            break
        previous_loss = loss

    return {
        "weights": weights,
        "intercept": intercept,
    }


def fit_platt_scaling(logits, labels, epochs=1200, learning_rate=0.03, l2_lambda=0.0005):
    if logits.size == 0 or labels.size != logits.size:
        return {"a": 1.0, "b": 0.0}

    a = 1.0
    b = 0.0
    n = float(logits.size)

    for _ in range(epochs):
        z = (a * logits) + b
        probs = np.array([_sigmoid(v) for v in z], dtype=np.float64)
        errors = probs - labels

        grad_a = float((np.dot(errors, logits) / n) + (l2_lambda * a))
        grad_b = float(np.sum(errors) / n)

        a -= learning_rate * grad_a
        b -= learning_rate * grad_b
        if a < 0:
            a = 0.0

    return {"a": float(a), "b": float(b)}


def apply_platt_scaling(logits, calibration):
    a = float(calibration.get("a", 1.0))
    b = float(calibration.get("b", 0.0))
    return np.array([_sigmoid(a * value + b) for value in logits], dtype=np.float64)


def auc_pr(labels, probs):
    if labels.size == 0 or labels.size != probs.size:
        return 0.0

    pairs = sorted(zip(probs.tolist(), labels.tolist()), key=lambda item: item[0], reverse=True)
    positives = sum(1 for _, label in pairs if label == 1)
    if positives == 0:
        return 0.0

    tp = 0
    fp = 0
    prev_recall = 0.0
    area = 0.0

    for _, label in pairs:
        if label == 1:
            tp += 1
        else:
            fp += 1

        recall = tp / positives
        precision = tp / max(1, tp + fp)
        area += (recall - prev_recall) * precision
        prev_recall = recall

    return float(area)


def recall_at_precision(labels, probs, min_precision=0.9):
    if labels.size == 0 or labels.size != probs.size:
        return 0.0

    pairs = sorted(zip(probs.tolist(), labels.tolist()), key=lambda item: item[0], reverse=True)
    positives = sum(1 for _, label in pairs if label == 1)
    if positives == 0:
        return 0.0

    tp = 0
    fp = 0
    best = 0.0

    for _, label in pairs:
        if label == 1:
            tp += 1
        else:
            fp += 1

        precision = tp / max(1, tp + fp)
        recall = tp / positives
        if precision >= min_precision and recall > best:
            best = recall

    return float(best)


def brier_score(labels, probs):
    if labels.size == 0 or labels.size != probs.size:
        return 0.0
    return float(np.mean((labels - np.clip(probs, 0.0, 1.0)) ** 2))


def expected_calibration_error(labels, probs, bins=10):
    if labels.size == 0 or labels.size != probs.size:
        return 0.0

    probs = np.clip(probs, 0.0, 1.0)
    ece = 0.0
    n = float(labels.size)

    for idx in range(bins):
        left = idx / bins
        right = (idx + 1) / bins
        if idx == bins - 1:
            mask = (probs >= left) & (probs <= right)
        else:
            mask = (probs >= left) & (probs < right)

        count = int(np.sum(mask))
        if count == 0:
            continue

        acc = float(np.mean(labels[mask]))
        conf = float(np.mean(probs[mask]))
        ece += (count / n) * abs(acc - conf)

    return float(ece)


def evaluate_classification_metrics(labels, probs):
    return {
        "auc_pr": _round(auc_pr(labels, probs)),
        "recall_at_precision_90": _round(recall_at_precision(labels, probs, 0.9)),
        "brier_calibrated": _round(brier_score(labels, probs)),
        "ece_calibrated": _round(expected_calibration_error(labels, probs, 10)),
    }


def simulate_business_outcome(labels, probs, exposures, threshold, missed_good_cost_rate):
    if labels.size == 0:
        return {
            "high_risk_flags": 0,
            "prevented_bad_debt": 0.0,
            "leaked_bad_debt": 0.0,
            "missed_good_customers": 0,
            "missed_good_exposure": 0.0,
            "opportunity_cost": 0.0,
            "net_business_value": 0.0,
            "false_positive_rate": 0.0,
        }

    flags = probs >= threshold
    goods = labels == 0
    bads = labels == 1

    prevented_bad_debt = float(np.sum(np.where(flags & bads, exposures, 0.0)))
    leaked_bad_debt = float(np.sum(np.where((~flags) & bads, exposures, 0.0)))
    missed_good_customers = int(np.sum(flags & goods))
    missed_good_exposure = float(np.sum(np.where(flags & goods, exposures, 0.0)))
    opportunity_cost = missed_good_exposure * float(missed_good_cost_rate)
    net_business_value = prevented_bad_debt - opportunity_cost

    total_goods = max(1, int(np.sum(goods)))
    false_positive_rate = missed_good_customers / float(total_goods)

    return {
        "high_risk_flags": int(np.sum(flags)),
        "prevented_bad_debt": _round(prevented_bad_debt, 2),
        "leaked_bad_debt": _round(leaked_bad_debt, 2),
        "missed_good_customers": missed_good_customers,
        "missed_good_exposure": _round(missed_good_exposure, 2),
        "opportunity_cost": _round(opportunity_cost, 2),
        "net_business_value": _round(net_business_value, 2),
        "false_positive_rate": _round(false_positive_rate),
    }


def train_and_predict_champion(x_train, y_train, x_test):
    mean, std = fit_standard_scaler(x_train)
    train_scaled = transform_with_scaler(x_train, mean, std)
    test_scaled = transform_with_scaler(x_test, mean, std)

    fitted = train_monotonic_logistic(train_scaled, y_train)
    train_logits = compute_logits(train_scaled, fitted["weights"], fitted["intercept"])
    calibration = fit_platt_scaling(train_logits, y_train)

    test_logits = compute_logits(test_scaled, fitted["weights"], fitted["intercept"])
    test_probs = apply_platt_scaling(test_logits, calibration)

    return np.clip(test_probs, 0.0, 1.0)


def train_and_predict_challenger(x_train, y_train, x_test):
    model = lgb.LGBMClassifier(**CHALLENGER_CONFIG)
    model.fit(x_train, y_train)

    raw_train = model.predict(x_train, raw_score=True)
    calibration = fit_platt_scaling(raw_train, y_train)

    raw_test = model.predict(x_test, raw_score=True)
    test_probs = apply_platt_scaling(raw_test, calibration)
    return np.clip(test_probs, 0.0, 1.0)


def make_rolling_windows(total_rows, train_size, test_size, step_size):
    windows = []
    start = 0

    while start + train_size + test_size <= total_rows:
        windows.append(
            {
                "train_start": start,
                "train_end": start + train_size,
                "test_start": start + train_size,
                "test_end": start + train_size + test_size,
            }
        )
        start += step_size

    return windows


def build_segment_masks(x, thresholds):
    idx_depth = FEATURE_KEYS.index("transaction_depth")
    idx_volatility = FEATURE_KEYS.index("payment_volatility")
    idx_due = FEATURE_KEYS.index("due_amount")
    idx_delay = FEATURE_KEYS.index("avg_delay_days")

    depth = x[:, idx_depth]
    volatility = x[:, idx_volatility]
    due = x[:, idx_due]
    delay = x[:, idx_delay]

    sparse = depth < float(thresholds["sparse_history_max_depth"])
    rich_volatile = (depth >= float(thresholds["rich_history_min_depth"])) & (
        volatility >= float(thresholds["high_volatility_min"])
    )
    normal = (~sparse) & (~rich_volatile)

    return {
        "sparse_history": sparse,
        "normal_history": normal,
        "rich_volatile": rich_volatile,
        "high_due_amount": due >= float(thresholds["high_due_amount_min"]),
        "high_delay": delay >= float(thresholds["high_delay_min_days"]),
    }


def load_or_bootstrap_gates(gates_path):
    if gates_path.exists():
        payload = json.loads(gates_path.read_text(encoding="utf-8"))
        return payload

    gates_path.parent.mkdir(parents=True, exist_ok=True)
    gates_path.write_text(json.dumps(DEFAULT_PROMOTION_GATES, indent=2) + "\n", encoding="utf-8")
    return DEFAULT_PROMOTION_GATES


def evaluate_segment_window(segment_name, segment_mask, y_test, champion_probs, challenger_probs, exposures, gates, min_samples, min_positives):
    idx = np.where(segment_mask)[0]
    if idx.size < min_samples:
        return {
            "segment": segment_name,
            "evaluated": False,
            "reason": "INSUFFICIENT_SAMPLES",
            "sample_count": int(idx.size),
        }

    y_segment = y_test[idx]
    positives = int(np.sum(y_segment == 1))
    if positives < min_positives:
        return {
            "segment": segment_name,
            "evaluated": False,
            "reason": "INSUFFICIENT_POSITIVE_LABELS",
            "sample_count": int(idx.size),
            "positives": positives,
        }

    cp = champion_probs[idx]
    xp = challenger_probs[idx]
    segment_exposure = exposures[idx]

    champion_metrics = evaluate_classification_metrics(y_segment, cp)
    challenger_metrics = evaluate_classification_metrics(y_segment, xp)

    business_policy = gates["business_policy"]
    champion_business = simulate_business_outcome(
        y_segment,
        cp,
        segment_exposure,
        float(business_policy["high_risk_threshold"]),
        float(business_policy["missed_good_cost_rate"]),
    )
    challenger_business = simulate_business_outcome(
        y_segment,
        xp,
        segment_exposure,
        float(business_policy["high_risk_threshold"]),
        float(business_policy["missed_good_cost_rate"]),
    )

    net_base = max(1.0, abs(float(champion_business["net_business_value"])))
    business_gain_pct = (float(challenger_business["net_business_value"]) - float(champion_business["net_business_value"])) / net_base

    deltas = {
        "delta_auc_pr": _round(challenger_metrics["auc_pr"] - champion_metrics["auc_pr"]),
        "delta_recall_at_precision_90": _round(
            challenger_metrics["recall_at_precision_90"] - champion_metrics["recall_at_precision_90"]
        ),
        "delta_brier": _round(challenger_metrics["brier_calibrated"] - champion_metrics["brier_calibrated"]),
        "delta_ece": _round(challenger_metrics["ece_calibrated"] - champion_metrics["ece_calibrated"]),
        "business_gain_pct": _round(business_gain_pct),
        "false_positive_rate_increase": _round(
            float(challenger_business["false_positive_rate"]) - float(champion_business["false_positive_rate"])
        ),
    }

    segment_gate = gates["segments"].get(segment_name, gates["segments"]["default"])
    stat_lift_ok = (
        deltas["delta_auc_pr"] >= float(segment_gate["min_auc_pr_gain"])
        or deltas["delta_recall_at_precision_90"] >= float(segment_gate["min_recall_gain"])
    )
    calibration_ok = (
        deltas["delta_brier"] <= float(segment_gate["max_brier_degradation"])
        and deltas["delta_ece"] <= float(segment_gate["max_ece_degradation"])
    )
    business_ok = (
        deltas["business_gain_pct"] >= float(segment_gate["min_business_gain_pct"])
        and deltas["false_positive_rate_increase"] <= float(segment_gate["max_false_positive_increase"])
    )

    return {
        "segment": segment_name,
        "evaluated": True,
        "sample_count": int(idx.size),
        "positives": positives,
        "negatives": int(idx.size - positives),
        "champion": {
            "metrics": champion_metrics,
            "business": champion_business,
        },
        "challenger": {
            "metrics": challenger_metrics,
            "business": challenger_business,
        },
        "deltas": deltas,
        "window_gate_checks": {
            "stat_lift_ok": stat_lift_ok,
            "calibration_ok": calibration_ok,
            "business_ok": business_ok,
            "window_pass": stat_lift_ok and calibration_ok and business_ok,
        },
    }


def aggregate_segment_results(segment_name, window_entries, gates):
    evaluated = [entry for entry in window_entries if entry.get("evaluated")]
    skipped = [entry for entry in window_entries if not entry.get("evaluated")]

    segment_gate = gates["segments"].get(segment_name, gates["segments"]["default"])
    global_gate = gates["global"]

    if not evaluated:
        return {
            "segment": segment_name,
            "evaluated_windows": 0,
            "skipped_windows": len(skipped),
            "promotion_decision": {
                "status": "KEEP_CHAMPION",
                "promoted": False,
                "reason": "No eligible windows for evaluation.",
            },
        }

    pass_count = sum(1 for entry in evaluated if entry["window_gate_checks"]["window_pass"])
    pass_ratio = pass_count / float(len(evaluated))

    delta_auc = [entry["deltas"]["delta_auc_pr"] for entry in evaluated]
    delta_recall = [entry["deltas"]["delta_recall_at_precision_90"] for entry in evaluated]
    delta_brier = [entry["deltas"]["delta_brier"] for entry in evaluated]
    delta_ece = [entry["deltas"]["delta_ece"] for entry in evaluated]
    business_gain = [entry["deltas"]["business_gain_pct"] for entry in evaluated]
    fp_increase = [entry["deltas"]["false_positive_rate_increase"] for entry in evaluated]

    avg_delta_auc = statistics.mean(delta_auc)
    avg_delta_recall = statistics.mean(delta_recall)
    avg_delta_brier = statistics.mean(delta_brier)
    avg_delta_ece = statistics.mean(delta_ece)
    avg_business_gain = statistics.mean(business_gain)
    avg_fp_increase = statistics.mean(fp_increase)

    aggregate_stat_ok = (
        avg_delta_auc >= float(segment_gate["min_auc_pr_gain"])
        or avg_delta_recall >= float(segment_gate["min_recall_gain"])
    )
    aggregate_calibration_ok = (
        avg_delta_brier <= float(segment_gate["max_brier_degradation"])
        and avg_delta_ece <= float(segment_gate["max_ece_degradation"])
    )
    aggregate_business_ok = (
        avg_business_gain >= float(segment_gate["min_business_gain_pct"])
        and avg_fp_increase <= float(segment_gate["max_false_positive_increase"])
    )

    has_enough_windows = len(evaluated) >= int(global_gate["min_windows_required"])
    is_stable = pass_ratio >= float(global_gate["min_consistent_pass_ratio"])

    promoted = has_enough_windows and is_stable and aggregate_stat_ok and aggregate_calibration_ok and aggregate_business_ok

    reasons = []
    if not has_enough_windows:
        reasons.append("Insufficient evaluated windows for stable decision.")
    if not is_stable:
        reasons.append("Window-level lift is not consistent enough.")
    if not aggregate_stat_ok:
        reasons.append("Statistical lift thresholds are not met.")
    if not aggregate_calibration_ok:
        reasons.append("Calibration degradation exceeds gate limits.")
    if not aggregate_business_ok:
        reasons.append("Business gain thresholds are not met.")

    if promoted:
        reasons = ["Challenger meets statistical, calibration, business, and stability gates."]

    return {
        "segment": segment_name,
        "evaluated_windows": len(evaluated),
        "skipped_windows": len(skipped),
        "window_pass_count": pass_count,
        "window_pass_ratio": _round(pass_ratio),
        "aggregate_deltas": {
            "avg_delta_auc_pr": _round(avg_delta_auc),
            "avg_delta_recall_at_precision_90": _round(avg_delta_recall),
            "avg_delta_brier": _round(avg_delta_brier),
            "avg_delta_ece": _round(avg_delta_ece),
            "avg_business_gain_pct": _round(avg_business_gain),
            "avg_false_positive_rate_increase": _round(avg_fp_increase),
        },
        "gate_checks": {
            "has_enough_windows": has_enough_windows,
            "is_stable": is_stable,
            "aggregate_stat_lift_ok": aggregate_stat_ok,
            "aggregate_calibration_ok": aggregate_calibration_ok,
            "aggregate_business_ok": aggregate_business_ok,
        },
        "promotion_decision": {
            "status": "PROMOTED" if promoted else "KEEP_CHAMPION",
            "promoted": promoted,
            "reason": " ".join(reasons),
            "applied_gate": segment_gate,
        },
    }


def to_markdown(report):
    lines = []
    lines.append("# Trust Model Backtesting and Promotion Report (Phase 7)")
    lines.append("")
    lines.append(f"- Generated at: {report['metadata']['generated_at']}")
    lines.append(f"- Dataset source: {report['metadata']['dataset_source']}")
    lines.append(f"- Windows evaluated: {report['metadata']['window_count']}")
    lines.append(f"- Gate version: {report['promotion_gates']['version']}")
    lines.append("")
    lines.append("## Segment Decisions")
    lines.append("")

    for segment_name, summary in report["segment_summary"].items():
        decision = summary["promotion_decision"]
        deltas = summary.get("aggregate_deltas", {})
        lines.append(f"### {segment_name}")
        lines.append(f"- Decision: {decision['status']}")
        lines.append(f"- Reason: {decision['reason']}")
        lines.append(f"- Evaluated windows: {summary.get('evaluated_windows', 0)}")
        lines.append(f"- Window pass ratio: {summary.get('window_pass_ratio', 0)}")
        if deltas:
            lines.append(f"- Avg delta AUC-PR: {deltas.get('avg_delta_auc_pr', 0)}")
            lines.append(
                f"- Avg delta Recall@P90: {deltas.get('avg_delta_recall_at_precision_90', 0)}"
            )
            lines.append(f"- Avg business gain: {deltas.get('avg_business_gain_pct', 0)}")
            lines.append(f"- Avg delta Brier: {deltas.get('avg_delta_brier', 0)}")
            lines.append(f"- Avg delta ECE: {deltas.get('avg_delta_ece', 0)}")
        lines.append("")

    return "\n".join(lines) + "\n"


def ensure_parent(path_obj):
    path_obj.parent.mkdir(parents=True, exist_ok=True)


def main():
    root_dir = pathlib.Path(__file__).resolve().parents[3]
    dataset_arg = sys.argv[1] if len(sys.argv) > 1 else (os.getenv("TRUST_TRAINING_DATASET_PATH", "") or "")

    rows, dataset_source = load_dataset(dataset_arg)
    sorted_rows, x, y, timestamps = build_sorted_matrix(rows)

    if x.shape[0] == 0:
        raise ValueError("No rows available for backtesting.")

    gates_path = root_dir / OUTPUT_PATHS["gates"]
    gates = load_or_bootstrap_gates(gates_path)

    rolling_cfg = DEFAULT_ROLLING_WINDOW_CONFIG
    windows = make_rolling_windows(
        total_rows=x.shape[0],
        train_size=int(rolling_cfg["train_size"]),
        test_size=int(rolling_cfg["test_size"]),
        step_size=int(rolling_cfg["step_size"]),
    )

    if not windows:
        raise ValueError("No rolling windows were created. Increase dataset size or reduce window sizes.")

    segment_window_results = {
        "sparse_history": [],
        "normal_history": [],
        "rich_volatile": [],
        "high_due_amount": [],
        "high_delay": [],
    }

    windows_report = []
    exposure_index = FEATURE_KEYS.index(gates["business_policy"].get("exposure_feature", "due_amount"))

    for window_id, window in enumerate(windows, start=1):
        train_slice = slice(window["train_start"], window["train_end"])
        test_slice = slice(window["test_start"], window["test_end"])

        x_train = x[train_slice]
        y_train = y[train_slice]
        x_test = x[test_slice]
        y_test = y[test_slice]

        champion_probs = train_and_predict_champion(x_train, y_train, x_test)
        challenger_probs = train_and_predict_challenger(x_train, y_train, x_test)
        exposures = np.maximum(1.0, x_test[:, exposure_index])

        segment_masks = build_segment_masks(x_test, DEFAULT_SEGMENT_THRESHOLDS)

        segment_entries = {}
        for segment_name, mask in segment_masks.items():
            result = evaluate_segment_window(
                segment_name=segment_name,
                segment_mask=mask,
                y_test=y_test,
                champion_probs=champion_probs,
                challenger_probs=challenger_probs,
                exposures=exposures,
                gates=gates,
                min_samples=int(rolling_cfg["min_segment_samples_per_window"]),
                min_positives=int(gates["global"]["min_positive_labels_per_window"]),
            )
            segment_entries[segment_name] = result
            segment_window_results[segment_name].append(result)

        windows_report.append(
            {
                "window_id": window_id,
                "train_range": {
                    "start_index": window["train_start"],
                    "end_index": window["train_end"] - 1,
                    "start_time": timestamps[window["train_start"]] if window["train_start"] < len(timestamps) else "",
                    "end_time": timestamps[window["train_end"] - 1] if (window["train_end"] - 1) < len(timestamps) else "",
                },
                "test_range": {
                    "start_index": window["test_start"],
                    "end_index": window["test_end"] - 1,
                    "start_time": timestamps[window["test_start"]] if window["test_start"] < len(timestamps) else "",
                    "end_time": timestamps[window["test_end"] - 1] if (window["test_end"] - 1) < len(timestamps) else "",
                },
                "segment_results": segment_entries,
            }
        )

    segment_summary = {}
    for segment_name, entries in segment_window_results.items():
        segment_summary[segment_name] = aggregate_segment_results(segment_name, entries, gates)

    decisions = {
        segment: {
            "status": summary["promotion_decision"]["status"],
            "promoted": summary["promotion_decision"]["promoted"],
            "reason": summary["promotion_decision"]["reason"],
            "evaluated_windows": summary.get("evaluated_windows", 0),
            "window_pass_ratio": summary.get("window_pass_ratio", 0),
        }
        for segment, summary in segment_summary.items()
    }

    report = {
        "metadata": {
            "phase": "phase_7",
            "script_version": SCRIPT_VERSION,
            "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "dataset_source": dataset_source,
            "total_rows": int(x.shape[0]),
            "window_count": len(windows_report),
            "temporal_sorting": "ascending_by_score_time",
            "leakage_prevention": "Each window trains on past rows and tests only on future rows.",
        },
        "rolling_window_config": rolling_cfg,
        "segment_thresholds": DEFAULT_SEGMENT_THRESHOLDS,
        "promotion_gates": gates,
        "windows": windows_report,
        "segment_summary": segment_summary,
        "promotion_decisions": decisions,
    }

    decisions_artifact = {
        "gate_version": gates.get("version", "unknown"),
        "generated_at": report["metadata"]["generated_at"],
        "dataset_source": dataset_source,
        "promoted_segments": [name for name, data in decisions.items() if data["promoted"]],
        "segment_decisions": decisions,
    }

    report_json_path = root_dir / OUTPUT_PATHS["report_json"]
    report_md_path = root_dir / OUTPUT_PATHS["report_md"]
    decisions_json_path = root_dir / OUTPUT_PATHS["decisions_json"]
    frontend_decisions_json_path = root_dir / OUTPUT_PATHS["frontend_decisions_json"]
    frontend_decisions_js_path = root_dir / OUTPUT_PATHS["frontend_decisions_js"]

    for path_obj in [
        report_json_path,
        report_md_path,
        decisions_json_path,
        frontend_decisions_json_path,
        frontend_decisions_js_path,
        gates_path,
    ]:
        ensure_parent(path_obj)

    report_json_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    report_md_path.write_text(to_markdown(report), encoding="utf-8")
    decisions_json_path.write_text(json.dumps(decisions_artifact, indent=2) + "\n", encoding="utf-8")
    frontend_decisions_json_path.write_text(json.dumps(decisions_artifact, indent=2) + "\n", encoding="utf-8")
    frontend_decisions_js_path.write_text(
        "export const TRUST_SEGMENT_PROMOTION = " + json.dumps(decisions_artifact, indent=2) + ";\n",
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "gate_version": gates.get("version", "unknown"),
                "report": str(report_json_path.resolve()),
                "report_markdown": str(report_md_path.resolve()),
                "decisions": str(decisions_json_path.resolve()),
                "frontend_decisions": str(frontend_decisions_json_path.resolve()),
                "promoted_segments": decisions_artifact["promoted_segments"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
