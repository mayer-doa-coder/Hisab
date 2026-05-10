const mongoose = require('mongoose');

const salesHeaderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    receiptId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
      index: true,
    },
    customerClientRefId: {
      type: String,
      trim: true,
      default: null,
    },
    saleAt: {
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
    paymentMode: {
      type: String,
      trim: true,
      uppercase: true,
      default: 'CASH',
    },
    status: {
      type: String,
      enum: ['posted', 'voided', 'cancelled'],
      default: 'posted',
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

salesHeaderSchema.index({ userId: 1, receiptId: 1 }, { unique: true });
salesHeaderSchema.index({ userId: 1, clientRefId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('SalesHeader', salesHeaderSchema);
