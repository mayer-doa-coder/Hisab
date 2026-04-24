import { requestBackendJson } from './httpClient';

const INTENT_TO_API = Object.freeze({
  ADD_DEBT: {
    path: '/api/v1/baki/credits',
    method: 'POST',
    toBody: (payload) => ({
      customerId: payload.customer_id,
      amount: payload.amount,
      dueDate: payload.date || null,
      note: payload.note || 'voice_command',
      occurredAt: payload.date || null,
      referenceId: payload.reference_id || null,
    }),
  },
  PAYMENT: {
    path: '/api/v1/baki/payments',
    method: 'POST',
    toBody: (payload) => ({
      customerId: payload.customer_id,
      amount: payload.amount,
      paymentMethod: 'cash',
      note: payload.note || 'voice_command',
      occurredAt: payload.date || null,
      referenceId: payload.reference_id || null,
    }),
  },
  SALE: {
    path: '/api/v1/transactions',
    method: 'POST',
    toBody: (payload) => ({
      transactionType: 'sale',
      amount: payload.amount,
      customerId: payload.customer_id || null,
      note: payload.note || 'voice_command',
      occurredAt: payload.date || null,
      referenceId: payload.reference_id || null,
    }),
  },
});

export const getApiMappingForIntent = (intent) => {
  const key = String(intent || '').trim().toUpperCase();
  return INTENT_TO_API[key] || null;
};

export const executeMappedIntentOnline = async ({
  intent,
  payload,
  accessToken,
  idempotencyKey,
}) => {
  const mapping = getApiMappingForIntent(intent);
  if (!mapping) {
    throw new Error(`No backend mapping found for intent: ${intent}`);
  }

  return requestBackendJson({
    path: mapping.path,
    method: mapping.method,
    body: mapping.toBody(payload),
    accessToken,
    extraHeaders: {
      'Idempotency-Key': idempotencyKey,
    },
  });
};

export default {
  executeMappedIntentOnline,
  getApiMappingForIntent,
};
