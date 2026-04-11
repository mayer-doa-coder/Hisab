const Customer = require('../../models/Customer');
const BakiEntry = require('../../models/BakiEntry');
const Transaction = require('../../models/Transaction');
const { success } = require('../../utils/apiResponse');
const { normalizeTrimmedString } = require('../../utils/validation');
const { badRequest, notFound } = require('../../services/v1/httpError');
const { calculateTrustScore } = require('../../services/trust/customerRiskEngine');
const { asyncHandler, getUserIdFromReq } = require('./controllerUtils');

const buildCustomerDataForTrust = async ({ userId, customerId }) => {
  const customer = await Customer.findOne({
    _id: customerId,
    userId,
    isArchived: false,
  }).lean();

  if (!customer) {
    throw notFound('Customer not found.');
  }

  const [bakiEntries, transactions] = await Promise.all([
    BakiEntry.find({ userId, customerId, isArchived: { $ne: true } })
      .sort({ occurredAt: 1, _id: 1 })
      .lean(),
    Transaction.find({
      userId,
      customerId,
      status: { $ne: 'voided' },
      deletedAt: null,
    })
      .sort({ occurredAt: 1, _id: 1 })
      .lean(),
  ]);

  const dueAmount = bakiEntries.reduce((sum, row) => {
    if (row.type === 'credit') {
      return sum + Number(row.amount || 0);
    }

    if (row.type === 'payment') {
      return sum - Number(row.amount || 0);
    }

    return sum;
  }, 0);

  const paymentRecords = bakiEntries
    .filter((row) => row.type === 'payment')
    .map((row) => ({
      amount: Number(row.amount || 0),
      occurred_at: row.occurredAt,
      payment_method: row.paymentMethod || null,
      delay_days: 0,
    }));

  const transactionHistory = transactions.map((row) => ({
    amount: Number(row.amount || 0),
    type: row.transactionType,
    occurred_at: row.occurredAt,
  }));

  return {
    customer_id: String(customer._id),
    due_amount: Math.max(0, Number(dueAmount || 0)),
    payment_records: paymentRecords,
    transaction_history: transactionHistory,
  };
};

const logTrustInput = ({ userId, customerId, payload }) => {
  console.info('[TRUST][CALC_TRIGGERED]', {
    userId,
    customerId,
    due_amount: Number(payload?.due_amount || 0),
    payment_record_count: Array.isArray(payload?.payment_records) ? payload.payment_records.length : 0,
    transaction_count: Array.isArray(payload?.transaction_history) ? payload.transaction_history.length : 0,
  });
};

const logTrustOutput = ({ userId, customerId, result }) => {
  console.info('[TRUST][CALC_RESULT]', {
    userId,
    customerId,
    trust_score: result.trust_score,
    risk_score: result.risk_score,
    risk_level: result.risk_level,
    method: result.scoring_method,
  });
};

const getTrustByCustomerId = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const customerId = normalizeTrimmedString(req.params.customerId);

  if (!customerId) {
    throw badRequest('customerId is required in route parameter.', [{ field: 'customerId', reason: 'required' }]);
  }

  const customerData = await buildCustomerDataForTrust({ userId, customerId });
  logTrustInput({ userId, customerId, payload: customerData });

  const result = calculateTrustScore(customerData, {
    useChallenger: String(process.env.TRUST_CHALLENGER_ENABLED || 'true').toLowerCase() !== 'false',
  });

  logTrustOutput({ userId, customerId, result });
  return success(req, res, result);
});

const postTrustScore = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const customerId = normalizeTrimmedString(req.body?.customerId);
  const directPayload = req.body?.customerData;

  let customerData = null;
  if (customerId) {
    customerData = await buildCustomerDataForTrust({ userId, customerId });
  } else if (directPayload && typeof directPayload === 'object') {
    customerData = directPayload;
  }

  if (!customerData) {
    throw badRequest('Provide either customerId or customerData object.', [
      { field: 'customerId', reason: 'required_when_customerData_missing' },
    ]);
  }

  logTrustInput({ userId, customerId: customerId || 'payload-direct', payload: customerData });

  const result = calculateTrustScore(customerData, {
    useChallenger: req.body?.useChallenger === true,
  });

  logTrustOutput({ userId, customerId: customerId || 'payload-direct', result });
  return success(req, res, result);
});

module.exports = {
  getTrustByCustomerId,
  postTrustScore,
};
