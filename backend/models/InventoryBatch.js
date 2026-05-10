const mongoose = require('mongoose');

const inventoryBatchSchema = new mongoose.Schema(
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
    batchNumber: {
      type: String,
      trim: true,
      default: null,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    expiryDate: {
      type: Date,
      default: null,
      index: true,
    },
    purchaseDate: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    costPrice: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
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

inventoryBatchSchema.index({ userId: 1, productId: 1, expiryDate: 1, purchaseDate: 1 });
inventoryBatchSchema.index({ userId: 1, batchNumber: 1 }, { sparse: true });
inventoryBatchSchema.index({ userId: 1, clientRefId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('InventoryBatch', inventoryBatchSchema);
