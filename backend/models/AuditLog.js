const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    tenantUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
      index: true,
    },
    entityType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    entityId: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    affectedEntity: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    source: {
      type: String,
      default: 'api',
      trim: true,
    },
    occurredAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

auditLogSchema.index({ userId: 1, occurredAt: -1 });
auditLogSchema.index({ tenantUserId: 1, occurredAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
