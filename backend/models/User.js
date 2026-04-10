const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
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
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: false },
  }
);

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
