const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    transactionType: {
      type: String,
      enum: ['sale', 'purchase', 'expense', 'income', 'credit_issue', 'credit_payment', 'void'],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    currency: {
      type: String,
      default: 'BDT',
      uppercase: true,
      trim: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
    },
    referenceType: {
      type: String,
      default: null,
      trim: true,
    },
    referenceId: {
      type: String,
      default: null,
      trim: true,
    },
    note: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },
    occurredAt: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['posted', 'voided'],
      default: 'posted',
      index: true,
    },
    voidReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 240,
    },
    voidedAt: {
      type: Date,
      default: null,
    },
    voidRefTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

transactionSchema.index({ userId: 1, transactionType: 1, occurredAt: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
