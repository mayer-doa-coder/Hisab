const { assignMarkovStateForRow } = require('../../services/prediction/markovStateEngine');

const toDateOrNull = (value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

const normalizeStateToken = (value, states, fallbackState = 'SIDEWAYS_STABLE') => {
  const token = String(value || '').trim().toUpperCase();
  if (states.includes(token)) {
    return token;
  }

  return fallbackState;
};

const safeNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const toObservationRow = (row = {}) => ({
  symbol: String(row.symbol || '').trim().toUpperCase() || null,
  timestamp: row.timestamp,
  open: safeNumber(row.open, 0),
  high: safeNumber(row.high, 0),
  low: safeNumber(row.low, 0),
  close: safeNumber(row.close, 0),
  volume: safeNumber(row.volume, 0),
  spread: safeNumber(row.spread, 0),
  current_state: String(row.current_state || row.currentState || '').trim().toUpperCase() || null,
  markov_features: row.markov_features || {
    volatility_ratio: safeNumber(row?.markovFeatures?.volatilityRatio, 0),
    liquidity_stress_score: safeNumber(row?.markovFeatures?.liquidityStressScore, 0),
    queue_pressure: safeNumber(row?.markovFeatures?.queuePressure, 0),
    spread_to_close_ratio: safeNumber(row?.markovFeatures?.spreadToCloseRatio, 0),
    volume_to_floor_ratio: safeNumber(row?.markovFeatures?.volumeToFloorRatio, 0),
  },
  order_flow: row.order_flow || (row.orderFlow
    ? {
      buy_volume: safeNumber(row.orderFlow.buyVolume, 0),
      sell_volume: safeNumber(row.orderFlow.sellVolume, 0),
      imbalance: row.orderFlow.imbalance,
    }
    : null),
});

const encodeStateFromObservation = ({ row, previousSnapshot, states, fallbackState }) => {
  const explicitState = normalizeStateToken(row.current_state || row.currentState, states, fallbackState);
  if (explicitState && explicitState !== fallbackState) {
    return explicitState;
  }

  const assignment = assignMarkovStateForRow({
    row,
    previousSnapshot,
  });

  return normalizeStateToken(assignment.current_state, states, fallbackState);
};

const buildStateSequences = ({
  rows = [],
  states = [],
  entityKey = 'symbol',
  maxGapDays = 14,
  fallbackState = 'SIDEWAYS_STABLE',
} = {}) => {
  const grouped = new Map();

  for (const sourceRow of Array.isArray(rows) ? rows : []) {
    const observationRow = toObservationRow(sourceRow);
    const entityId = String(sourceRow?.[entityKey] || observationRow.symbol || '').trim().toUpperCase();
    const timestamp = toDateOrNull(observationRow.timestamp);

    if (!entityId || !timestamp) {
      continue;
    }

    if (!grouped.has(entityId)) {
      grouped.set(entityId, []);
    }

    grouped.get(entityId).push({
      source_row: observationRow,
      timestamp,
    });
  }

  const sequences = [];
  const maxGapMs = Math.max(1, Number(maxGapDays) || 1) * 24 * 60 * 60 * 1000;
  let totalGapBreaks = 0;

  for (const [entityId, entries] of grouped.entries()) {
    entries.sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());

    const points = [];
    let previousPoint = null;

    for (const entry of entries) {
      const row = entry.source_row;
      const currentTimestamp = entry.timestamp;

      let breakBefore = false;
      if (previousPoint) {
        const gap = currentTimestamp.getTime() - new Date(previousPoint.t).getTime();
        if (gap > maxGapMs || gap <= 0) {
          breakBefore = true;
          totalGapBreaks += 1;
        }
      }

      const encodedState = encodeStateFromObservation({
        row,
        previousSnapshot: previousPoint
          ? {
            close: previousPoint.observation.close,
            current_state: previousPoint.state,
          }
          : null,
        states,
        fallbackState,
      });

      const point = {
        t: currentTimestamp.toISOString(),
        state: encodedState,
        break_before: breakBefore,
        observation: row,
      };

      points.push(point);
      previousPoint = point;
    }

    if (points.length > 0) {
      sequences.push({
        entity_id: entityId,
        points,
      });
    }
  }

  return {
    sequences,
    metadata: {
      entity_count: sequences.length,
      total_points: sequences.reduce((sum, item) => sum + item.points.length, 0),
      gap_breaks: totalGapBreaks,
    },
  };
};

module.exports = {
  normalizeStateToken,
  encodeStateFromObservation,
  buildStateSequences,
};
