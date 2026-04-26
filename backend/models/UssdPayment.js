const mongoose = require('mongoose');

const ussdPaymentSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    step: {
      type: String,
      enum: ['menu', 'amount', 'shop_phone', 'payment_code', 'confirmed', 'failed'],
      default: 'menu',
    },
    amount: {
      type: Number,
      default: null,
    },
    shopPhone: {
      type: String,
      default: null,
      trim: true,
    },
    paymentCode: {
      type: String,
      default: null,
      trim: true,
    },
    bakiEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BakiEntry',
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

ussdPaymentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('UssdPayment', ussdPaymentSchema);
