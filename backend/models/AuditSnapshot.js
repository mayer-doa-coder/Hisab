const mongoose = require('mongoose');

const auditSnapshotSchema = new mongoose.Schema(
  {
    userId: {
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
    snapshot_date: {
      type: Date,
      required: true,
      index: true,
      immutable: true,
    },
    summary_data: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      default: {},
      immutable: true,
    },
    created_at: {
      type: Date,
      default: Date.now,
      immutable: true,
      index: true,
    },
  },
  {
    versionKey: false,
  }
);

auditSnapshotSchema.index({ userId: 1, branchId: 1, snapshot_date: 1 }, { unique: true });

module.exports = mongoose.model('AuditSnapshot', auditSnapshotSchema);
