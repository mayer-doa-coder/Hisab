const mongoose = require('mongoose');

// Verification levels:
// L0 - name only, no phone verified
// L1 - at least one phone OTP-verified
// L2 - L1 + PIN set
// L3 - L2 + vouched by 3+ distinct shops (trust-network threshold)
const VERIFICATION_LEVELS = ['L0', 'L1', 'L2', 'L3'];

const phoneEntrySchema = new mongoose.Schema(
  {
    number: {
      type: String,
      required: true,
      trim: true,
      match: /^\+8801[3-9]\d{8}$/,
    },
    isPrimary: { type: Boolean, default: false },
    verified: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null },
    otpHash: { type: String, default: null, select: false },
    otpExpiresAt: { type: Date, default: null },
    otpAttempts: { type: Number, default: 0 },
  },
  { _id: false }
);

const globalCustomerIdentitySchema = new mongoose.Schema(
  {
    global_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    phones: {
      type: [phoneEntrySchema],
      validate: {
        validator: (arr) => arr.length <= 5,
        message: 'Maximum 5 phone entries allowed',
      },
    },
    pin_hash: {
      type: String,
      default: null,
      select: false,
    },
    verification_level: {
      type: String,
      enum: VERIFICATION_LEVELS,
      default: 'L0',
      index: true,
    },
    trust_score: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.5,
    },
    risk_score: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.5,
    },
    // number of distinct shops this identity is linked to — used for L3 gate
    shop_link_count: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'SUSPENDED', 'MERGED'],
      default: 'ACTIVE',
      index: true,
    },
    pin_failed_attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    pin_lock_until: {
      type: Date,
      default: null,
      index: true,
    },
    // points to the surviving identity when this record is merged/deduped
    merged_into: {
      type: String,
      ref: 'GlobalCustomerIdentity',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// fast phone-number lookup across all identities
globalCustomerIdentitySchema.index({ 'phones.number': 1 });
globalCustomerIdentitySchema.index({ 'phones.number': 1, 'phones.verified': 1 });
globalCustomerIdentitySchema.index({ trust_score: -1 });
globalCustomerIdentitySchema.index({ risk_score: -1 });

globalCustomerIdentitySchema.statics.findByPhone = function (number) {
  return this.findOne({ 'phones.number': number, status: 'ACTIVE' });
};

module.exports = mongoose.model('GlobalCustomerIdentity', globalCustomerIdentitySchema);
module.exports.VERIFICATION_LEVELS = VERIFICATION_LEVELS;
