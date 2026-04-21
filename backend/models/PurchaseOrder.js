const mongoose = require('mongoose');

const purchaseOrderSchema = new mongoose.Schema(
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
    purchaseCode: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    purchaseAt: {
      type: Date,
      required: true,
      index: true,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    paidAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    dueAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    status: {
      type: String,
      enum: ['pending', 'partial', 'received', 'cancelled'],
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

purchaseOrderSchema.index({ userId: 1, purchaseCode: 1 }, { unique: true });
purchaseOrderSchema.index({ userId: 1, supplierId: 1, purchaseAt: -1 });
purchaseOrderSchema.index({ userId: 1, clientRefId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
