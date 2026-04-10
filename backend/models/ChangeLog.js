const mongoose = require('mongoose');

const changeLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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
      required: true,
      trim: true,
      index: true,
    },
    changeType: {
      type: String,
      enum: ['upsert', 'delete'],
      required: true,
    },
    version: {
      type: Number,
      default: 1,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
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

changeLogSchema.index({ userId: 1, createdAt: 1, _id: 1 });

module.exports = mongoose.model('ChangeLog', changeLogSchema);
