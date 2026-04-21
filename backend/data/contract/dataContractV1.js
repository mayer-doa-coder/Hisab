const { z } = require('zod');

const DATA_CONTRACT_V1_REQUIRED_FIELDS = Object.freeze([
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
]);

const numberField = (name) => z.number({
  invalid_type_error: `${name} must be a number.`,
  required_error: `${name} is required.`,
});

const marketDataRowSchema = z.object({
  symbol: z.string().trim().min(1).max(24),
  timestamp: z.union([z.string(), z.date()]),
  open: numberField('open'),
  high: numberField('high'),
  low: numberField('low'),
  close: numberField('close'),
  volume: numberField('volume').nonnegative(),
  spread: numberField('spread').nonnegative(),
  sector: z.string().trim().min(1).max(80),
  market: z.string().trim().min(1).max(20),
  asset_type: z.string().trim().min(1).max(20),
  corporate_actions: z.object({
    dividends: numberField('corporate_actions.dividends').nonnegative().default(0),
    stock_splits: numberField('corporate_actions.stock_splits').positive().default(1),
  }).default({ dividends: 0, stock_splits: 1 }),
  liquidity_metrics: z.object({
    average_daily_volume_20d: numberField('liquidity_metrics.average_daily_volume_20d').nonnegative(),
    active_trading_days_30d: z.number({
      invalid_type_error: 'liquidity_metrics.active_trading_days_30d must be a number.',
      required_error: 'liquidity_metrics.active_trading_days_30d is required.',
    }).int().nonnegative(),
    turnover_ratio: numberField('liquidity_metrics.turnover_ratio').nonnegative(),
  }),
  macro_indicators: z.record(z.string(), z.union([z.number(), z.null()])).nullable().optional(),
  order_flow: z.object({
    buy_volume: numberField('order_flow.buy_volume').nonnegative(),
    sell_volume: numberField('order_flow.sell_volume').nonnegative(),
    imbalance: z.number().min(-1).max(1).optional(),
  }).nullable().optional(),
  is_delisted: z.boolean().optional().default(false),
}).strict();

const normalizeTimestamp = (value) => {
  const date = new Date(value);
  const ts = date.getTime();
  if (!Number.isFinite(ts)) {
    return null;
  }

  return new Date(ts).toISOString();
};

const normalizeMarketDataRow = (row) => {
  const normalizedTimestamp = normalizeTimestamp(row.timestamp);
  if (!normalizedTimestamp) {
    throw new Error('timestamp must be a valid ISO datetime value.');
  }

  return {
    symbol: String(row.symbol).trim().toUpperCase(),
    timestamp: normalizedTimestamp,
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
    spread: Number(row.spread),
    sector: String(row.sector).trim(),
    market: String(row.market).trim().toUpperCase(),
    asset_type: String(row.asset_type).trim().toUpperCase(),
    dividends: Number(row.corporate_actions?.dividends || 0),
    stock_splits: Number(row.corporate_actions?.stock_splits || 1),
    liquidity_metrics: {
      average_daily_volume_20d: Number(row.liquidity_metrics.average_daily_volume_20d),
      active_trading_days_30d: Number(row.liquidity_metrics.active_trading_days_30d),
      turnover_ratio: Number(row.liquidity_metrics.turnover_ratio),
    },
    macro_indicators: row.macro_indicators || null,
    order_flow: row.order_flow || null,
    is_delisted: Boolean(row.is_delisted),
  };
};

const parseMarketDataRowV1 = (row) => {
  const parsed = marketDataRowSchema.safeParse(row);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.') || 'root',
        message: issue.message,
      })),
    };
  }

  try {
    return {
      ok: true,
      data: normalizeMarketDataRow(parsed.data),
    };
  } catch (error) {
    return {
      ok: false,
      issues: [{ path: 'timestamp', message: error.message }],
    };
  }
};

const getDataContractV1Definition = () => ({
  name: 'data_contract_v1',
  strict: true,
  required_fields: [...DATA_CONTRACT_V1_REQUIRED_FIELDS],
  schema: {
    symbol: 'string',
    timestamp: 'datetime',
    open: 'number',
    high: 'number',
    low: 'number',
    close: 'number',
    volume: 'number',
    spread: 'number',
    sector: 'string',
    market: 'string',
    asset_type: 'string',
    corporate_actions: {
      dividends: 'number',
      stock_splits: 'number',
    },
    liquidity_metrics: {
      average_daily_volume_20d: 'number',
      active_trading_days_30d: 'number',
      turnover_ratio: 'number',
    },
    macro_indicators: 'object_optional',
    order_flow: 'object_optional',
    is_delisted: 'boolean_optional',
  },
});

module.exports = {
  DATA_CONTRACT_V1_REQUIRED_FIELDS,
  parseMarketDataRowV1,
  getDataContractV1Definition,
};
