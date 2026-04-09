const crypto = require('crypto');
const IdempotencyRecord = require('../../models/IdempotencyRecord');
const { conflict } = require('./httpError');

const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

const buildPayloadHash = (payload) => {
  const normalized = JSON.stringify(payload || {});
  return crypto.createHash('sha256').update(normalized).digest('hex');
};

const getIdempotencyKey = (req) => String(req.headers[IDEMPOTENCY_KEY_HEADER] || '').trim();

const buildRouteKey = (req) => `${String(req.method || 'GET').toUpperCase()}:${String(req.baseUrl || '')}${String(req.path || '')}`;

const findRecord = async ({ userId, key, routeKey }) => {
  return IdempotencyRecord.findOne({ userId, key, routeKey }).lean();
};

const ensureNotConflictingReplay = ({ existing, payloadHash }) => {
  if (!existing) {
    return;
  }

  if (existing.payloadHash !== payloadHash) {
    throw conflict(
      'Idempotency key was reused with a different payload.',
      'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD'
    );
  }
};

const writeRecord = async ({ userId, key, routeKey, payloadHash, statusCode, responseBody }) => {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  return IdempotencyRecord.create({
    userId,
    key,
    routeKey,
    payloadHash,
    statusCode,
    responseBody,
    expiresAt,
  });
};

module.exports = {
  buildPayloadHash,
  getIdempotencyKey,
  buildRouteKey,
  findRecord,
  ensureNotConflictingReplay,
  writeRecord,
};
