const { error: sendError } = require('../../utils/apiResponse');
const { HttpError } = require('../../services/v1/httpError');
const {
  buildPayloadHash,
  getIdempotencyKey,
  buildRouteKey,
  findRecord,
  ensureNotConflictingReplay,
  writeRecord,
} = require('../../services/v1/idempotencyService');

const asyncHandler = (handler) => async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (err) {
    next(err);
  }
};

const getUserIdFromReq = (req) => String(req.user_id || req.auth?.user_id || '').trim();

const parsePagination = (req, { defaultPage = 1, defaultPageSize = 20, maxPageSize = 100 } = {}) => {
  const pageRaw = Number(req.query?.page);
  const pageSizeRaw = Number(req.query?.pageSize);

  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : defaultPage;
  const pageSize = Number.isInteger(pageSizeRaw) && pageSizeRaw > 0
    ? Math.min(pageSizeRaw, maxPageSize)
    : defaultPageSize;

  const skip = (page - 1) * pageSize;

  return {
    page,
    pageSize,
    skip,
    limit: pageSize,
  };
};

const withIdempotency = (handler) => asyncHandler(async (req, res, next) => {
  const userId = getUserIdFromReq(req);
  const key = getIdempotencyKey(req);

  if (!key) {
    throw new HttpError({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Idempotency-Key header is required for this endpoint.',
    });
  }

  if (key.length > 128) {
    throw new HttpError({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Idempotency-Key must be 128 characters or fewer.',
    });
  }

  const routeKey = buildRouteKey(req);
  const payloadHash = buildPayloadHash(req.body || {});
  const existing = await findRecord({ userId, key, routeKey });

  if (existing) {
    ensureNotConflictingReplay({ existing, payloadHash });
    return res.status(existing.statusCode).json(existing.responseBody);
  }

  const originalJson = res.json.bind(res);
  const originalStatus = res.status.bind(res);
  let statusCode = 200;

  res.status = (code) => {
    statusCode = Number(code || 200);
    return originalStatus(code);
  };

  res.json = async (body) => {
    try {
      await writeRecord({
        userId,
        key,
        routeKey,
        payloadHash,
        statusCode,
        responseBody: body,
      });
    } catch {
      // Non-blocking persistence to avoid breaking primary request.
    }

    return originalJson(body);
  };

  return handler(req, res, next);
});

const errorHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    return sendError(req, res, {
      statusCode: err.statusCode,
      code: err.code,
      message: err.message,
      details: err.details,
    });
  }

  return sendError(req, res, {
    statusCode: Number(err?.statusCode || 500),
    code: err?.code || 'INTERNAL_ERROR',
    message: err?.message || 'Internal server error.',
    details: err?.details || null,
  });
};

module.exports = {
  asyncHandler,
  withIdempotency,
  getUserIdFromReq,
  parsePagination,
  errorHandler,
};
