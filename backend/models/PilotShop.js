const mongoose = require('mongoose');

const pilotShopSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    shopName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140,
    },
    type: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 80,
      index: true,
    },
    onboardingDate: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    status: {
      type: String,
      enum: ['planned', 'active', 'paused', 'completed'],
      default: 'planned',
      index: true,
    },
    estimatedDailySales: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  {
    timestamps: true,
    collection: 'pilot_shops',
  }
);

pilotShopSchema.index({ userId: 1, type: 1, status: 1, onboardingDate: -1 });

module.exports = mongoose.model('PilotShop', pilotShopSchema);
