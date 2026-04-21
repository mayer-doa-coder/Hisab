const { STOCK_UNIVERSE_CONFIG } = require('../../config/dataContract');

const toLowerSet = (values) => new Set(values.map((value) => String(value).trim().toLowerCase()));

const ALLOWED_MARKETS = toLowerSet(STOCK_UNIVERSE_CONFIG.universe_scope.markets);
const ALLOWED_SECTORS = toLowerSet(STOCK_UNIVERSE_CONFIG.universe_scope.sectors);
const ALLOWED_ASSET_TYPES = toLowerSet(STOCK_UNIVERSE_CONFIG.universe_scope.asset_types);

const evaluateUniverseEligibility = (row) => {
  const reasons = [];
  const market = String(row.market || '').trim().toLowerCase();
  const sector = String(row.sector || '').trim().toLowerCase();
  const assetType = String(row.asset_type || '').trim().toLowerCase();

  if (!ALLOWED_MARKETS.has(market)) {
    reasons.push('market_not_in_locked_scope');
  }

  if (!ALLOWED_SECTORS.has(sector)) {
    reasons.push('sector_not_in_locked_scope');
  }

  if (!ALLOWED_ASSET_TYPES.has(assetType)) {
    reasons.push('asset_type_not_in_locked_scope');
  }

  const liquidityFloor = STOCK_UNIVERSE_CONFIG.liquidity_floor;
  if (Number(row.volume || 0) < Number(liquidityFloor.min_daily_volume || 0)) {
    reasons.push('liquidity_floor_min_daily_volume_failed');
  }

  if (Number(row?.liquidity_metrics?.active_trading_days_30d || 0) < Number(liquidityFloor.min_active_trading_days_30d || 0)) {
    reasons.push('liquidity_floor_active_trading_days_failed');
  }

  if (Number(row?.liquidity_metrics?.turnover_ratio || 0) < Number(liquidityFloor.min_turnover_ratio || 0)) {
    reasons.push('liquidity_floor_turnover_ratio_failed');
  }

  if (
    row.is_delisted === true
    && STOCK_UNIVERSE_CONFIG.survivorship_bias.include_delisted_for_historical_training !== true
  ) {
    reasons.push('delisted_assets_disallowed_by_policy');
  }

  return {
    eligible: reasons.length === 0,
    reasons,
  };
};

module.exports = {
  evaluateUniverseEligibility,
};
