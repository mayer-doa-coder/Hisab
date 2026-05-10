const mongoose = require('mongoose');

const approvalRequestSchema = new mongoose.Schema(
  {
    actionType: {
      type: String,
      enum: ['VOID_SALE', 'RETURN_PRODUCT', 'DISCOUNT_OVERRIDE'],
      required: true,
      index: true,
    },
    tenantUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
      index: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },
    reason: {
      type: String,
      trim: true,
      default: null,
      maxlength: 500,
    },
    source: {
      type: String,
      enum: ['sync_change', 'transaction_void', 'manual'],
      default: 'manual',
      index: true,
    },
    requestPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    decisionNote: {
      type: String,
      trim: true,
      default: null,
      maxlength: 500,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    executedAt: {
      type: Date,
      default: null,
    },
    executionResult: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

approvalRequestSchema.index({ tenantUserId: 1, status: 1, createdAt: -1 });
approvalRequestSchema.index({ requestedBy: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('ApprovalRequest', approvalRequestSchema);
