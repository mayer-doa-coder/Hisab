import { requestBackendJson } from './httpClient';

const buildQuery = (params = {}) => {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      return;
    }

    search.set(key, String(value));
  });

  const query = search.toString();
  return query ? `?${query}` : '';
};

export const fetchPilotSetupStructureOnline = async ({ accessToken } = {}) => {
  return requestBackendJson({
    path: '/api/v1/pilot/setup/structure',
    method: 'GET',
    accessToken,
    timeoutMs: 10000,
  });
};

export const createPilotShopOnline = async ({
  accessToken,
  shopName,
  type,
  onboardingDate = null,
  status = 'planned',
  estimatedDailySales = 0,
} = {}) => {
  return requestBackendJson({
    path: '/api/v1/pilot/shops',
    method: 'POST',
    accessToken,
    body: {
      shop_name: shopName,
      type,
      onboarding_date: onboardingDate,
      status,
      estimated_daily_sales: estimatedDailySales,
    },
    timeoutMs: 12000,
  });
};

export const listPilotShopsOnline = async ({ accessToken, status = null } = {}) => {
  const query = buildQuery({ status });
  return requestBackendJson({
    path: `/api/v1/pilot/shops${query}`,
    method: 'GET',
    accessToken,
    timeoutMs: 12000,
  });
};

export const updatePilotShopStatusOnline = async ({ accessToken, shopId, status } = {}) => {
  return requestBackendJson({
    path: `/api/v1/pilot/shops/${shopId}/status`,
    method: 'PATCH',
    accessToken,
    body: { status },
    timeoutMs: 12000,
  });
};

export const trackAnalyticsEventOnline = async ({
  accessToken,
  eventType,
  metadata = null,
  timestamp = null,
  shopId = null,
  source = 'mobile_app',
} = {}) => {
  return requestBackendJson({
    path: '/api/v1/pilot/analytics/events',
    method: 'POST',
    accessToken,
    body: {
      event_type: eventType,
      metadata,
      timestamp,
      shop_id: shopId,
      source,
    },
    timeoutMs: 10000,
  });
};

export const listAnalyticsEventsOnline = async ({
  accessToken,
  eventType = null,
  from = null,
  to = null,
  shopId = null,
  limit = 100,
} = {}) => {
  const query = buildQuery({ eventType, from, to, shopId, limit });
  return requestBackendJson({
    path: `/api/v1/pilot/analytics/events${query}`,
    method: 'GET',
    accessToken,
    timeoutMs: 12000,
  });
};

export const fetchPilotMetricsOverviewOnline = async ({ accessToken, from = null, to = null } = {}) => {
  const query = buildQuery({ from, to });
  return requestBackendJson({
    path: `/api/v1/pilot/metrics/overview${query}`,
    method: 'GET',
    accessToken,
    timeoutMs: 12000,
  });
};

export const submitFeedbackOnline = async ({
  accessToken,
  shopId,
  message,
  category,
  rating = null,
  timestamp = null,
} = {}) => {
  return requestBackendJson({
    path: '/api/v1/pilot/feedback',
    method: 'POST',
    accessToken,
    body: {
      shop_id: shopId,
      message,
      category,
      rating,
      timestamp,
    },
    timeoutMs: 12000,
  });
};

export const listFeedbackOnline = async ({ accessToken, shopId = null, category = null, limit = 100 } = {}) => {
  const query = buildQuery({ shopId, category, limit });
  return requestBackendJson({
    path: `/api/v1/pilot/feedback${query}`,
    method: 'GET',
    accessToken,
    timeoutMs: 12000,
  });
};

export const fetchOnboardingTemplatesOnline = async ({ accessToken } = {}) => {
  return requestBackendJson({
    path: '/api/v1/pilot/onboarding/templates',
    method: 'GET',
    accessToken,
    timeoutMs: 10000,
  });
};

export const fetchHelpCenterArticlesOnline = async ({ accessToken } = {}) => {
  return requestBackendJson({
    path: '/api/v1/pilot/help-center/articles',
    method: 'GET',
    accessToken,
    timeoutMs: 10000,
  });
};

export const fetchActivityInsightExampleOnline = async ({ accessToken } = {}) => {
  return requestBackendJson({
    path: '/api/v1/pilot/example/activity-metrics-insight',
    method: 'GET',
    accessToken,
    timeoutMs: 10000,
  });
};
