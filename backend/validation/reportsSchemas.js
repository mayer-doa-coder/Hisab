const { z } = require('zod');

const boundedNumber = (min, max, field) => z
  .number({ invalid_type_error: `${field} must be a number.` })
  .finite(`${field} must be finite.`)
  .min(min, `${field} must be at least ${min}.`)
  .max(max, `${field} must be at most ${max}.`);

const optionalString = (max, field) => z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed || null;
  })
  .refine((value) => value === null || value.length <= max, {
    message: `${field} is too long.`,
  });

const snapshotBodySchema = z.object({
  request_count: boundedNumber(0, 10000000, 'request_count').optional(),
  fallback_rate: boundedNumber(0, 1, 'fallback_rate').optional(),
  error_rate: boundedNumber(0, 1, 'error_rate').optional(),
  prediction_drift_psi: boundedNumber(0, 100, 'prediction_drift_psi').optional(),
  metadata: z.object({
    user_id: z.union([z.string(), z.number(), z.null(), z.undefined()]).optional(),
    app_version: optionalString(64, 'metadata.app_version').optional(),
    rollout_stage: optionalString(64, 'metadata.rollout_stage').optional(),
    rollout_percentage: boundedNumber(0, 100, 'metadata.rollout_percentage').optional(),
  }).passthrough().optional(),
}).passthrough();

const trustMonitoringEnvelopeSchema = z.object({
  source: optionalString(64, 'source').optional(),
  app_version: optionalString(64, 'app_version').optional(),
  rollout_stage: optionalString(64, 'rollout_stage').optional(),
  rollout_percentage: boundedNumber(0, 100, 'rollout_percentage').optional(),
  snapshot: snapshotBodySchema,
}).strict();

const trustMonitoringSnapshotSchema = z.union([
  trustMonitoringEnvelopeSchema,
  snapshotBodySchema.transform((snapshot) => ({ snapshot })),
]);

module.exports = {
  trustMonitoringSnapshotSchema,
};
