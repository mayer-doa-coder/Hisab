const mongoose = require('mongoose');

const analyticsEventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PilotShop',
      default: null,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    source: {
      type: String,
      trim: true,
      default: 'app',
    },
  },
  {
    timestamps: true,
    collection: 'analytics_events',
  }
);

analyticsEventSchema.index({ userId: 1, timestamp: -1 });
analyticsEventSchema.index({ userId: 1, eventType: 1, timestamp: -1 });

module.exports = mongoose.model('AnalyticsEvent', analyticsEventSchema);
