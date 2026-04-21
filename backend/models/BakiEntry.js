const mongoose = require('mongoose');

const bakiEntrySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    customerClientRefId: {
      type: String,
      trim: true,
      default: null,
    },
    type: {
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
    },
    dueDate: {
      type: Date,
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ['open', 'paid', 'overdue'],
      default: 'open',
      index: true,
    },
    referenceId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    reminderSentAt: {
      type: Date,
      default: null,
    },
    paymentMethod: {
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

bakiEntrySchema.index({ userId: 1, customerId: 1, occurredAt: 1 });
bakiEntrySchema.index({ userId: 1, customerId: 1, status: 1, dueDate: 1 });
bakiEntrySchema.index({ userId: 1, clientRefId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('BakiEntry', bakiEntrySchema);
