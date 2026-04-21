const mongoose = require('mongoose');

const salesItemSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    salesHeaderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SalesHeader',
      required: true,
      index: true,
    },
    salesHeaderClientRefId: {
      type: String,
      trim: true,
      default: null,
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
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
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

salesItemSchema.index({ userId: 1, salesHeaderId: 1, productId: 1, createdAt: -1 });
salesItemSchema.index({ userId: 1, clientRefId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('SalesItem', salesItemSchema);
