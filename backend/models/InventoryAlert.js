const mongoose = require('mongoose');

const inventoryAlertSchema = new mongoose.Schema(
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
    alertType: {
      type: String,
      enum: ['LOW_STOCK', 'EXPIRY', 'OVERSTOCK', 'DEAD_STOCK'],
      required: true,
      index: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 400,
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      required: true,
      default: 'low',
      index: true,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
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

inventoryAlertSchema.index({ userId: 1, productId: 1, alertType: 1, isActive: 1 });
inventoryAlertSchema.index({ userId: 1, clientRefId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('InventoryAlert', inventoryAlertSchema);
