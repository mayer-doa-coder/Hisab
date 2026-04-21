const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema(
  {
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    location: {
      type: String,
      trim: true,
      default: null,
      maxlength: 240,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

branchSchema.index({ ownerUserId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Branch', branchSchema);
