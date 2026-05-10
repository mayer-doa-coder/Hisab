const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      default: null,
      maxlength: 120,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      default: null,
      maxlength: 40,
    },
    profileImageUrl: {
      type: String,
      trim: true,
      default: null,
      maxlength: 2048,
    },
    role: {
      type: String,
      enum: [
        'OWNER',
        'CASHIER',
        'STOCK_MANAGER',
        'ACCOUNTANT',
        'user',
        'manager',
        'admin',
        'owner',
        'auditor',
      ],
      default: 'OWNER',
      trim: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
      index: true,
    },
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'],
      default: 'ACTIVE',
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: false,
      default: null,
      minlength: 6,
      select: false,
    },
    emailVerifiedAt: {
      type: Date,
      default: null,
      select: false,
    },
    emailVerificationCodeHash: {
      type: String,
      default: null,
      select: false,
    },
    emailVerificationExpiresAt: {
      type: Date,
      default: null,
      select: false,
    },
    emailVerificationLastSentAt: {
      type: Date,
      default: null,
      select: false,
    },
    pinHash: {
      type: String,
      default: null,
      select: false,
    },
    pinSetAt: {
      type: Date,
      default: null,
      select: false,
    },
    failedPinAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    pinLockUntil: {
      type: Date,
      default: null,
      select: false,
    },
    trustedDeviceIdHash: {
      type: String,
      default: null,
      select: false,
    },
    refreshTokenHash: {
      type: String,
      default: null,
      select: false,
    },
    refreshTokenExpiresAt: {
      type: Date,
      default: null,
      select: false,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    lockUntil: {
      type: Date,
      default: null,
      select: false,
    },
    passwordResetTokenHash: {
      type: String,
      default: null,
      select: false,
    },
    passwordResetExpiresAt: {
      type: Date,
      default: null,
      select: false,
    },
    passwordChangedAt: {
      type: Date,
      default: null,
      select: false,
    },
    pinChangedAt: {
      type: Date,
      default: null,
      select: false,
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: false },
  }
);

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.pinHash;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
