export const PILOT_ROLLOUT_CONFIG = Object.freeze({
  enabled: true,
  emergency_disabled: false,
  disable_reason: '',
  cycleDays: 7,
  rollout_percentage: 100,
  rollout_stages: [5, 25, 50, 100],
  stable_cycles_required: 2,
  stable_cycle_count: 0,
  command_coverage: ['ADD_DEBT', 'PAYMENT', 'SALE'],
  enabled_users: [],
  disabled_users: [],
  cohort: {
    allowedUserIds: [],
    allowedRoles: [],
  },
  kpiThresholds: {
    minCommands: 20,
    minSuccessRate: 0.95,
    maxCorrectionRate: 0.35,
    maxCancellationRate: 0.25,
    maxBlockedRate: 0.2,
    maxFalseExecutionRate: 0.05,
    maxP95LatencyMs: 1800,
    maxCriticalSafetyIssues: 0,
    maxIntegrityIssues: 0,
    maxSttFailureRate: 0.2,
    maxRetryRate: 0.45,
    maxBrokenFlowCount: 0,
    maxUserConfusionRate: 0.35,
  },
});

export default PILOT_ROLLOUT_CONFIG;
