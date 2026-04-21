const mongoose = require('mongoose');

const dayCloseSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    businessDate: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    openingBalance: {
      type: Number,
      required: true,
      default: 0,
    },
    totalIn: {
      type: Number,
      required: true,
      default: 0,
    },
    totalOut: {
      type: Number,
      required: true,
      default: 0,
    },
    closingBalance: {
      type: Number,
      required: true,
      default: 0,
    },
    cashOnHand: {
      type: Number,
      default: null,
    },
    variance: {
      type: Number,
      default: null,
    },
    status: {
      type: String,
      enum: ['open', 'closed'],
      default: 'closed',
      index: true,
    },
    note: {
      type: String,
      trim: true,
      default: null,
      maxlength: 500,
    },
    closedAt: {
      type: Date,
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

dayCloseSchema.index({ userId: 1, businessDate: -1 }, { unique: true });
dayCloseSchema.index({ userId: 1, clientRefId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('DayClose', dayCloseSchema);
