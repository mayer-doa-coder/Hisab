const mongoose = require('mongoose');

const salesReturnSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    salesItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SalesItem',
      required: true,
      index: true,
    },
    salesItemClientRefId: {
      type: String,
      trim: true,
      default: null,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    reason: {
      type: String,
      trim: true,
      default: null,
      maxlength: 120,
    },
    note: {
      type: String,
      trim: true,
      default: null,
      maxlength: 500,
    },
    returnAt: {
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

salesReturnSchema.index({ userId: 1, salesItemId: 1, returnAt: -1 });
salesReturnSchema.index({ userId: 1, clientRefId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('SalesReturn', salesReturnSchema);
