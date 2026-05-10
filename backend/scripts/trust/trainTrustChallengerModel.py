import json
import math
import os
import pathlib
import statistics
import sys
from bisect import bisect_left
from datetime import datetime, timezone, timedelta

import lightgbm as lgb
import numpy as np

VERSION = "1.0.0"

FEATURE_KEYS = [
    "due_amount",
    "late_count",
    "avg_delay_days",
    "transaction_depth",
    "recency_days",
    "payment_consistency",
    "payment_volatility",
]

CHALLENGER_CONFIG = {
    "objective": "binary",
    "max_depth": 4,
    "num_leaves": 16,
    "n_estimators": 80,
    "learning_rate": 0.08,
    "min_child_samples": 12,
    "subsample": 0.9,
    "colsample_bytree": 0.9,
    "reg_alpha": 0.0,
    "reg_lambda": 1.0,
    "random_state": 1337,
}

OUTPUT_PATHS = {
    "backend_model_json": pathlib.Path("backend/artifacts/trustChallengerModel.v1.json"),
    "backend_model_txt": pathlib.Path("backend/artifacts/trustChallengerModel.v1.txt"),
    "backend_metrics": pathlib.Path("backend/artifacts/trustChallengerModel.metrics.v1.json"),
    "frontend_model_json": pathlib.Path("frontend/hisab-app/services/customers/models/trustChallengerModel.v1.json"),
    "frontend_model_js": pathlib.Path("frontend/hisab-app/services/customers/models/trustChallengerModel.v1.js"),
}


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _sigmoid(value: float) -> float:
    if value >= 0:
        z = math.exp(-value)
        return 1.0 / (1.0 + z)
    z = math.exp(value)
    return z / (1.0 + z)


def _round(value: float, digits: int = 6) -> float:
    if not math.isfinite(value):
        return 0.0
    return round(float(value), digits)


def _seeded_rng(seed: int):
    # Deterministic generator to keep synthetic fallback aligned with champion pipeline.
    state = seed & 0xFFFFFFFF

    def _next() -> float:
        nonlocal state
        state = (1664525 * state + 1013904223) & 0xFFFFFFFF
        return state / float(0xFFFFFFFF)

    return _next


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


def build_synthetic_dataset(count: int = 260, seed: int = 1337):
    rng = _seeded_rng(seed)
    rows = []
    base_date = datetime(2025, 1, 1, tzinfo=timezone.utc)

    for i in range(count):
        due_amount = _round((rng() ** 2) * 12000, 2)
        late_count = int(math.floor(rng() * 6))
        avg_delay_days = _round(rng() * 35, 3)
        transaction_depth = int(math.floor(rng() * 35))
        recency_days = _round(rng() * 60, 3)
        payment_consistency = _round(0.25 + rng() * 0.75, 4)
        payment_volatility = _round(rng() * 120, 3)

        latent = (
            -2.05
            + 0.00025 * due_amount
            + 0.42 * late_count
            + 0.048 * avg_delay_days
            - 0.05 * transaction_depth
            + 0.03 * recency_days
            - 1.65 * payment_consistency
            + 0.006 * payment_volatility
            + (rng() - 0.5) * 0.15
        )

        probability = _sigmoid(latent)
        label = 1 if rng() <= probability else 0

        timestamp = (base_date + timedelta(days=i)).isoformat().replace("+00:00", "Z")
        rows.append(
            {
                "score_time": timestamp,
                "due_amount": due_amount,
                "late_count": late_count,
                "avg_delay_days": avg_delay_days,
                "transaction_depth": transaction_depth,
                "recency_days": recency_days,
                "payment_consistency": payment_consistency,
                "payment_volatility": payment_volatility,
                "label": label,
            }
        )

    return rows


