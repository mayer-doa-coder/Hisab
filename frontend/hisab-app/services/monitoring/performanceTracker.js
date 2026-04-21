const MAX_EVENTS = 200;

const performanceEvents = [];

const pushEvent = (event) => {
  performanceEvents.push(event);
  if (performanceEvents.length > MAX_EVENTS) {
    performanceEvents.shift();
  }
  return event;
};

export const startPerfTimer = () => {
  return Date.now();
};

export const finishPerfTimer = ({
  startedAt,
  route = 'unknown',
  method = 'GET',
  statusCode = 0,
  metadata = null,
} = {}) => {
  const startedMs = Number(startedAt || Date.now());
  const durationMs = Math.max(0, Date.now() - startedMs);

  const row = {
    timestamp: new Date().toISOString(),
    route: String(route || 'unknown').trim() || 'unknown',
    method: String(method || 'GET').trim().toUpperCase() || 'GET',
    statusCode: Number(statusCode || 0),
    durationMs,
    metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {},
  };

  return pushEvent(row);
};

export const getLocalPerformanceSummary = () => {
  const rows = [...performanceEvents];
  const durations = rows.map((row) => Number(row.durationMs || 0));

  const avg = durations.length
    ? durations.reduce((sum, value) => sum + value, 0) / durations.length
    : 0;

  const sorted = [...durations].sort((left, right) => left - right);
  const p95 = sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * 0.95))]
    : 0;

  return {
    generatedAt: new Date().toISOString(),
    sampleCount: rows.length,
    avgLatencyMs: Number(avg.toFixed(2)),
    p95LatencyMs: Number(Number(p95 || 0).toFixed(2)),
    recent: rows.slice(-20).reverse(),
  };
};

export const clearLocalPerformanceEvents = () => {
  performanceEvents.length = 0;
};
