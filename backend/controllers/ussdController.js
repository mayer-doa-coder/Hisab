const { randomUUID } = require('crypto');
const UssdPayment = require('../models/UssdPayment');
const BakiEntry = require('../models/BakiEntry');
const Customer = require('../models/Customer');
const { success, error: sendError } = require('../utils/apiResponse');

const SESSION_TTL_MINUTES = 10;

const USSD_MENU = `*12345# সেবায় স্বাগতম
-------------------
1. পেমেন্ট করুন
2. ব্যালেন্স দেখুন
3. বের হন

নম্বর চাপুন:`;

const makeSessionExpiry = () =>
  new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000);

const validatePaymentCode = async ({ paymentCode, amount, shopPhone }) => {
  const now = new Date();

  const entry = await BakiEntry.findOne({
    paymentCode,
    paymentCodeUsed: false,
    paymentCodeExpiresAt: { $gt: now },
    type: 'credit',
    status: { $in: ['open', 'overdue'] },
    deletedAt: null,
  }).populate('customerId', 'phone name');

  if (!entry) {
    return { valid: false, reason: 'INVALID_OR_EXPIRED_CODE' };
  }

  if (Math.abs(Number(entry.amount) - Number(amount)) > 0.01) {
    return { valid: false, reason: 'AMOUNT_MISMATCH', expected: entry.amount };
  }

  const customer = entry.customerId;
  if (customer && shopPhone) {
    const customerPhone = String(customer.phone || '').replace(/\D/g, '');
    const inputPhone = String(shopPhone || '').replace(/\D/g, '');
    if (customerPhone && inputPhone && !customerPhone.endsWith(inputPhone) && !inputPhone.endsWith(customerPhone)) {
      return { valid: false, reason: 'SHOP_PHONE_MISMATCH' };
    }
  }

  return { valid: true, entry };
};

const simulateSms = (phone, paymentCode) => {
  console.info(`[USSD][SMS_SIM] To: ${phone} | "আপনার পেমেন্ট কোড: ${paymentCode}. ৳ পরিশোধের জন্য এই কোডটি ব্যবহার করুন। কোডটি ২৪ ঘণ্টা বৈধ থাকবে।"`);
};

