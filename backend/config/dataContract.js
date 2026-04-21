const DATA_CONTRACT_VERSION = 'data_contract_v1';

const DATA_CONTRACT_CONFIG = Object.freeze({
  version: DATA_CONTRACT_VERSION,
  locked: true,
  locked_at: '2026-04-12T00:00:00.000Z',
  backward_compatible_versions: [
    'data_contract_v1',
  ],
  critical_fields: [
    'symbol',
    'timestamp',
    'open',
    'high',
    'low',
    'close',
    'volume',
    'spread',
    'sector',
    'market',
    'asset_type',
  ],
  validation: {
    missing_value_policy: 'reject',
    outlier: {
      max_abs_return_ratio: 0.35,
      max_volume_spike_ratio: 10,
      max_spread_to_close_ratio: 0.2,
    },
    time_consistency: {
      default_interval_minutes: 1440,
      max_allowed_gap_multiplier: 8,
    },
  },
});

const STOCK_UNIVERSE_CONFIG = Object.freeze({
  version: 'stock_universe_v1',
  locked: true,
  locked_at: '2026-04-12T00:00:00.000Z',
  liquidity_floor: {
    min_daily_volume: 100000,
    min_active_trading_days_30d: 12,
    min_turnover_ratio: 0.015,
  },
  survivorship_bias: {
    include_delisted_for_historical_training: true,
    training_bias_protection: 'retain_delisted_rows_when_timestamp_is_historical',
  },
  universe_scope: {
    markets: ['DSE', 'NYSE', 'NASDAQ', 'LSE'],
    sectors: [
      'Financials',
      'Energy',
      'Healthcare',
      'Technology',
      'Consumer Discretionary',
      'Consumer Staples',
      'Industrials',
      'Materials',
      'Utilities',
      'Real Estate',
      'Telecommunications',
      'ETF',
      'Other',
    ],
    asset_types: [
      'EQUITY',
      'ETF',
      'ADR',
      'REIT',
    ],
  },
});

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const isSupportedDataContractVersion = (value) => {
  const version = String(value || '').trim();
  if (!version) {
    return true;
  }

  return DATA_CONTRACT_CONFIG.backward_compatible_versions.includes(version);
};

const resolveDataContractVersion = (value) => {
  const requested = String(value || '').trim();
  if (!requested) {
    return DATA_CONTRACT_VERSION;
  }

  return isSupportedDataContractVersion(requested) ? requested : null;
};

module.exports = {
  DATA_CONTRACT_VERSION,
  DATA_CONTRACT_CONFIG,
  STOCK_UNIVERSE_CONFIG,
  isSupportedDataContractVersion,
  resolveDataContractVersion,
  getDataContractConfig: () => deepClone(DATA_CONTRACT_CONFIG),
  getStockUniverseConfig: () => deepClone(STOCK_UNIVERSE_CONFIG),
};
