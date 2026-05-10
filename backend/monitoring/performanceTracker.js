const MAX_EVENTS = 5000;

const requestEvents = [];

const toMs = (hrtimeStart) => {
  const diff = process.hrtime(hrtimeStart);
  return Number(((diff[0] * 1000) + (diff[1] / 1e6)).toFixed(3));
};

const pushEvent = (row) => {
  requestEvents.push(row);
  if (requestEvents.length > MAX_EVENTS) {
    requestEvents.shift();
  }
  return row;
};

const buildRouteKey = (row) => {
  const method = String(row?.method || 'GET').trim().toUpperCase();
  const route = String(row?.route || 'unknown').trim() || 'unknown';
  return `${method} ${route}`;
};

const computePercentile = (values = [], p = 0.95) => {
  const numeric = values
    .map((row) => Number(row))
    .filter((row) => Number.isFinite(row))
    .sort((left, right) => left - right);

  if (!numeric.length) {
    return 0;
  }

  const idx = Math.min(numeric.length - 1, Math.max(0, Math.floor((numeric.length - 1) * p)));
  return Number(numeric[idx].toFixed(3));
};

const createPerformanceMiddleware = ({ ignorePaths = [] } = {}) => {
  const ignoreSet = new Set(Array.isArray(ignorePaths) ? ignorePaths : []);

  return (req, res, next) => {
    const startedAt = process.hrtime();

    res.on('finish', () => {
      const route = String(req.originalUrl || req.url || '').split('?')[0] || 'unknown';
      if (ignoreSet.has(route)) {
        return;
      }

      pushEvent({
        timestamp: new Date().toISOString(),
        source: 'server',
        method: String(req.method || 'GET').toUpperCase(),
        route,
        statusCode: Number(res.statusCode || 0),
        durationMs: toMs(startedAt),
        requestId: req.requestId || null,
        userId: String(req.user_id || req.auth?.tenant_user_id || req.auth?.user_id || '').trim() || null,
      });
    });

    next();
  };
};

const trackClientPerformance = ({
  route,
  method = 'POST',
  statusCode = 0,
  durationMs = 0,
  userId = null,
  metadata = null,
} = {}) => {
  return pushEvent({
    timestamp: new Date().toISOString(),
    source: 'client',
    route: String(route || 'unknown').trim() || 'unknown',
    method: String(method || 'POST').trim().toUpperCase() || 'POST',
    statusCode: Number(statusCode || 0),
    durationMs: Number.isFinite(Number(durationMs)) ? Math.max(0, Number(durationMs)) : 0,
    userId: userId ? String(userId) : null,
    metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {},
  });
};

const getPerformanceSnapshot = ({ windowMinutes = 30, limit = 1000 } = {}) => {
  const normalizedWindowMinutes = Number.isFinite(Number(windowMinutes)) ? Math.max(1, Number(windowMinutes)) : 30;
  const normalizedLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.trunc(Number(limit))) : 1000;
  const cutoff = Date.now() - (normalizedWindowMinutes * 60 * 1000);

  const rows = requestEvents
    .slice(-normalizedLimit)
    .filter((row) => {
      const ts = new Date(row.timestamp).getTime();
      return Number.isFinite(ts) && ts >= cutoff;
    });

  const latency = rows.map((row) => Number(row.durationMs || 0));
  const errorCount = rows.filter((row) => Number(row.statusCode || 0) >= 500).length;

  const byRouteMap = new Map();
  for (const row of rows) {
    const key = buildRouteKey(row);
    if (!byRouteMap.has(key)) {
      byRouteMap.set(key, []);
    }
    byRouteMap.get(key).push(row);
  }

  const byRoute = [...byRouteMap.entries()]
    .map(([key, routeRows]) => {
      const parts = key.split(' ');
      const method = parts.shift() || 'GET';
      const route = parts.join(' ') || 'unknown';
      const routeLatency = routeRows.map((row) => Number(row.durationMs || 0));
      const routeErrors = routeRows.filter((row) => Number(row.statusCode || 0) >= 500).length;
      const avgLatency = routeLatency.length
        ? Number((routeLatency.reduce((sum, value) => sum + value, 0) / routeLatency.length).toFixed(3))
        : 0;

      return {
        method,
        route,
        requests: routeRows.length,
        errorRate: routeRows.length ? Number((routeErrors / routeRows.length).toFixed(6)) : 0,
        avgLatencyMs: avgLatency,
        p95LatencyMs: computePercentile(routeLatency, 0.95),
      };
    })
    .sort((left, right) => right.requests - left.requests)
    .slice(0, 20);

  const avgLatency = latency.length
    ? Number((latency.reduce((sum, value) => sum + value, 0) / latency.length).toFixed(3))
    : 0;

  return {
    generatedAt: new Date().toISOString(),
    windowMinutes: normalizedWindowMinutes,
    requestCount: rows.length,
    errorRate: rows.length ? Number((errorCount / rows.length).toFixed(6)) : 0,
    avgLatencyMs: avgLatency,
    p95LatencyMs: computePercentile(latency, 0.95),
    p99LatencyMs: computePercentile(latency, 0.99),
    byRoute,
  };
};

module.exports = {
  createPerformanceMiddleware,
  trackClientPerformance,
  getPerformanceSnapshot,
};
