const QUEUE_ADJUSTMENT_CONFIG = Object.freeze({
  enabled: true,
  minFactor: 0.7,
  maxFactor: 1.3,
  maxLinearImpact: 0.25,
  weights: {
    imbalance_pressure: 0.12,
    arrival_rate: 0.08,
    service_rate: 0.2,
    congestion: 0.2,
    spread_stress: 0.18,
    execution_delay: 0.15,
  },
  normalization: {
    imbalance_pressure_abs_max: 1,
    arrival_rate_ref: 5,
    service_rate_ref: 5,
    congestion_max: 1,
    spread_stress_ref: 0.03,
    execution_delay_ref_hours: 72,
  },
  stateInfluence: {
    LIQUIDITY_STRESS: {
      congestion: 1,
      spread_stress: 1,
      execution_delay: 0.7,
      service_rate: -0.8,
      arrival_over_service: 0.7,
      imbalance_directional: -0.2,
    },
    QUEUE_PRESSURE: {
      congestion: 0.8,
      spread_stress: 0.4,
      execution_delay: 0.4,
      service_rate: -0.5,
      arrival_over_service: 0.8,
      imbalance_directional: 0,
    },
    HIGH_VOLATILITY: {
      congestion: 0.35,
      spread_stress: 0.6,
      execution_delay: 0.3,
      service_rate: -0.3,
      arrival_over_service: 0.4,
      imbalance_directional: 0,
    },
    STRONG_UPTREND: {
      congestion: -0.4,
      spread_stress: -0.3,
      execution_delay: -0.2,
      service_rate: 0.8,
      arrival_over_service: -0.2,
      imbalance_directional: 1,
    },
    RECOVERY_PHASE: {
      congestion: -0.6,
      spread_stress: -0.5,
      execution_delay: -0.8,
      service_rate: 1,
      arrival_over_service: -0.3,
      imbalance_directional: 0.5,
    },
    WEAK_UPTREND: {
      congestion: -0.25,
      spread_stress: -0.15,
      execution_delay: -0.1,
      service_rate: 0.5,
      arrival_over_service: -0.15,
      imbalance_directional: 0.7,
    },
    DOWNTREND: {
      congestion: 0.7,
      spread_stress: 0.5,
      execution_delay: 0.5,
      service_rate: -0.7,
      arrival_over_service: 0.6,
      imbalance_directional: -1,
    },
    SIDEWAYS_STABLE: {
      congestion: -0.3,
      spread_stress: -0.2,
      execution_delay: -0.2,
      service_rate: 0.5,
      arrival_over_service: -0.1,
      imbalance_directional: 0,
    },
  },
});

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const getQueueAdjustmentConfig = () => deepClone(QUEUE_ADJUSTMENT_CONFIG);

module.exports = {
  QUEUE_ADJUSTMENT_CONFIG,
  getQueueAdjustmentConfig,
};
