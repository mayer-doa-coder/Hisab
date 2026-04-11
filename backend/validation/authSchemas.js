const { z } = require('zod');

const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required.')
  .max(254, 'Email is too long.')
  .email('Please provide a valid email address.')
  .transform((value) => value.toLowerCase());

const pinSchema = z
  .string()
  .trim()
  .regex(/^\d{4,6}$/, 'PIN must be 4 to 6 digits.');

const rememberMeSchema = z.union([z.boolean(), z.string(), z.number()]).optional();

const optionalDeviceIdSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => (typeof value === 'string' ? value.trim() : null))
  .refine((value) => value === null || value.length <= 256, {
    message: 'deviceId is too long.',
  });

const signupSchema = z
  .object({
    email: emailSchema,
    pin: pinSchema,
    rememberMe: rememberMeSchema,
  })
  .strict();

const loginSchema = z
  .object({
    email: emailSchema,
    pin: pinSchema.optional(),
    password: pinSchema.optional(),
    rememberMe: rememberMeSchema,
    deviceId: optionalDeviceIdSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.pin && !value.password) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'PIN is required.',
        path: ['pin'],
      });
    }
  });

const verifyEmailRequestSchema = z
  .object({
    email: emailSchema,
  })
  .strict();

const verifyEmailConfirmSchema = z
  .object({
    email: emailSchema,
    verificationCode: z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'Verification code must be 6 digits.'),
    rememberMe: rememberMeSchema,
  })
  .strict();

const pinLoginSchema = z
  .object({
    email: emailSchema,
    pin: pinSchema,
    rememberMe: rememberMeSchema,
    deviceId: optionalDeviceIdSchema,
  })
  .strict();

const pinSetupSchema = z
  .object({
    pin: pinSchema,
    trustDevice: z.union([z.boolean(), z.string(), z.number()]).optional(),
    deviceId: optionalDeviceIdSchema,
  })
  .strict();

const refreshSchema = z
  .object({
    refreshToken: z.string().trim().min(1, 'Refresh token is required.'),
  })
  .strict();

const recoveryRequestSchema = z
  .object({
    email: emailSchema,
  })
  .strict();

const resetPinSchema = z
  .object({
    resetToken: z.string().trim().min(1, 'Reset token is required.'),
    newPin: pinSchema.optional(),
    newPassword: pinSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.newPin && !value.newPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'New PIN is required.',
        path: ['newPin'],
      });
    }
  });

const updatePinSchema = z
  .object({
    currentPin: pinSchema.optional(),
    currentPassword: pinSchema.optional(),
    newPin: pinSchema.optional(),
    newPassword: pinSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.currentPin && !value.currentPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Current PIN is required.',
        path: ['currentPin'],
      });
    }

    if (!value.newPin && !value.newPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'New PIN is required.',
        path: ['newPin'],
      });
    }
  });

const logoutSchema = z
  .object({
    refreshToken: z.string().trim().min(1, 'Refresh token is required.'),
  })
  .strict();

module.exports = {
  signupSchema,
  loginSchema,
  verifyEmailRequestSchema,
  verifyEmailConfirmSchema,
  pinLoginSchema,
  pinSetupSchema,
  refreshSchema,
  recoveryRequestSchema,
  resetPinSchema,
  updatePinSchema,
  logoutSchema,
};
