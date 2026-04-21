const mongoose = require('mongoose');

const expenseEntrySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    expenseDate: {
      type: Date,
      required: true,
      index: true,
    },
    category: {
      type: String,
      trim: true,
      default: 'GENERAL',
      maxlength: 50,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
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

expenseEntrySchema.index({ userId: 1, expenseDate: -1 });
expenseEntrySchema.index({ userId: 1, clientRefId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('ExpenseEntry', expenseEntrySchema);
