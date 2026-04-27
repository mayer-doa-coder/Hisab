const { z } = require('zod');

const bdPhoneSchema = z
  .string()
  .trim()
  .regex(/^\+8801[3-9]\d{8}$/, 'Must be a valid BD mobile number: +8801XXXXXXXXX');

const createIdentitySchema = z
  .object({
    name: z.string().trim().min(1, 'name is required').max(120),
    phone: bdPhoneSchema.optional(),
  })
  .strict();

const addPhoneSchema = z
  .object({
    phone: bdPhoneSchema,
    isPrimary: z.boolean().optional(),
  })
  .strict();

const requestOtpSchema = z
  .object({
    phone: bdPhoneSchema,
  })
  .strict();

const verifyOtpSchema = z
  .object({
    phone: bdPhoneSchema,
    otp: z.string().trim().regex(/^\d{6}$/, 'OTP must be exactly 6 digits'),
  })
  .strict();

const setPinSchema = z
  .object({
    pin: z.string().trim().regex(/^\d{4,6}$/, 'PIN must be 4 to 6 digits'),
  })
  .strict();

module.exports = {
  createIdentitySchema,
  addPhoneSchema,
  requestOtpSchema,
  verifyOtpSchema,
  setPinSchema,
};
