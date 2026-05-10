const mongoose = require('mongoose');

const marketDataBarSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    contractVersion: {
      type: String,
      required: true,
      default: 'data_contract_v1',
      index: true,
    },
    symbol: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    timestamp: {
      type: Date,
      required: true,
      index: true,
    },
    open: {
      type: Number,
      required: true,
    },
    high: {
      type: Number,
      required: true,
    },
    low: {
      type: Number,
      required: true,
    },
    close: {
      type: Number,
      required: true,
    },
    volume: {
      type: Number,
      required: true,
      min: 0,
    },
    spread: {
      type: Number,
      required: true,
      min: 0,
    },
    market: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    sector: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    assetType: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    dividends: {
      type: Number,
      default: 0,
      min: 0,
    },
    stockSplits: {
      type: Number,
      default: 1,
      min: 0,
    },
    liquidityMetrics: {
      averageDailyVolume20d: {
        type: Number,
        required: true,
        min: 0,
      },
      activeTradingDays30d: {
        type: Number,
        required: true,
        min: 0,
      },
      turnoverRatio: {
        type: Number,
        required: true,
        min: 0,
      },
    },
    macroIndicators: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    orderFlow: {
      buyVolume: {
        type: Number,
        default: null,
        min: 0,
      },
      sellVolume: {
        type: Number,
        default: null,
        min: 0,
      },
      imbalance: {
        type: Number,
        default: null,
      },
    },
    isDelisted: {
      type: Boolean,
      default: false,
      index: true,
    },
    sourceTag: {
      type: String,
      default: 'manual_ingestion',
      trim: true,
    },
    currentState: {
      type: String,
      default: 'SIDEWAYS_STABLE',
      trim: true,
      uppercase: true,
      index: true,
    },
    markovFeatures: {
      trendPct: {
        type: Number,
        default: 0,
      },
      momentumPct: {
        type: Number,
        default: 0,
      },
      volatilityRatio: {
        type: Number,
        default: 0,
      },
      liquidityStressScore: {
        type: Number,
        default: 0,
      },
      queuePressure: {
        type: Number,
        default: 0,
      },
      spreadToCloseRatio: {
        type: Number,
        default: 0,
      },
      volumeToFloorRatio: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
  }
);

marketDataBarSchema.index(
  { userId: 1, contractVersion: 1, symbol: 1, timestamp: 1 },
  { unique: true }
);
marketDataBarSchema.index({ userId: 1, market: 1, sector: 1, assetType: 1, timestamp: -1 });
marketDataBarSchema.index({ userId: 1, currentState: 1, timestamp: -1 });

module.exports = mongoose.model('MarketDataBar', marketDataBarSchema);
