const mongoose = require('mongoose');

const creditReminderSchema = new mongoose.Schema(
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
    bakiEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BakiEntry',
      default: null,
      index: true,
    },
    channel: {
      type: String,
      enum: ['sms', 'whatsapp', 'call', 'manual'],
      default: 'manual',
      index: true,
    },
    message: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },
    sentAt: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['queued', 'sent', 'failed'],
      default: 'sent',
      index: true,
    },
    referenceId: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    customerClientRefId: {
      type: String,
      trim: true,
      default: null,
    },
    bakiEntryClientRefId: {
      type: String,
      trim: true,
      default: null,
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

creditReminderSchema.index({ userId: 1, customerId: 1, sentAt: -1 });
creditReminderSchema.index({ userId: 1, clientRefId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('CreditReminder', creditReminderSchema);
