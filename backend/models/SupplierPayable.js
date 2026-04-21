const mongoose = require('mongoose');

const supplierPayableSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      required: true,
      index: true,
    },
    supplierClientRefId: {
      type: String,
      trim: true,
      default: null,
    },
    purchaseOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PurchaseOrder',
      default: null,
      index: true,
    },
    purchaseOrderClientRefId: {
      type: String,
      trim: true,
      default: null,
    },
    entryType: {
      type: String,
      enum: ['credit', 'payment'],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    runningDue: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    paymentMethod: {
      type: String,
      trim: true,
      default: null,
    },
    note: {
      type: String,
      trim: true,
      default: null,
      maxlength: 500,
    },
    occurredAt: {
      type: Date,
      required: true,
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

supplierPayableSchema.index({ userId: 1, supplierId: 1, occurredAt: -1 });
supplierPayableSchema.index({ userId: 1, clientRefId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('SupplierPayable', supplierPayableSchema);
