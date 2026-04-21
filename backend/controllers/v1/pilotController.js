const PilotShop = require('../../models/PilotShop');
const { success } = require('../../utils/apiResponse');
const { badRequest } = require('../../services/v1/httpError');
const { asyncHandler, getUserIdFromReq } = require('./controllerUtils');
const { trackEvent, listEvents } = require('../../analytics/eventTracker');
const { computeMetricsOverview } = require('../../analytics/metricsCalculator');
const {
  createFeedback,
  listFeedback,
  summarizeFeedback,
} = require('../../feedback/feedbackService');

const ALLOWED_SHOP_STATUSES = new Set(['planned', 'active', 'paused', 'completed']);
const ALLOWED_FEEDBACK_CATEGORIES = new Set(['bug', 'feature', 'ux']);

const DEFAULT_HELP_CENTER_ARTICLES = Object.freeze([
  {
    slug: 'how-to-sell',
    title: 'How To Sell Fast',
    content: [
      'Open Sales from the drawer and search product by name or barcode.',
      'Use quantity shortcuts for common item counts.',
      'Confirm payment method and save receipt to complete sale.',
    ],
  },
  {
    slug: 'how-to-manage-baki',
    title: 'How To Manage Baki',
    content: [
      'Create credit entries with clear due dates and notes.',
      'Record payments as soon as cash is received.',
      'Review collections dashboard daily to reduce overdue balance.',
    ],
  },
  {
    slug: 'how-to-view-reports',
    title: 'How To View Reports',
    content: [
      'Go to Reports and select daily, weekly, or monthly period.',
      'Export CSV/PDF for accountant and shop owner review.',
      'Capture audit snapshot at end of day for compliance evidence.',
    ],
  },
]);

const ONBOARDING_TEMPLATES = Object.freeze({
  grocery: {
    keyFocus: 'fast_pos_setup',
    title: 'Grocery Pilot Template',
    checklist: [
      'Import top 50 fast-moving products first.',
      'Enable quick quantity presets for checkout.',
      'Train cashier on 3-minute sale flow and receipt handoff.',
    ],
  },
  pharmacy: {
    keyFocus: 'expiry_tracking_emphasis',
    title: 'Pharmacy Pilot Template',
    checklist: [
      'Tag every batch with expiry date during stock entry.',
      'Review expiry alerts at opening and closing shift.',
      'Prioritize FEFO recommendations for daily restocking.',
    ],
  },
  general_store: {
    keyFocus: 'balanced_ops',
    title: 'General Store Template',
    checklist: [
      'Set reorder levels for household essentials.',
      'Capture baki payments before new credit issuance.',
      'Review daily dashboard to track sales and due balance.',
    ],
  },
  default: {
    keyFocus: 'adoption_baseline',
    title: 'Standard Pilot Template',
    checklist: [
      'Complete onboarding walkthrough for all operators.',
      'Record every sale digitally for first 14 days.',
      'Collect feedback twice per week from active users.',
    ],
  },
});

const toPositiveInt = (value, fallback = 50, max = 500) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }

  return Math.min(Math.trunc(numeric), max);
};

const normalizeStatus = (value, fallback = 'planned') => {
  const normalized = String(value || fallback).trim().toLowerCase();
  return ALLOWED_SHOP_STATUSES.has(normalized) ? normalized : fallback;
};

const normalizeShopType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || null;
};

const serializePilotShop = (doc) => ({
  id: String(doc._id),
  shop_name: doc.shopName,
  type: doc.type,
  onboarding_date: doc.onboardingDate,
  status: doc.status,
  estimated_daily_sales: Number(doc.estimatedDailySales || 0),
  created_at: doc.createdAt,
  updated_at: doc.updatedAt,
});

const getPilotSetupStructure = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);

  const shops = await PilotShop.find({ userId }).sort({ onboardingDate: -1, _id: -1 }).lean();

  const breakdown = shops.reduce((acc, row) => {
    const key = String(row.type || 'unknown').trim().toLowerCase() || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return success(req, res, {
    objective: 'Pilot with 5-10 diverse shops to validate market fit and adoption.',
    currentCount: shops.length,
    targetRange: {
      min: 5,
      max: 10,
    },
    diversityBreakdown: breakdown,
    shopTypesSuggested: ['grocery', 'pharmacy', 'general_store'],
    pilotShops: shops.map((row) => serializePilotShop(row)),
  });
});

const createPilotShop = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const shopName = String(req.body?.shop_name || req.body?.shopName || '').trim();
  const type = normalizeShopType(req.body?.type);

  if (!shopName) {
    throw badRequest('shop_name is required.');
  }

  if (!type) {
    throw badRequest('type is required.');
  }

  const onboardingDate = req.body?.onboarding_date || req.body?.onboardingDate || new Date().toISOString();
  const parsedDate = new Date(onboardingDate);
  if (Number.isNaN(parsedDate.getTime())) {
    throw badRequest('onboarding_date must be a valid date.');
  }

  const created = await PilotShop.create({
    userId,
    shopName,
    type,
    onboardingDate: parsedDate,
    status: normalizeStatus(req.body?.status, 'planned'),
    estimatedDailySales: Math.max(0, Number(req.body?.estimated_daily_sales || req.body?.estimatedDailySales || 0)),
  });

  return success(req, res, {
    pilot_shop: serializePilotShop(created),
  }, 201);
});

