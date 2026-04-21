const mongoose = require('mongoose');

const purchaseItemSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    purchaseOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PurchaseOrder',
      required: true,
      index: true,
    },
    purchaseOrderClientRefId: {
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
    orderedQty: {
      type: Number,
      required: true,
      min: 1,
    },
    receivedQty: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    pendingQty: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    unitCost: {
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
    status: {
      type: String,
      enum: ['pending', 'partial', 'received'],
      default: 'pending',
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

purchaseItemSchema.index({ userId: 1, purchaseOrderId: 1, productId: 1, createdAt: -1 });
purchaseItemSchema.index({ userId: 1, clientRefId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('PurchaseItem', purchaseItemSchema);
