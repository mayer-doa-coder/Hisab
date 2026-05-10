const mongoose = require('mongoose');

const cashbookEntrySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    entryType: {
      type: String,
      enum: ['IN', 'OUT'],
      required: true,
      index: true,
    },
    category: {
      type: String,
      trim: true,
      default: 'GENERAL',
      maxlength: 50,
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
    referenceType: {
      type: String,
      trim: true,
      default: null,
    },
    referenceLocalId: {
      type: Number,
      default: null,
    },
    referenceClientRefId: {
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

cashbookEntrySchema.index({ userId: 1, occurredAt: -1 });
cashbookEntrySchema.index({ userId: 1, entryType: 1, occurredAt: -1 });
cashbookEntrySchema.index({ userId: 1, clientRefId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('CashbookEntry', cashbookEntrySchema);
