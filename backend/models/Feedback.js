const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema(
  {
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PilotShop',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    category: {
      type: String,
      enum: ['bug', 'feature', 'ux'],
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'feedback',
  }
);

feedbackSchema.index({ shopId: 1, category: 1, timestamp: -1 });
feedbackSchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model('Feedback', feedbackSchema);
