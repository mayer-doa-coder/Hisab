const { verifyPinForCustomer } = require('../services/pinAuthService');
const { error: sendError } = require('../utils/apiResponse');

/**
 * Express middleware — enforces PIN verification before baki credit transactions.
 *
 * Expects request body:
 *   { customerId: string, customer_pin: string }
 *
 * Skips PIN check when:
 *   - the customer has no linked global identity
 *   - the linked identity has no PIN set (not yet enrolled)
 */
const bakiPinMiddleware = async (req, res, next) => {
  try {
    const { customerId, customer_pin: rawPin } = req.body;

    if (!customerId) {
      return sendError(req, res, {
        statusCode: 400,
        code: 'MISSING_CUSTOMER_ID',
        message: 'customerId is required.',
      });
    }

    await verifyPinForCustomer(customerId, rawPin);
    return next();
  } catch (err) {
    if (err.code === 'WRONG_PIN') {
      return sendError(req, res, {
        statusCode: 403,
        code: 'WRONG_PIN',
        message: 'Incorrect PIN.',
        details: { attemptsLeft: err.attemptsLeft },
      });
    }

    if (err.code === 'PIN_LOCKED') {
      return sendError(req, res, {
        statusCode: 403,
        code: 'PIN_LOCKED',
        message: 'Account locked due to too many failed PIN attempts.',
        details: { retryAfterMs: err.retryAfterMs },
      });
    }

    if (err.code === 'INVALID_PIN_FORMAT') {
      return sendError(req, res, {
        statusCode: 400,
        code: 'INVALID_PIN_FORMAT',
        message: 'PIN must be 4–6 digits.',
      });
    }

    if (err.code === 'NOT_FOUND') {
      return sendError(req, res, {
        statusCode: 404,
        code: 'CUSTOMER_NOT_FOUND',
        message: err.message,
      });
    }

    // unexpected — let the global error handler deal with it
    return next(err);
  }
};

module.exports = { bakiPinMiddleware };
