const mongoose = require('mongoose');

const cycleCountSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    productClientRefId: {
      type: String,
      trim: true,
      default: null,
    },
    systemQuantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    physicalQuantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    variance: {
      type: Number,
      required: true,
      default: 0,
    },
    countedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    note: {
      type: String,
      trim: true,
      default: null,
      maxlength: 500,
    },
    version: {
      type: Number,
      default: 1,
    },
    serverVersion: {
      type: Number,
      default: 1,
      index: true,
    },
    clientRefId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
    lastClientMutationAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

cycleCountSchema.index({ userId: 1, productId: 1, countedAt: -1 });
cycleCountSchema.index({ userId: 1, clientRefId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('CycleCount', cycleCountSchema);
