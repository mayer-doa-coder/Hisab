const { DATA_CONTRACT_CONFIG } = require('../../config/dataContract');
const { parseMarketDataRowV1 } = require('../contract/dataContractV1');
const { evaluateUniverseEligibility } = require('../contract/stockUniverseV1');

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const buildRejectedRow = ({ index, symbol, row, code, details }) => ({
  index,
  symbol: symbol || String(row?.symbol || '').trim().toUpperCase() || null,
  code,
  details,
  row,
});

const validateOhlcIntegrity = (row) => {
  if (row.high < row.low) {
    return 'high_must_be_greater_or_equal_to_low';
  }

  if (row.open > row.high || row.open < row.low) {
    return 'open_must_be_between_low_and_high';
  }

  if (row.close > row.high || row.close < row.low) {
    return 'close_must_be_between_low_and_high';
  }

  return null;
};

const validateAndNormalizeMarketDataRows = ({ rows, options = {} } = {}) => {
  const inputRows = Array.isArray(rows) ? rows : [];
  const acceptedRows = [];
  const rejectedRows = [];

  for (let index = 0; index < inputRows.length; index += 1) {
    const sourceRow = inputRows[index];
    const parsed = parseMarketDataRowV1(sourceRow);

    if (!parsed.ok) {
      rejectedRows.push(buildRejectedRow({
        index,
        row: sourceRow,
        code: 'contract_validation_failed',
        details: parsed.issues,
      }));
      continue;
    }

    const normalized = parsed.data;
    const integrityError = validateOhlcIntegrity(normalized);
    if (integrityError) {
      rejectedRows.push(buildRejectedRow({
        index,
        symbol: normalized.symbol,
        row: sourceRow,
        code: 'ohlc_integrity_failed',
        details: [{ rule: integrityError }],
      }));
      continue;
    }

    const universe = evaluateUniverseEligibility(normalized);
    if (!universe.eligible) {
      rejectedRows.push(buildRejectedRow({
        index,
        symbol: normalized.symbol,
        row: sourceRow,
        code: 'stock_universe_filter_failed',
        details: universe.reasons.map((reason) => ({ rule: reason })),
      }));
      continue;
    }

    acceptedRows.push({
      index,
      row: normalized,
    });
  }

  const grouped = new Map();
  for (const accepted of acceptedRows) {
    const symbol = accepted.row.symbol;
    if (!grouped.has(symbol)) {
      grouped.set(symbol, []);
    }
    grouped.get(symbol).push(accepted);
  }

  const rejectedAcceptedIndices = new Set();
  const outlierConfig = DATA_CONTRACT_CONFIG.validation.outlier;
  const timeConfig = DATA_CONTRACT_CONFIG.validation.time_consistency;
  const expectedIntervalMinutes = Number(options.expected_interval_minutes)
    || Number(timeConfig.default_interval_minutes);
  const expectedIntervalMs = Math.max(1, expectedIntervalMinutes) * 60 * 1000;
  const maxAllowedGapMs = expectedIntervalMs * Number(timeConfig.max_allowed_gap_multiplier || 1);

  for (const [symbol, rowsForSymbol] of grouped.entries()) {
    rowsForSymbol.sort((left, right) => new Date(left.row.timestamp).getTime() - new Date(right.row.timestamp).getTime());

    for (let i = 1; i < rowsForSymbol.length; i += 1) {
      const previous = rowsForSymbol[i - 1];
      const current = rowsForSymbol[i];

      const previousTs = new Date(previous.row.timestamp).getTime();
      const currentTs = new Date(current.row.timestamp).getTime();
      const diff = currentTs - previousTs;

      if (diff <= 0) {
        rejectedAcceptedIndices.add(current.index);
        rejectedRows.push(buildRejectedRow({
          index: current.index,
          symbol,
          row: current.row,
          code: 'time_consistency_overlap_or_duplicate',
          details: [{
            previous_timestamp: previous.row.timestamp,
            current_timestamp: current.row.timestamp,
          }],
        }));
      } else if (diff > maxAllowedGapMs) {
        rejectedAcceptedIndices.add(current.index);
        rejectedRows.push(buildRejectedRow({
          index: current.index,
          symbol,
          row: current.row,
          code: 'time_consistency_gap_detected',
          details: [{
            previous_timestamp: previous.row.timestamp,
            current_timestamp: current.row.timestamp,
            gap_minutes: Math.round(diff / (60 * 1000)),
            max_allowed_gap_minutes: Math.round(maxAllowedGapMs / (60 * 1000)),
          }],
        }));
      }

      const prevClose = Math.max(0, toNumber(previous.row.close, 0));
      const close = Math.max(0, toNumber(current.row.close, 0));
      const absReturn = prevClose > 0 ? Math.abs((close - prevClose) / prevClose) : 0;
      if (absReturn > Number(outlierConfig.max_abs_return_ratio || 1)) {
        rejectedAcceptedIndices.add(current.index);
        rejectedRows.push(buildRejectedRow({
          index: current.index,
          symbol,
          row: current.row,
          code: 'outlier_abs_return_spike',
          details: [{ abs_return: Number(absReturn.toFixed(6)) }],
        }));
      }

      const prevVolume = Math.max(1, toNumber(previous.row.volume, 1));
      const volume = Math.max(0, toNumber(current.row.volume, 0));
      const volumeSpikeRatio = volume / prevVolume;
      if (volumeSpikeRatio > Number(outlierConfig.max_volume_spike_ratio || 100)) {
        rejectedAcceptedIndices.add(current.index);
        rejectedRows.push(buildRejectedRow({
          index: current.index,
          symbol,
          row: current.row,
          code: 'outlier_volume_spike',
          details: [{ volume_spike_ratio: Number(volumeSpikeRatio.toFixed(6)) }],
        }));
      }

      const spreadRatio = close > 0 ? toNumber(current.row.spread, 0) / close : 0;
      if (spreadRatio > Number(outlierConfig.max_spread_to_close_ratio || 1)) {
        rejectedAcceptedIndices.add(current.index);
        rejectedRows.push(buildRejectedRow({
          index: current.index,
          symbol,
          row: current.row,
          code: 'outlier_spread_to_close_ratio',
          details: [{ spread_to_close_ratio: Number(spreadRatio.toFixed(6)) }],
        }));
      }
    }
  }

  const finalizedAcceptedRows = acceptedRows
    .filter((item) => !rejectedAcceptedIndices.has(item.index))
    .map((item) => item.row);

  const rejectionByCode = {};
  for (const rejected of rejectedRows) {
    rejectionByCode[rejected.code] = (rejectionByCode[rejected.code] || 0) + 1;
  }

  return {
    accepted_rows: finalizedAcceptedRows,
    rejected_rows: rejectedRows,
    summary: {
      total_rows: inputRows.length,
      accepted_rows: finalizedAcceptedRows.length,
      rejected_rows: rejectedRows.length,
      rejection_by_code: rejectionByCode,
    },
  };
};

module.exports = {
  validateAndNormalizeMarketDataRows,
};
