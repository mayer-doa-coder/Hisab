const mongoose = require('mongoose');

const paymentPromiseSchema = new mongoose.Schema(
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
    promisedAmount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    promiseDate: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'fulfilled', 'broken'],
      default: 'pending',
      index: true,
    },
    note: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },
    fulfilledByEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BakiEntry',
      default: null,
    },
    customerClientRefId: {
      type: String,
      trim: true,
      default: null,
    },
    fulfilledByEntryClientRefId: {
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

paymentPromiseSchema.index({ userId: 1, customerId: 1, status: 1, promiseDate: 1 });
paymentPromiseSchema.index({ userId: 1, clientRefId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('PaymentPromise', paymentPromiseSchema);