exports.startSession = async (req, res) => {
  try {
    const phone = String(req.body.phone || '').trim();
    if (!phone) {
      return sendError(req, res, { statusCode: 400, code: 'PHONE_REQUIRED', message: 'phone is required.' });
    }

    const sessionId = randomUUID();
    await UssdPayment.create({
      sessionId,
      phone,
      step: 'menu',
      expiresAt: makeSessionExpiry(),
    });

    return success(req, res, {
      sessionId,
      step: 'menu',
      message: USSD_MENU,
    });
  } catch (err) {
    console.error('[USSD][startSession]', err);
    return sendError(req, res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Session creation failed.' });
  }
};

exports.processPayment = async (req, res) => {
  try {
    const { sessionId, step, value } = req.body;

    if (!sessionId || !step || value === undefined || value === null) {
      return sendError(req, res, {
        statusCode: 400,
        code: 'INVALID_REQUEST',
        message: 'sessionId, step, and value are required.',
      });
    }

    const session = await UssdPayment.findOne({
      sessionId,
      expiresAt: { $gt: new Date() },
    });

    if (!session) {
      return sendError(req, res, {
        statusCode: 404,
        code: 'SESSION_NOT_FOUND',
        message: 'USSD session not found or expired. Please dial *12345# again.',
      });
    }

    if (session.step === 'confirmed' || session.step === 'failed') {
      return sendError(req, res, {
        statusCode: 409,
        code: 'SESSION_CLOSED',
        message: 'This USSD session is already closed.',
      });
    }

    // Step 1: menu selection
    if (step === 'menu') {
      const input = String(value).trim();
      if (input === '3') {
        session.step = 'confirmed';
        await session.save();
        return success(req, res, { step: 'done', message: 'ধন্যবাদ। বিদায়!' });
      }
      if (input === '2') {
        return success(req, res, {
          step: 'balance',
          message: 'এই সেবাটি শীঘ্রই আসছে।\n\n0. মেনুতে ফিরুন',
        });
      }
      if (input === '1') {
        session.step = 'amount';
        session.expiresAt = makeSessionExpiry();
        await session.save();
        return success(req, res, {
          step: 'amount',
          message: 'পেমেন্টের পরিমাণ লিখুন (টাকায়):',
        });
      }
      return sendError(req, res, {
        statusCode: 400,
        code: 'INVALID_INPUT',
        message: 'অনুগ্রহ করে ১, ২ বা ৩ চাপুন।',
      });
    }

    // Step 2: amount
    if (step === 'amount') {
      const amount = Number(String(value).replace(/,/g, '').trim());
      if (!Number.isFinite(amount) || amount <= 0) {
        return sendError(req, res, {
          statusCode: 400,
          code: 'INVALID_AMOUNT',
          message: 'সঠিক পরিমাণ লিখুন (যেমন: 500)।',
        });
      }
      session.amount = amount;
      session.step = 'shop_phone';
      session.expiresAt = makeSessionExpiry();
      await session.save();
      return success(req, res, {
        step: 'shop_phone',
        message: `পরিমাণ: ৳${amount}\n\nদোকানের ফোন নম্বর লিখুন:`,
      });
    }

    // Step 3: shop phone
    if (step === 'shop_phone') {
      const shopPhone = String(value).trim().replace(/\s+/g, '');
      if (!shopPhone || shopPhone.length < 7) {
        return sendError(req, res, {
          statusCode: 400,
          code: 'INVALID_PHONE',
          message: 'সঠিক ফোন নম্বর লিখুন।',
        });
      }
      session.shopPhone = shopPhone;
      session.step = 'payment_code';
      session.expiresAt = makeSessionExpiry();
      await session.save();
      return success(req, res, {
        step: 'payment_code',
        message: `দোকান: ${shopPhone}\nপরিমাণ: ৳${session.amount}\n\nপেমেন্ট কোড লিখুন (৬ সংখ্যা):`,
      });
    }

    // Step 4: payment code — validate and process
    if (step === 'payment_code') {
      const paymentCode = String(value).trim();
      if (!/^\d{6}$/.test(paymentCode)) {
        return sendError(req, res, {
          statusCode: 400,
          code: 'INVALID_PAYMENT_CODE',
          message: 'পেমেন্ট কোড ৬ সংখ্যার হতে হবে।',
        });
      }

      const { valid, reason, expected, entry } = await validatePaymentCode({
        paymentCode,
        amount: session.amount,
        shopPhone: session.shopPhone,
      });

      if (!valid) {
        let message = 'পেমেন্ট ব্যর্থ হয়েছে। ';
        if (reason === 'INVALID_OR_EXPIRED_CODE') {
          message += 'কোডটি ভুল বা মেয়াদ শেষ।';
        } else if (reason === 'AMOUNT_MISMATCH') {
          message += `পরিমাণ মিলছে না। সঠিক পরিমাণ: ৳${expected}।`;
        } else if (reason === 'SHOP_PHONE_MISMATCH') {
          message += 'দোকানের নম্বর মিলছে না।';
        }
        session.step = 'failed';
        await session.save();
        return sendError(req, res, { statusCode: 422, code: reason, message });
      }

      // Mark payment code as used and update baki entry
      entry.paymentCodeUsed = true;
      entry.status = 'paid';
      entry.resolvedAt = new Date();
      entry.paymentMethod = 'ussd';
      await entry.save();

      session.paymentCode = paymentCode;
      session.bakiEntryId = entry._id;
      session.step = 'confirmed';
      await session.save();

      // Simulate SMS confirmation
      simulateSms(session.phone, paymentCode);

      // Fire internal webhook asynchronously
      setImmediate(() => {
        triggerWebhook({
          paymentCode,
          status: 'SUCCESS',
          amount: session.amount,
          customerPhone: session.phone,
          bakiEntryId: String(entry._id),
        }).catch((err) => console.error('[USSD][WEBHOOK_SIM_FAIL]', err));
      });

      return success(req, res, {
        step: 'confirmed',
        message: `পেমেন্ট সফল হয়েছে!\n\nপরিমাণ: ৳${session.amount}\nকোড: ${paymentCode}\n\nধন্যবাদ!`,
        data: {
          bakiEntryId: String(entry._id),
          paymentCode,
          amount: session.amount,
          paidAt: new Date().toISOString(),
        },
      });
    }

    return sendError(req, res, {
      statusCode: 400,
      code: 'INVALID_STEP',
      message: `Unknown step: ${step}`,
    });
  } catch (err) {
    console.error('[USSD][processPayment]', err);
    return sendError(req, res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Payment processing failed.' });
  }
};

// Internal helper — fires webhook against this same server
async function triggerWebhook({ paymentCode, status, amount, customerPhone, bakiEntryId }) {
  const http = require('http');
  const payload = JSON.stringify({ paymentCode, status, amount, customerPhone, bakiEntryId });
  const options = {
    hostname: '127.0.0.1',
    port: process.env.PORT || 3000,
    path: '/payments/webhook',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'X-Webhook-Secret': process.env.WEBHOOK_SECRET || 'hisab-ussd-secret',
    },
  };

  return new Promise((resolve, reject) => {
    const httpReq = http.request(options, (httpRes) => {
      let data = '';
      httpRes.on('data', (chunk) => { data += chunk; });
      httpRes.on('end', () => resolve(data));
    });
    httpReq.on('error', reject);
    httpReq.write(payload);
    httpReq.end();
  });
}