const listPilotShops = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const status = String(req.query?.status || '').trim().toLowerCase();

  const query = { userId };
  if (status && ALLOWED_SHOP_STATUSES.has(status)) {
    query.status = status;
  }

  const rows = await PilotShop.find(query).sort({ onboardingDate: -1, _id: -1 }).lean();

  return success(req, res, {
    items: rows.map((row) => serializePilotShop(row)),
  });
});

const updatePilotShopStatus = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const shopId = String(req.params?.shopId || '').trim();
  const status = normalizeStatus(req.body?.status, 'planned');

  if (!shopId) {
    throw badRequest('shopId is required.');
  }

  if (!ALLOWED_SHOP_STATUSES.has(status)) {
    throw badRequest('status is invalid.');
  }

  const updated = await PilotShop.findOneAndUpdate(
    { _id: shopId, userId },
    {
      $set: { status },
    },
    { new: true }
  );

  if (!updated) {
    throw badRequest('Pilot shop not found.');
  }

  return success(req, res, {
    pilot_shop: serializePilotShop(updated),
  });
});

const trackAnalyticsEvent = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const eventType = String(req.body?.event_type || req.body?.eventType || '').trim().toLowerCase();

  if (!eventType) {
    throw badRequest('event_type is required.');
  }

  const tracked = await trackEvent({
    userId,
    shopId: req.body?.shop_id || req.body?.shopId || null,
    eventType,
    timestamp: req.body?.timestamp || new Date().toISOString(),
    metadata: req.body?.metadata || null,
    source: req.body?.source || 'mobile_app',
  });

  return success(req, res, { event: tracked }, 201);
});

const listAnalyticsEvents = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const items = await listEvents({
    userId,
    from: req.query?.from || null,
    to: req.query?.to || null,
    eventType: req.query?.eventType || req.query?.event_type || null,
    shopId: req.query?.shopId || req.query?.shop_id || null,
    limit: toPositiveInt(req.query?.limit, 100, 1000),
  });

  return success(req, res, { items });
});

const getMetrics = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const metrics = await computeMetricsOverview({
    userId,
    from: req.query?.from || null,
    to: req.query?.to || null,
  });

  return success(req, res, metrics);
});

const submitFeedbackEntry = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const shopId = String(req.body?.shop_id || req.body?.shopId || '').trim();
  const message = String(req.body?.message || '').trim();
  const category = String(req.body?.category || '').trim().toLowerCase();

  if (!shopId) {
    throw badRequest('shop_id is required.');
  }

  if (!message) {
    throw badRequest('message is required.');
  }

  if (!ALLOWED_FEEDBACK_CATEGORIES.has(category)) {
    throw badRequest('category must be bug, feature, or ux.');
  }

  const created = await createFeedback({
    shopId,
    userId,
    message,
    category,
    rating: req.body?.rating,
    timestamp: req.body?.timestamp || new Date().toISOString(),
  });

  return success(req, res, { feedback: created }, 201);
});

const listFeedbackEntries = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);

  const [items, summary] = await Promise.all([
    listFeedback({
      userId,
      shopId: req.query?.shopId || req.query?.shop_id || null,
      category: req.query?.category || null,
      limit: toPositiveInt(req.query?.limit, 100, 500),
    }),
    summarizeFeedback({
      userId,
      shopId: req.query?.shopId || req.query?.shop_id || null,
    }),
  ]);

  return success(req, res, {
    items,
    summary,
  });
});

const getOnboardingTemplates = asyncHandler(async (req, res) => {
  return success(req, res, {
    templates: ONBOARDING_TEMPLATES,
    walkthrough: [
      {
        step: 'Welcome & Shop Context',
        instruction: 'Select shop type and pilot objectives.',
      },
      {
        step: 'Core Setup',
        instruction: 'Add products, customers, and default payment methods.',
      },
      {
        step: 'First Sale Drill',
        instruction: 'Complete a sale and verify receipt behavior.',
      },
      {
        step: 'Collections Drill',
        instruction: 'Record a baki payment and review ledger updates.',
      },
    ],
  });
});

const getHelpCenterArticles = asyncHandler(async (_req, res) => {
  return success(_req, res, {
    items: DEFAULT_HELP_CENTER_ARTICLES,
  });
});

const getActivityMetricsInsightExample = asyncHandler(async (_req, res) => {
  return success(_req, res, {
    example: {
      activity: {
        event_type: 'sale_created',
        metadata: {
          amount: 1250,
          actorUserId: 'operator_12',
        },
      },
      metrics: {
        dao: 'operator_12 contributes to today active operator count.',
        digitalSalesRatio: 'sale amount contributes to digital sales numerator.',
        featureUsage: 'sales feature usage count increments by 1.',
      },
      insight: 'Sales module adoption is improving while digital capture ratio increases.',
    },
  });
});

module.exports = {
  getPilotSetupStructure,
  createPilotShop,
  listPilotShops,
  updatePilotShopStatus,
  trackAnalyticsEvent,
  listAnalyticsEvents,
  getMetrics,
  submitFeedbackEntry,
  listFeedbackEntries,
  getOnboardingTemplates,
  getHelpCenterArticles,
  getActivityMetricsInsightExample,
};
