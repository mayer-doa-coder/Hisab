import { createTrustRolloutController, TRUST_ROLLOUT_STAGES } from './trustRolloutControl.js';
import { createTrustMonitoringEngine } from './trustMonitoringEngine.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function pushRequests(engine, rows) {
  rows.forEach((row) => {
    engine.recordRequest(row);
  });
}

export function runTrustPhase8SelfTests() {
  const rolloutController = createTrustRolloutController({
    config: {
      enable_new_scoring: true,
      rollout_percentage: 5,
      rollout_stage: 'stage_1_canary',
      challenger_enabled: true,
      revert_target: 'champion',
    },
    logger: () => {},
  });

  const firstBucket = rolloutController.getUserBucket(12345);
  const secondBucket = rolloutController.getUserBucket(12345);
  assert(firstBucket === secondBucket, 'deterministic bucketing must be stable for same user');

  rolloutController.setRolloutStage('stage_2_limited');
  let rollout = rolloutController.getConfig();
  assert(rollout.rollout_percentage === 25, 'stage 2 rollout must be 25%');

  rolloutController.setRolloutStage('stage_3_expanded');
  rollout = rolloutController.getConfig();
  assert(rollout.rollout_percentage === 50, 'stage 3 rollout must be 50%');

  rolloutController.setRolloutStage('stage_4_full');
  rollout = rolloutController.getConfig();
  assert(rollout.rollout_percentage === 100, 'stage 4 rollout must be 100%');

  const monitorSegment = createTrustMonitoringEngine({
    rolloutController,
    guardrails: {
      min_samples_for_guardrails: 5,
      min_labeled_samples: 5,
      fallback_rate_max: 0.8,
      error_rate_max: 0.9,
      latency_ms_p95_max: 500,
      prediction_drift_psi_max: 1.0,
      feature_mean_shift_max: 10,
      feature_variance_shift_max: 10,
      brier_degradation_max: 1.0,
      calibration_shift_max: 1.0,
    },
    baseline: {
      performance: { brier_score: 0.5 },
      prediction_histogram: new Array(10).fill(0.1),
      feature_stats: {
        due_amount: { mean: 1000, variance: 50000 },
      },
    },
    logger: () => {},
  });

  const segmentRows = [
    { userId: 1, segmentKey: 'normal_history', selectedModel: 'champion', selectedMethod: 'LOGISTIC', confidence: 0.8, probability: 0.2, latencyMs: 50, usedFallback: false, isError: false, actualOutcome: 0, featureVector: { due_amount: 900 }, enableNewScoring: true },
    { userId: 2, segmentKey: 'normal_history', selectedModel: 'champion', selectedMethod: 'LOGISTIC', confidence: 0.8, probability: 0.2, latencyMs: 60, usedFallback: false, isError: false, actualOutcome: 0, featureVector: { due_amount: 950 }, enableNewScoring: true },
    { userId: 3, segmentKey: 'rich_volatile', selectedModel: 'challenger', selectedMethod: 'LIGHTGBM', confidence: 0.4, probability: 0.55, latencyMs: 55, usedFallback: true, isError: false, actualOutcome: 1, featureVector: { due_amount: 2500 }, enableNewScoring: true },
    { userId: 4, segmentKey: 'rich_volatile', selectedModel: 'challenger', selectedMethod: 'LIGHTGBM', confidence: 0.4, probability: 0.52, latencyMs: 52, usedFallback: true, isError: false, actualOutcome: 1, featureVector: { due_amount: 2450 }, enableNewScoring: true },
    { userId: 5, segmentKey: 'rich_volatile', selectedModel: 'challenger', selectedMethod: 'LIGHTGBM', confidence: 0.4, probability: 0.53, latencyMs: 57, usedFallback: true, isError: false, actualOutcome: 1, featureVector: { due_amount: 2480 }, enableNewScoring: true },
    { userId: 6, segmentKey: 'rich_volatile', selectedModel: 'challenger', selectedMethod: 'LIGHTGBM', confidence: 0.4, probability: 0.51, latencyMs: 53, usedFallback: true, isError: false, actualOutcome: 1, featureVector: { due_amount: 2520 }, enableNewScoring: true },
  ];

  pushRequests(monitorSegment, segmentRows);
  const segmentSnapshot = monitorSegment.computeSnapshot();

  assert(segmentSnapshot.triggered_guardrails.length > 0, 'segment guardrail should trigger for rich_volatile fallback rate');
  assert(
    rolloutController.isSegmentChallengerEnabled('rich_volatile') === false,
    'rich_volatile segment should be disabled after segment guardrail breach'
  );

  const globalRolloutController = createTrustRolloutController({
    config: {
      enable_new_scoring: true,
      rollout_percentage: 50,
      rollout_stage: 'stage_3_expanded',
      challenger_enabled: true,
      revert_target: 'champion',
    },
    logger: () => {},
  });

  const monitorGlobal = createTrustMonitoringEngine({
    rolloutController: globalRolloutController,
    guardrails: {
      min_samples_for_guardrails: 5,
      min_labeled_samples: 5,
      fallback_rate_max: 0.95,
      error_rate_max: 0.02,
      latency_ms_p95_max: 500,
      prediction_drift_psi_max: 1.0,
      feature_mean_shift_max: 10,
      feature_variance_shift_max: 10,
      brier_degradation_max: 1.0,
      calibration_shift_max: 1.0,
    },
    baseline: {
      performance: { brier_score: 0.5 },
      prediction_histogram: new Array(10).fill(0.1),
      feature_stats: {
        due_amount: { mean: 1000, variance: 50000 },
      },
    },
    logger: () => {},
  });

  const globalRows = [
    { userId: 101, segmentKey: 'normal_history', selectedModel: 'champion', selectedMethod: 'LOGISTIC', confidence: 0.7, probability: 0.2, latencyMs: 40, usedFallback: false, isError: true, actualOutcome: 0, featureVector: { due_amount: 1000 }, enableNewScoring: true },
    { userId: 102, segmentKey: 'normal_history', selectedModel: 'champion', selectedMethod: 'LOGISTIC', confidence: 0.7, probability: 0.21, latencyMs: 41, usedFallback: false, isError: false, actualOutcome: 0, featureVector: { due_amount: 980 }, enableNewScoring: true },
    { userId: 103, segmentKey: 'normal_history', selectedModel: 'champion', selectedMethod: 'LOGISTIC', confidence: 0.7, probability: 0.22, latencyMs: 39, usedFallback: false, isError: false, actualOutcome: 0, featureVector: { due_amount: 990 }, enableNewScoring: true },
    { userId: 104, segmentKey: 'normal_history', selectedModel: 'champion', selectedMethod: 'LOGISTIC', confidence: 0.7, probability: 0.19, latencyMs: 38, usedFallback: false, isError: false, actualOutcome: 0, featureVector: { due_amount: 995 }, enableNewScoring: true },
    { userId: 105, segmentKey: 'normal_history', selectedModel: 'champion', selectedMethod: 'LOGISTIC', confidence: 0.7, probability: 0.18, latencyMs: 37, usedFallback: false, isError: false, actualOutcome: 0, featureVector: { due_amount: 1005 }, enableNewScoring: true },
  ];

  pushRequests(monitorGlobal, globalRows);
  const globalSnapshot = monitorGlobal.computeSnapshot();
  assert(globalSnapshot.triggered_guardrails.length > 0, 'global guardrail should trigger on error rate breach');

  const globalConfig = globalRolloutController.getConfig();
  assert(globalConfig.enable_new_scoring === false, 'global auto-revert must disable new scoring');

  const stagePercentages = TRUST_ROLLOUT_STAGES.map((stage) => stage.percentage);
  assert(stagePercentages.join(',') === '5,25,50,100', 'rollout stages must remain 5-25-50-100');

  return {
    passed: true,
    stages: TRUST_ROLLOUT_STAGES,
    segment_triggered_guardrails: segmentSnapshot.triggered_guardrails,
    global_triggered_guardrails: globalSnapshot.triggered_guardrails,
    rollout_events: rolloutController.getRecentEvents(),
  };
}