def _load_dataset(path_arg: str):
    if path_arg and pathlib.Path(path_arg).exists():
        with open(path_arg, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        if not isinstance(payload, list):
            raise ValueError("Dataset JSON must be an array.")
        return payload, str(pathlib.Path(path_arg).resolve())

    if not _can_use_synthetic_dataset():
        raise ValueError(
            "No training dataset was provided. Set TRUST_TRAINING_DATASET_PATH (or pass dataset path as CLI argument). "
            "Synthetic fallback is blocked when NODE_ENV=production or TRUST_REQUIRE_REAL_DATASET=true."
        )

    return build_synthetic_dataset(), "synthetic_seed_1337"


def _as_timestamp(row):
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
    value = row.get("label", row.get("target", row.get("default_60d", row.get("target_default_60d", 0))))
    return 1 if str(value) in ("1", "True", "true") or value is True or value == 1 else 0


def _feature_value(row, key):
    if isinstance(row.get("features"), dict):
        return float(row["features"].get(key, 0.0))
    return float(row.get(key, 0.0))


def build_matrix(rows):
    sorted_rows = sorted(rows, key=_as_timestamp)
    x = np.array([[ _feature_value(row, key) for key in FEATURE_KEYS ] for row in sorted_rows], dtype=np.float64)
    y = np.array([_extract_label(row) for row in sorted_rows], dtype=np.int64)
    return sorted_rows, x, y


def make_temporal_folds(n_samples: int, fold_count: int = 5):
    fold_count = max(2, min(fold_count, n_samples))
    fold_size = max(1, n_samples // fold_count)

    folds = []
    for i in range(fold_count):
        start = i * fold_size
        end = n_samples if i == fold_count - 1 else min(n_samples, (i + 1) * fold_size)
        if start >= end:
            continue

        val_idx = np.arange(start, end)
        train_idx = np.concatenate((np.arange(0, start), np.arange(end, n_samples)))
        if train_idx.size and val_idx.size:
            folds.append((train_idx, val_idx))

    return folds


def fit_platt_scaling(logits: np.ndarray, labels: np.ndarray, epochs: int = 1200, learning_rate: float = 0.03, l2: float = 0.0005):
    if logits.size == 0 or labels.size != logits.size:
        return {"a": 1.0, "b": 0.0}

    a = 1.0
    b = 0.0
    n = float(logits.size)

    for _ in range(epochs):
        z = a * logits + b
        probs = np.array([_sigmoid(v) for v in z], dtype=np.float64)
        errors = probs - labels

        grad_a = float(np.dot(errors, logits) / n + l2 * a)
        grad_b = float(np.sum(errors) / n)

        a -= learning_rate * grad_a
        b -= learning_rate * grad_b

        if a < 0:
            a = 0.0

    return {"a": float(a), "b": float(b)}


def apply_platt_scaling(logits: np.ndarray, calibration):
    a = float(calibration.get("a", 1.0))
    b = float(calibration.get("b", 0.0))
    return np.array([_sigmoid(a * v + b) for v in logits], dtype=np.float64)


def apply_probability_blend(probs: np.ndarray, alpha: float, base_rate: float):
    alpha = float(_clamp(alpha, 0.0, 1.0))
    base_rate = float(_clamp(base_rate, 1e-6, 1.0 - 1e-6))
    clipped = np.clip(probs, 1e-6, 1.0 - 1e-6)
    return np.clip((alpha * clipped) + ((1.0 - alpha) * base_rate), 1e-6, 1.0 - 1e-6)


def fit_probability_blend(labels: np.ndarray, probs: np.ndarray, target_ece: float = 0.06, max_brier_increase: float = 0.01):
    if labels.size == 0 or labels.size != probs.size:
        return {
            "alpha": 1.0,
            "base_rate": 0.5,
        }

    base_rate = float(_clamp(float(np.mean(labels)), 1e-6, 1.0 - 1e-6))
    base_probs = np.clip(probs, 1e-6, 1.0 - 1e-6)
    baseline_ece = expected_calibration_error(labels, base_probs, 10)
    baseline_brier = brier_score(labels, base_probs)

    best_passing = None
    best_fallback = {
        "alpha": 1.0,
        "base_rate": base_rate,
        "ece": baseline_ece,
        "brier": baseline_brier,
    }

    for step in range(100, -1, -1):
        alpha = step / 100.0
        blended = apply_probability_blend(base_probs, alpha, base_rate)
        next_ece = expected_calibration_error(labels, blended, 10)
        next_brier = brier_score(labels, blended)

        candidate = {
            "alpha": alpha,
            "base_rate": base_rate,
            "ece": next_ece,
            "brier": next_brier,
        }

        brier_ok = next_brier <= (baseline_brier + max_brier_increase)
        if next_ece <= target_ece and brier_ok:
            if best_passing is None or candidate["alpha"] > best_passing["alpha"]:
                best_passing = candidate
            continue

        if (
            candidate["ece"] < best_fallback["ece"]
            or (
                abs(candidate["ece"] - best_fallback["ece"]) < 1e-12
                and candidate["brier"] < best_fallback["brier"]
            )
        ):
            best_fallback = candidate

    selected = best_passing or best_fallback
    return {
        "alpha": float(selected["alpha"]),
        "base_rate": float(selected["base_rate"]),
    }


def fit_isotonic_regression(scores: np.ndarray, labels: np.ndarray):
    if scores.size == 0 or labels.size != scores.size:
        return {
            "x_thresholds": [0.0, 1.0],
            "y_values": [0.5, 0.5],
        }

    pairs = sorted(zip(scores.tolist(), labels.tolist()), key=lambda pair: pair[0])
    blocks = []
    for score, label in pairs:
        blocks.append({
            "count": 1,
            "sum": float(label),
            "score_min": float(score),
            "score_max": float(score),
        })

        while len(blocks) >= 2:
            prev = blocks[-2]
            cur = blocks[-1]
            prev_mean = prev["sum"] / prev["count"]
            cur_mean = cur["sum"] / cur["count"]
            if prev_mean <= cur_mean:
                break

            merged = {
                "count": prev["count"] + cur["count"],
                "sum": prev["sum"] + cur["sum"],
                "score_min": prev["score_min"],
                "score_max": cur["score_max"],
            }
            blocks[-2:] = [merged]

    x_thresholds = []
    y_values = []
    for block in blocks:
        x_thresholds.append(float(block["score_max"]))
        y_values.append(float(block["sum"] / block["count"]))

    if x_thresholds[0] > 0.0:
        x_thresholds.insert(0, 0.0)
        y_values.insert(0, y_values[0])
    if x_thresholds[-1] < 1.0:
        x_thresholds.append(1.0)
        y_values.append(y_values[-1])

    return {
        "x_thresholds": [float(_round(x, 6)) for x in x_thresholds],
        "y_values": [float(_round(_clamp(y, 0.0, 1.0), 6)) for y in y_values],
    }


def apply_isotonic_regression(scores: np.ndarray, isotonic):
    thresholds = isotonic.get("x_thresholds", [])
    values = isotonic.get("y_values", [])
    if not thresholds or not values or len(thresholds) != len(values):
        return np.clip(scores, 0.0, 1.0)

    output = np.zeros((scores.size,), dtype=np.float64)
    for index, score in enumerate(scores.tolist()):
        clipped = float(_clamp(score, 0.0, 1.0))
        pos = bisect_left(thresholds, clipped)
        if pos >= len(values):
            pos = len(values) - 1
        output[index] = float(_clamp(values[pos], 0.0, 1.0))

    return output


def brier_score(labels: np.ndarray, probs: np.ndarray):
    if labels.size == 0 or labels.size != probs.size:
        return 0.0
    return float(np.mean((labels - np.clip(probs, 0.0, 1.0)) ** 2))


def expected_calibration_error(labels: np.ndarray, probs: np.ndarray, bins: int = 10):
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


def auc_pr(labels: np.ndarray, probs: np.ndarray):
    if labels.size == 0 or labels.size != probs.size:
        return 0.0

    pairs = sorted(zip(probs.tolist(), labels.tolist()), key=lambda pair: pair[0], reverse=True)
    positives = sum(1 for _, label in pairs if label == 1)
    if positives == 0:
        return 0.0

    tp = 0
    fp = 0
    prev_recall = 0.0
    area = 0.0

    for prob, label in pairs:
        if label == 1:
            tp += 1
        else:
            fp += 1

        recall = tp / positives
        precision = tp / max(1, tp + fp)
        area += (recall - prev_recall) * precision
        prev_recall = recall

    return float(area)


def recall_at_precision(labels: np.ndarray, probs: np.ndarray, min_precision: float = 0.9):
    if labels.size == 0 or labels.size != probs.size:
        return 0.0

    pairs = sorted(zip(probs.tolist(), labels.tolist()), key=lambda pair: pair[0], reverse=True)
    positives = sum(1 for _, label in pairs if label == 1)
    if positives == 0:
        return 0.0

    tp = 0
    fp = 0
    best = 0.0

    for prob, label in pairs:
        if label == 1:
            tp += 1
        else:
            fp += 1

        precision = tp / max(1, tp + fp)
        recall = tp / positives
        if precision >= min_precision and recall > best:
            best = recall

    return float(best)


def policy_loss(labels: np.ndarray, probs: np.ndarray, exposures: np.ndarray, risk_threshold: float = 0.7):
    approved = probs < risk_threshold
    bad_exposure = np.where(labels == 1, exposures, 0.0)
    total_bad = float(np.sum(bad_exposure))
    if total_bad <= 0:
        return 0.0
    leaked = float(np.sum(np.where(approved, bad_exposure, 0.0)))
    return leaked / total_bad


def summarize_metrics(labels: np.ndarray, raw_probs: np.ndarray, calibrated_probs: np.ndarray):
    return {
        "auc_pr": _round(auc_pr(labels, calibrated_probs)),
        "recall_at_precision_90": _round(recall_at_precision(labels, calibrated_probs, 0.9)),
        "brier_raw": _round(brier_score(labels, raw_probs)),
        "brier_calibrated": _round(brier_score(labels, calibrated_probs)),
        "ece_calibrated": _round(expected_calibration_error(labels, calibrated_probs, 10)),
    }


def load_champion_model(root_dir: pathlib.Path):
    champion_path = root_dir / "backend" / "artifacts" / "trustChampionModel.v1.json"
    with open(champion_path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def predict_champion_probabilities(champion_model, x: np.ndarray):
    intercept = float(champion_model.get("intercept", 0.0))
    coefficients = champion_model.get("coefficients", {})
    feature_order = champion_model.get("feature_order", FEATURE_KEYS)

    linear = np.full((x.shape[0],), intercept, dtype=np.float64)
    for index, key in enumerate(feature_order):
        coef = float(coefficients.get(key, 0.0))
        linear += x[:, index] * coef

    calibration = champion_model.get("calibration", {})
    a = float(calibration.get("a", 1.0))
    b = float(calibration.get("b", 0.0))

    calibrated = np.array([_sigmoid(a * v + b) for v in linear], dtype=np.float64)
    return np.clip(calibrated, 0.0, 1.0)


def segment_masks(x: np.ndarray):
    payment_consistency = x[:, FEATURE_KEYS.index("payment_consistency")]
    late_count = x[:, FEATURE_KEYS.index("late_count")]
    avg_delay_days = x[:, FEATURE_KEYS.index("avg_delay_days")]
    payment_volatility = x[:, FEATURE_KEYS.index("payment_volatility")]

    irregular = (payment_consistency < 0.55) | (late_count >= 3.0) | (avg_delay_days >= 12.0)
    p75 = float(np.percentile(payment_volatility, 75))
    high_volatility = payment_volatility >= p75

    return {
        "irregular_payment_patterns": irregular,
        "high_volatility_users": high_volatility,
    }


def segment_comparison(labels: np.ndarray, champion_probs: np.ndarray, challenger_probs: np.ndarray, masks):
    report = {}
    for name, mask in masks.items():
        idx = np.where(mask)[0]
        if idx.size == 0:
            report[name] = {"samples": 0}
            continue

        y = labels[idx]
        cp = champion_probs[idx]
        xp = challenger_probs[idx]

        report[name] = {
            "samples": int(idx.size),
            "champion": {
                "auc_pr": _round(auc_pr(y, cp)),
                "brier": _round(brier_score(y, cp)),
                "recall_at_precision_90": _round(recall_at_precision(y, cp, 0.9)),
            },
            "challenger": {
                "auc_pr": _round(auc_pr(y, xp)),
                "brier": _round(brier_score(y, xp)),
                "recall_at_precision_90": _round(recall_at_precision(y, xp, 0.9)),
            },
        }

    return report


def build_model_artifact(trained, dataset_source: str):
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "model_name": "hisab_trust_challenger",
        "version": VERSION,
        "created_at": now,
        "method": "lightgbm_shallow_challenger",
        "enabled_default": False,
        "dataset_source": dataset_source,
        "feature_order": FEATURE_KEYS,
        "training_config": CHALLENGER_CONFIG,
        "calibration": {
            "method": trained["calibration"].get("method", "platt_scaling"),
            "a": _round(trained["calibration"]["a"]),
            "b": _round(trained["calibration"]["b"]),
            "blend_alpha": _round(trained["calibration"].get("blend_alpha", 1.0)),
            "base_rate": _round(trained["calibration"].get("base_rate", 0.5)),
            "x_thresholds": trained["calibration"].get("x_thresholds", []),
            "y_values": trained["calibration"].get("y_values", []),
        },
        "probability_thresholds": {
            "medium_risk_min": 0.4,
            "high_risk_min": 0.7,
        },
        "metrics": trained["challenger_metrics"],
        "comparison_vs_champion": trained["comparison"],
        "segment_analysis": trained["segment_analysis"],
        "model_dump": trained["model_dump"],
    }


def build_metrics_artifact(trained, dataset_source: str):
    return {
        "model_name": "hisab_trust_challenger",
        "version": VERSION,
        "dataset_source": dataset_source,
        "challenger_metrics": trained["challenger_metrics"],
        "champion_metrics": trained["champion_metrics"],
        "comparison_vs_champion": trained["comparison"],
        "segment_analysis": trained["segment_analysis"],
        "stability": trained["stability"],
    }


def ensure_parent(path_obj: pathlib.Path):
    path_obj.parent.mkdir(parents=True, exist_ok=True)


def write_outputs(root_dir: pathlib.Path, model_artifact, metrics_artifact, booster):
    for relative in OUTPUT_PATHS.values():
        ensure_parent(root_dir / relative)

    backend_model_json = root_dir / OUTPUT_PATHS["backend_model_json"]
    backend_model_txt = root_dir / OUTPUT_PATHS["backend_model_txt"]
    backend_metrics = root_dir / OUTPUT_PATHS["backend_metrics"]
    frontend_model_json = root_dir / OUTPUT_PATHS["frontend_model_json"]
    frontend_model_js = root_dir / OUTPUT_PATHS["frontend_model_js"]

    backend_model_json.write_text(json.dumps(model_artifact, indent=2) + "\n", encoding="utf-8")
    backend_metrics.write_text(json.dumps(metrics_artifact, indent=2) + "\n", encoding="utf-8")
    frontend_model_json.write_text(json.dumps(model_artifact, indent=2) + "\n", encoding="utf-8")
    frontend_model_js.write_text(
        f"export const TRUST_CHALLENGER_MODEL = {json.dumps(model_artifact, indent=2)};\n",
        encoding="utf-8",
    )

    booster.save_model(str(backend_model_txt))


def train_challenger(rows, root_dir: pathlib.Path):
    _, x, y = build_matrix(rows)
    if x.shape[0] == 0:
        raise ValueError("No rows provided for challenger training.")

    folds = make_temporal_folds(x.shape[0], 5)
    if not folds:
        raise ValueError("Unable to construct temporal folds for challenger training.")

    champion = load_champion_model(root_dir)
    champion_probs = predict_champion_probabilities(champion, x)

    oof_raw = np.zeros((x.shape[0],), dtype=np.float64)
    fold_scores = []

    for train_idx, val_idx in folds:
        x_train = x[train_idx]
        y_train = y[train_idx]
        x_val = x[val_idx]
        y_val = y[val_idx]

        model = lgb.LGBMClassifier(**CHALLENGER_CONFIG)
        model.fit(x_train, y_train)

        raw_val = model.predict(x_val, raw_score=True)
        probs_val = model.predict_proba(x_val)[:, 1]

        oof_raw[val_idx] = raw_val
        fold_scores.append(
            {
                "auc_pr": _round(auc_pr(y_val, probs_val)),
                "brier": _round(brier_score(y_val, probs_val)),
                "recall_at_precision_90": _round(recall_at_precision(y_val, probs_val, 0.9)),
            }
        )

    calibration = fit_platt_scaling(oof_raw, y)
    challenger_probs_oof = apply_platt_scaling(oof_raw, calibration)
    blend = fit_probability_blend(y, challenger_probs_oof, target_ece=0.06, max_brier_increase=0.01)

    challenger_model = lgb.LGBMClassifier(**CHALLENGER_CONFIG)
    challenger_model.fit(x, y)
    booster = challenger_model.booster_

    full_raw = challenger_model.predict(x, raw_score=True)
    full_probs_raw = challenger_model.predict_proba(x)[:, 1]
    isotonic = fit_isotonic_regression(full_probs_raw, y)
    platt_probs = apply_platt_scaling(full_raw, calibration)
    platt_blend_probs = apply_probability_blend(platt_probs, blend["alpha"], blend["base_rate"])
    isotonic_probs = apply_isotonic_regression(full_probs_raw, isotonic)

    platt_metrics = summarize_metrics(y, full_probs_raw, platt_blend_probs)
    isotonic_metrics = summarize_metrics(y, full_probs_raw, isotonic_probs)

    use_isotonic = (
        isotonic_metrics["ece_calibrated"] <= 0.06
        and isotonic_metrics["brier_calibrated"] <= 0.18
        and (
            platt_metrics["ece_calibrated"] > 0.06
            or isotonic_metrics["ece_calibrated"] < platt_metrics["ece_calibrated"]
        )
    )

    full_probs_cal = isotonic_probs if use_isotonic else platt_blend_probs

    calibration = {
        "method": "isotonic_regression" if use_isotonic else "platt_scaling",
        "a": float(calibration["a"]),
        "b": float(calibration["b"]),
        "blend_alpha": float(blend["alpha"]),
        "base_rate": float(blend["base_rate"]),
        "x_thresholds": isotonic.get("x_thresholds", []),
        "y_values": isotonic.get("y_values", []),
    }

    challenger_metrics = summarize_metrics(y, full_probs_raw, full_probs_cal)
    champion_metrics = {
        "auc_pr": _round(auc_pr(y, champion_probs)),
        "recall_at_precision_90": _round(recall_at_precision(y, champion_probs, 0.9)),
        "brier_calibrated": _round(brier_score(y, champion_probs)),
        "ece_calibrated": _round(expected_calibration_error(y, champion_probs, 10)),
    }

    exposures = x[:, FEATURE_KEYS.index("due_amount")] + 1.0
    champion_loss = policy_loss(y, champion_probs, exposures, 0.7)
    challenger_loss = policy_loss(y, full_probs_cal, exposures, 0.7)
    loss_reduction = 0.0
    if champion_loss > 0:
        loss_reduction = (champion_loss - challenger_loss) / champion_loss

    comparison = {
        "delta_auc_pr": _round(challenger_metrics["auc_pr"] - champion_metrics["auc_pr"]),
        "delta_recall_at_precision_90": _round(
            challenger_metrics["recall_at_precision_90"] - champion_metrics["recall_at_precision_90"]
        ),
        "delta_brier": _round(champion_metrics["brier_calibrated"] - challenger_metrics["brier_calibrated"]),
        "estimated_loss_reduction_vs_champion": _round(loss_reduction),
    }

    masks = segment_masks(x)
    segment_report = segment_comparison(y, champion_probs, full_probs_cal, masks)

    stability = {
        "folds": len(folds),
        "fold_metrics": fold_scores,
        "auc_pr_std": _round(statistics.pstdev([fold["auc_pr"] for fold in fold_scores])) if fold_scores else 0.0,
        "brier_std": _round(statistics.pstdev([fold["brier"] for fold in fold_scores])) if fold_scores else 0.0,
    }

    return {
        "model_dump": booster.dump_model(),
        "calibration": calibration,
        "challenger_metrics": challenger_metrics,
        "champion_metrics": champion_metrics,
        "comparison": comparison,
        "segment_analysis": segment_report,
        "stability": stability,
        "booster": booster,
    }


def main():
    root_dir = pathlib.Path(__file__).resolve().parents[3]
    dataset_arg = sys.argv[1] if len(sys.argv) > 1 else (os.getenv("TRUST_TRAINING_DATASET_PATH", "") or "")
    rows, dataset_source = _load_dataset(dataset_arg)

    trained = train_challenger(rows, root_dir)

    model_artifact = build_model_artifact(trained, dataset_source)
    metrics_artifact = build_metrics_artifact(trained, dataset_source)
    write_outputs(root_dir, model_artifact, metrics_artifact, trained["booster"])

    summary = {
        "model": str((root_dir / OUTPUT_PATHS["backend_model_json"]).resolve()),
        "metrics": str((root_dir / OUTPUT_PATHS["backend_metrics"]).resolve()),
        "frontend": str((root_dir / OUTPUT_PATHS["frontend_model_json"]).resolve()),
        "auc_pr": model_artifact["metrics"]["auc_pr"],
        "brier_calibrated": model_artifact["metrics"]["brier_calibrated"],
        "ece_calibrated": model_artifact["metrics"]["ece_calibrated"],
        "delta_auc_pr_vs_champion": model_artifact["comparison_vs_champion"]["delta_auc_pr"],
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
