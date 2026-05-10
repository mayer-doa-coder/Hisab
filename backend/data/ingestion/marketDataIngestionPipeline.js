const {
  DATA_CONTRACT_VERSION,
  resolveDataContractVersion,
  STOCK_UNIVERSE_CONFIG,
} = require('../../config/dataContract');
const { badRequest } = require('../../services/v1/httpError');
const { validateAndNormalizeMarketDataRows } = require('../validation/marketDataValidator');
const MarketDataBar = require('../../models/MarketDataBar');
const { assignMarkovStateForRow } = require('../../services/prediction/markovStateEngine');

const resolveSourceRows = ({ rows, source }) => {
  if (Array.isArray(rows)) {
    return rows;
  }

  if (source?.type === 'inline' && Array.isArray(source.rows)) {
    return source.rows;
  }

  return [];
};

const normalizeSourceTag = (value) => {
  const tag = String(value || '').trim();
  return tag || 'manual_ingestion';
};

const buildUpsertOperation = ({ userId, contractVersion, sourceTag, row }) => {
  return {
    updateOne: {
      filter: {
        userId,
        contractVersion,
        symbol: row.symbol,
        timestamp: new Date(row.timestamp),
      },
      update: {
        $set: {
          open: row.open,
          high: row.high,
          low: row.low,
          close: row.close,
          volume: row.volume,
          spread: row.spread,
          market: row.market,
          sector: row.sector,
          assetType: row.asset_type,
          dividends: row.dividends,
          stockSplits: row.stock_splits,
          liquidityMetrics: {
            averageDailyVolume20d: row.liquidity_metrics.average_daily_volume_20d,
            activeTradingDays30d: row.liquidity_metrics.active_trading_days_30d,
            turnoverRatio: row.liquidity_metrics.turnover_ratio,
          },
          macroIndicators: row.macro_indicators,
          orderFlow: row.order_flow
            ? {
              buyVolume: row.order_flow.buy_volume,
              sellVolume: row.order_flow.sell_volume,
              imbalance: row.order_flow.imbalance ?? null,
            }
            : null,
          isDelisted: row.is_delisted,
          sourceTag,
          currentState: row.current_state || 'SIDEWAYS_STABLE',
          markovFeatures: {
            trendPct: Number(row?.markov_features?.trend_pct || 0),
            momentumPct: Number(row?.markov_features?.momentum_pct || 0),
            volatilityRatio: Number(row?.markov_features?.volatility_ratio || 0),
            liquidityStressScore: Number(row?.markov_features?.liquidity_stress_score || 0),
            queuePressure: Number(row?.markov_features?.queue_pressure || 0),
            spreadToCloseRatio: Number(row?.markov_features?.spread_to_close_ratio || 0),
            volumeToFloorRatio: Number(row?.markov_features?.volume_to_floor_ratio || 0),
          },
        },
      },
      upsert: true,
    },
  };
};

const ingestMarketDataDataset = async ({ userId, payload = {}, logger = console }) => {
  const contractVersion = resolveDataContractVersion(payload.contract_version);
  if (!contractVersion) {
    throw badRequest('Unsupported data contract version.', [
      {
        field: 'contract_version',
        reason: 'unsupported_version',
        expected: DATA_CONTRACT_VERSION,
      },
    ]);
  }

  const rawRows = resolveSourceRows({ rows: payload.rows, source: payload.source });
  if (rawRows.length === 0) {
    throw badRequest('No rows found for ingestion. Provide rows[] or source.rows[] with source.type="inline".', [
      {
        field: 'rows',
        reason: 'required',
      },
    ]);
  }

  const validation = validateAndNormalizeMarketDataRows({
    rows: rawRows,
    options: payload.options || {},
  });

  const annotateRowsWithMarkovState = async (rows) => {
    if (!Array.isArray(rows) || rows.length === 0) {
      return [];
    }

    const symbols = [...new Set(rows.map((row) => String(row.symbol || '').trim().toUpperCase()).filter(Boolean))];
    const previousRows = await Promise.all(
      symbols.map(async (symbol) => {
        const doc = await MarketDataBar.findOne({
          userId,
          contractVersion,
          symbol,
        })
          .sort({ timestamp: -1 })
          .lean();

        return [symbol, doc];
      })
    );

    const previousBySymbol = new Map(previousRows);
    const grouped = new Map();
    for (const row of rows) {
      const symbol = String(row.symbol || '').trim().toUpperCase();
      if (!grouped.has(symbol)) {
        grouped.set(symbol, []);
      }
      grouped.get(symbol).push(row);
    }

    const output = [];
    for (const [symbol, symbolRows] of grouped.entries()) {
      const sortedRows = [...symbolRows].sort(
        (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime()
      );

      let previous = previousBySymbol.get(symbol)
        ? {
          close: Number(previousBySymbol.get(symbol).close || 0),
          current_state: String(previousBySymbol.get(symbol).currentState || '').trim().toUpperCase() || null,
        }
        : null;

      for (const row of sortedRows) {
        const assignment = assignMarkovStateForRow({
          row,
          previousSnapshot: previous,
        });

        const enrichedRow = {
          ...row,
          current_state: assignment.current_state,
          markov_features: assignment.markov_features,
        };

        output.push(enrichedRow);
        previous = {
          close: row.close,
          current_state: assignment.current_state,
        };
      }
    }

    return output;
  };

  const acceptedRowsWithState = await annotateRowsWithMarkovState(validation.accepted_rows);

  let persistenceSummary = {
    upserted_count: 0,
    modified_count: 0,
    matched_count: 0,
  };

  if (acceptedRowsWithState.length > 0) {
    const sourceTag = normalizeSourceTag(payload.source_tag || payload.source?.tag);
    const operations = acceptedRowsWithState.map((row) => buildUpsertOperation({
      userId,
      contractVersion,
      sourceTag,
      row,
    }));

    const writeResult = await MarketDataBar.bulkWrite(operations, { ordered: false });
    persistenceSummary = {
      upserted_count: Number(writeResult?.upsertedCount || 0),
      modified_count: Number(writeResult?.modifiedCount || 0),
      matched_count: Number(writeResult?.matchedCount || 0),
    };
  }

  const ingestionStatus =
    acceptedRowsWithState.length === 0
      ? 'rejected'
      : validation.rejected_rows.length > 0
        ? 'completed_with_rejections'
        : 'completed';

  const stateDistribution = acceptedRowsWithState.reduce((acc, row) => {
    const key = String(row.current_state || 'SIDEWAYS_STABLE').trim().toUpperCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  logger.info('[MARKET_DATA][INGESTION_RESULT]', {
    userId,
    contractVersion,
    ingestionStatus,
    accepted: validation.summary.accepted_rows,
    rejected: validation.summary.rejected_rows,
  });

  return {
    ingestion_status: ingestionStatus,
    contract_version: contractVersion,
    stock_universe_version: STOCK_UNIVERSE_CONFIG.version,
    lock_status: {
      data_contract_locked: true,
      stock_universe_locked: true,
    },
    markov_state_space_version: 'markov_state_space_v1',
    validation_summary: validation.summary,
    persistence_summary: persistenceSummary,
    state_distribution: stateDistribution,
    rejected_rows: validation.rejected_rows,
  };
};

module.exports = {
  ingestMarketDataDataset,
};
