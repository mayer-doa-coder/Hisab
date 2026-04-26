const BakiEntry = require('../models/BakiEntry');
const Customer = require('../models/Customer');
const { success, error: sendError } = require('../utils/apiResponse');
const { appendChange } = require('../services/v1/changeLogService');
const { logAudit } = require('../services/v1/auditService');

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'hisab-ussd-secret';

exports.handlePaymentWebhook = async (req, res) => {
  try {
    // Validate webhook secret
    const incomingSecret = req.headers['x-webhook-secret'];
    if (incomingSecret !== WEBHOOK_SECRET) {
      return sendError(req, res, {
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Invalid webhook secret.',
      });
    }

    const { paymentCode, status, amount, customerPhone, bakiEntryId } = req.body;

    if (!paymentCode || !status) {
      return sendError(req, res, {
        statusCode: 400,
        code: 'INVALID_PAYLOAD',
        message: 'paymentCode and status are required.',
      });
    }

    if (status !== 'SUCCESS') {
      // Log failed payment attempts
      console.warn('[WEBHOOK][PAYMENT_FAILED]', { paymentCode, status, amount, customerPhone });
      return success(req, res, { received: true, action: 'logged' });
    }

    // If the USSD controller already marked as paid (bakiEntryId provided), just confirm
    if (bakiEntryId) {
      const entry = await BakiEntry.findById(bakiEntryId);
      if (entry && entry.status === 'paid' && entry.paymentCodeUsed) {
        console.info('[WEBHOOK][ALREADY_PROCESSED]', { bakiEntryId, paymentCode });
        return success(req, res, {
          received: true,
          action: 'confirmed',
          bakiEntryId,
          paidAt: entry.resolvedAt,
        });
      }
    }

    // Fallback: find by payment_code and mark as paid if not done yet
    const now = new Date();
    const entry = await BakiEntry.findOne({
      paymentCode,
      deletedAt: null,
    });

    if (!entry) {
      return sendError(req, res, {
        statusCode: 404,
        code: 'ENTRY_NOT_FOUND',
        message: 'No baki entry found for this payment code.',
      });
    }

    if (entry.paymentCodeUsed || entry.status === 'paid') {
      return success(req, res, {
        received: true,
        action: 'already_paid',
        bakiEntryId: String(entry._id),
        paidAt: entry.resolvedAt,
      });
    }

    if (!entry.paymentCodeUsed && entry.paymentCodeExpiresAt && entry.paymentCodeExpiresAt < now) {
      return sendError(req, res, {
        statusCode: 422,
        code: 'CODE_EXPIRED',
        message: 'Payment code has expired.',
      });
    }

    entry.paymentCodeUsed = true;
    entry.status = 'paid';
    entry.resolvedAt = now;
    entry.paymentMethod = 'ussd';
    await entry.save();

    // Update customer balance
    const allEntries = await BakiEntry.aggregate([
      {
        $match: {
          userId: entry.userId,
          customerId: entry.customerId,
          isArchived: { $ne: true },
          deletedAt: null,
        },
      },
      {
        $group: {
          _id: null,
          credit: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] } },
          payment: { $sum: { $cond: [{ $eq: ['$type', 'payment'] }, '$amount', 0] } },
        },
      },
    ]);

    const row = allEntries[0] || { credit: 0, payment: 0 };
    const newDue = Math.max(0, Number(row.credit || 0) - Number(row.payment || 0));

    await Customer.updateOne(
      { _id: entry.customerId, userId: entry.userId },
      {
        $set: {
          currentBalance: newDue,
          riskLevel: newDue > 10000 ? 'high' : newDue > 3000 ? 'medium' : 'low',
          lastPaymentDate: now,
        },
      }
    );

    const entryId = String(entry._id);

    await Promise.allSettled([
      appendChange({
        userId: String(entry.userId),
        entityType: 'baki_entry',
        entityId: entryId,
        changeType: 'upsert',
        payload: {
          ledgerEntryId: entryId,
          status: 'paid',
          paymentCodeUsed: true,
          resolvedAt: now.toISOString(),
          paymentMethod: 'ussd',
        },
        version: 1,
        occurredAt: now,
      }),
      logAudit({
        userId: String(entry.userId),
        entityType: 'baki_entry',
        entityId: entryId,
        action: 'ussd_payment',
        metadata: {
          paymentCode,
          amount,
          customerPhone,
          paidAt: now.toISOString(),
        },
        occurredAt: now,
      }),
    ]);

    console.info('[WEBHOOK][PAYMENT_SUCCESS]', { paymentCode, bakiEntryId: entryId, amount, customerPhone });

    return success(req, res, {
      received: true,
      action: 'paid',
      bakiEntryId: entryId,
      paidAt: now.toISOString(),
      newDue,
    });
  } catch (err) {
    console.error('[WEBHOOK][ERROR]', err);
    return sendError(req, res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Webhook processing failed.' });
  }
};
