const { success } = require('../../utils/apiResponse');
const { badRequest, notFound } = require('../../services/v1/httpError');
const { asyncHandler, getUserIdFromReq, getActorUserIdFromReq, getBranchIdFromReq } = require('./controllerUtils');
const { logAudit } = require('../../services/v1/auditService');
const AuditSnapshot = require('../../models/AuditSnapshot');
const { generateSalesReport } = require('../../reports/salesReport');
const { generateInventoryReport } = require('../../reports/inventoryReport');
const { generateFinanceReport } = require('../../reports/financeReport');
const { generateCollectionsReport } = require('../../reports/collectionsReport');
const {
  normalizePeriod,
  parseDateInput,
  resolveDateRange,
  startOfUtcDay,
  endOfUtcDay,
} = require('../../reports/reportUtils');
const { buildCsvExport } = require('../../export/csvExporter');
const { buildPdfExport } = require('../../export/pdfExporter');

const normalizeReportType = (value) => String(value || '').trim().toLowerCase();

const buildDateRangeFromQuery = (query = {}) => {
  const period = normalizePeriod(query.period || 'daily');
  if (!period) {
    throw badRequest('period must be one of daily, weekly, monthly.', [{ field: 'period', reason: 'invalid' }]);
  }

  const fromProvided = typeof query.from === 'string' && query.from.trim().length > 0;
  const toProvided = typeof query.to === 'string' && query.to.trim().length > 0;

  const from = parseDateInput(query.from);
  const to = parseDateInput(query.to);

  if (fromProvided && !from) {
    throw badRequest('from must be a valid ISO datetime.', [{ field: 'from', reason: 'invalid' }]);
  }

  if (toProvided && !to) {
    throw badRequest('to must be a valid ISO datetime.', [{ field: 'to', reason: 'invalid' }]);
  }

  return resolveDateRange({ period, from, to });
};

const buildReportContext = (req) => {
  const userId = getUserIdFromReq(req);
  if (!userId) {
    throw badRequest('Authenticated user scope is missing.', [{ field: 'userId', reason: 'missing_scope' }]);
  }

  return {
    userId,
    actorUserId: getActorUserIdFromReq(req),
    branchId: getBranchIdFromReq(req),
  };
};

const generateByType = async ({ type, userId, branchId, period, dateRange }) => {
  if (type === 'sales') {
    return generateSalesReport({ userId, branchId, period, dateRange });
  }

  if (type === 'inventory') {
    return generateInventoryReport({ userId, branchId, period, dateRange });
  }

  if (type === 'finance') {
    return generateFinanceReport({ userId, branchId, period, dateRange });
  }

  if (type === 'collections') {
    return generateCollectionsReport({ userId, branchId, period, dateRange });
  }

  throw notFound('Requested report type is not supported.');
};

const generateAllReports = async ({ userId, branchId, period, dateRange }) => {
  const [sales, inventory, finance, collections] = await Promise.all([
    generateSalesReport({ userId, branchId, period, dateRange }),
    generateInventoryReport({ userId, branchId, period, dateRange }),
    generateFinanceReport({ userId, branchId, period, dateRange }),
    generateCollectionsReport({ userId, branchId, period, dateRange }),
  ]);

  return {
    sales,
    inventory,
    finance,
    collections,
  };
};

const getComplianceDashboard = asyncHandler(async (req, res) => {
  const { userId, branchId } = buildReportContext(req);
  const dateRange = buildDateRangeFromQuery(req.query || {});

  const reports = await generateAllReports({
    userId,
    branchId,
    period: dateRange.period,
    dateRange,
  });

  const data = {
    generatedAt: new Date().toISOString(),
    period: dateRange.period,
    dateRange: {
      from: dateRange.from.toISOString(),
      to: dateRange.to.toISOString(),
    },
    dashboards: {
      sales: {
        totalSales: reports.sales.summary.totalSales,
        transactionCount: reports.sales.summary.transactionCount,
        topSellingProducts: reports.sales.summary.topSellingProducts,
      },
      inventory: {
        currentStockLevels: reports.inventory.breakdown.currentStockLevels,
        lowStockItems: reports.inventory.breakdown.lowStockItems,
        deadStockItems: reports.inventory.breakdown.deadStockItems,
      },
      finance: {
        totalRevenue: reports.finance.summary.totalRevenue,
        totalExpenses: reports.finance.summary.totalExpenses,
        netProfit: reports.finance.summary.netProfit,
      },
      collections: {
        totalBaki: reports.collections.summary.totalBaki,
        overdueAmount: reports.collections.summary.overdueAmount,
        recoveryRate: reports.collections.summary.recoveryRate,
      },
    },
  };

  return success(req, res, data);
});

const getSalesReport = asyncHandler(async (req, res) => {
  const { userId, branchId } = buildReportContext(req);
  const dateRange = buildDateRangeFromQuery(req.query || {});

  const data = await generateSalesReport({
    userId,
    branchId,
    period: dateRange.period,
    dateRange,
  });

  return success(req, res, data);
});

const getInventoryReport = asyncHandler(async (req, res) => {
  const { userId, branchId } = buildReportContext(req);
  const dateRange = buildDateRangeFromQuery(req.query || {});

  const data = await generateInventoryReport({
    userId,
    branchId,
    period: dateRange.period,
    dateRange,
  });

  return success(req, res, data);
});

const getFinanceReport = asyncHandler(async (req, res) => {
  const { userId, branchId } = buildReportContext(req);
  const dateRange = buildDateRangeFromQuery(req.query || {});

  const data = await generateFinanceReport({
    userId,
    branchId,
    period: dateRange.period,
    dateRange,
  });

  return success(req, res, data);
});

const getCollectionsReport = asyncHandler(async (req, res) => {
  const { userId, branchId } = buildReportContext(req);
  const dateRange = buildDateRangeFromQuery(req.query || {});

  const data = await generateCollectionsReport({
    userId,
    branchId,
    period: dateRange.period,
    dateRange,
  });

  return success(req, res, data);
});

const getTaxSummary = asyncHandler(async (req, res) => {
  const { userId, branchId } = buildReportContext(req);
  const dateRange = buildDateRangeFromQuery(req.query || {});

  const financeReport = await generateFinanceReport({
    userId,
    branchId,
    period: dateRange.period,
    dateRange,
  });

  return success(req, res, {
    generatedAt: new Date().toISOString(),
    period: dateRange.period,
    dateRange: {
      from: dateRange.from.toISOString(),
      to: dateRange.to.toISOString(),
    },
    taxSummary: financeReport.taxSummary,
    reconciliation: financeReport.reconciliation,
  });
});

const getReconciliationOverview = asyncHandler(async (req, res) => {
  const { userId, branchId } = buildReportContext(req);
  const dateRange = buildDateRangeFromQuery(req.query || {});

  const reports = await generateAllReports({
    userId,
    branchId,
    period: dateRange.period,
    dateRange,
  });

  const checks = [
    { reportType: 'sales', reconciled: Boolean(reports.sales.reconciliation?.reconciled), checks: reports.sales.reconciliation?.checks || [] },
    { reportType: 'inventory', reconciled: Boolean(reports.inventory.reconciliation?.reconciled), checks: reports.inventory.reconciliation?.checks || [] },
    { reportType: 'finance', reconciled: Boolean(reports.finance.reconciliation?.reconciled), checks: reports.finance.reconciliation?.checks || [] },
    { reportType: 'collections', reconciled: Boolean(reports.collections.reconciliation?.reconciled), checks: reports.collections.reconciliation?.checks || [] },
  ];

  return success(req, res, {
    generatedAt: new Date().toISOString(),
    period: dateRange.period,
    dateRange: {
      from: dateRange.from.toISOString(),
      to: dateRange.to.toISOString(),
    },
    allReconciled: checks.every((row) => row.reconciled),
    reports: checks,
  });
});

const exportReport = asyncHandler(async (req, res) => {
  const { userId, branchId, actorUserId } = buildReportContext(req);
  const type = normalizeReportType(req.params.reportType);
  const format = String(req.query.format || 'csv').trim().toLowerCase();

  if (!['csv', 'pdf'].includes(format)) {
    throw badRequest('format must be csv or pdf.', [{ field: 'format', reason: 'invalid' }]);
  }

  const dateRange = buildDateRangeFromQuery(req.query || {});
  const report = await generateByType({
    type,
    userId,
    branchId,
    period: dateRange.period,
    dateRange,
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `hisab-${type}-report-${dateRange.period}-${stamp}.${format}`;

  if (format === 'csv') {
    const csvContent = buildCsvExport({ reportType: type, reportData: report });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    await logAudit({
      userId,
      tenantUserId: userId,
      actorUserId,
      branchId,
      entityType: 'report_export',
      action: 'csv_export',
      entityId: type,
      source: 'api',
      metadata: {
        reportType: type,
        period: dateRange.period,
        from: dateRange.from.toISOString(),
        to: dateRange.to.toISOString(),
      },
    });

    return res.status(200).send(csvContent);
  }

  const pdfBuffer = await buildPdfExport({ reportType: type, reportData: report });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

  await logAudit({
    userId,
    tenantUserId: userId,
    actorUserId,
    branchId,
    entityType: 'report_export',
    action: 'pdf_export',
    entityId: type,
    source: 'api',
    metadata: {
      reportType: type,
      period: dateRange.period,
      from: dateRange.from.toISOString(),
      to: dateRange.to.toISOString(),
      bytes: pdfBuffer.length,
    },
  });

  return res.status(200).send(pdfBuffer);
});

const captureAuditSnapshot = asyncHandler(async (req, res) => {
  const { userId, actorUserId, branchId } = buildReportContext(req);
  const snapshotDateInput = req.body?.snapshotDate || req.query?.snapshotDate || null;

  let basisDate = new Date();
  if (snapshotDateInput) {
    const parsed = parseDateInput(snapshotDateInput);
    if (!parsed) {
      throw badRequest('snapshotDate must be a valid ISO datetime.', [{ field: 'snapshotDate', reason: 'invalid' }]);
    }
    basisDate = parsed;
  }

  const snapshotStart = startOfUtcDay(basisDate);
  const snapshotEnd = endOfUtcDay(basisDate);

  const snapshotMatch = {
    userId,
    snapshot_date: snapshotStart,
  };

  if (branchId) {
    snapshotMatch.branchId = branchId;
  }

  const existing = await AuditSnapshot.findOne(snapshotMatch).lean();
  if (existing) {
    return success(req, res, {
      immutable: true,
      created: false,
      snapshot: existing,
    });
  }

  const dateRange = {
    period: 'daily',
    from: snapshotStart,
    to: snapshotEnd,
  };

  const reports = await generateAllReports({
    userId,
    branchId,
    period: 'daily',
    dateRange,
  });

  const summary_data = {
    generated_at: new Date().toISOString(),
    range: {
      from: snapshotStart.toISOString(),
      to: snapshotEnd.toISOString(),
    },
    dashboards: {
      sales: reports.sales.summary,
      inventory: reports.inventory.summary,
      finance: reports.finance.summary,
      collections: reports.collections.summary,
    },
    tax_summary: reports.finance.taxSummary,
    reconciliation: {
      all_reconciled:
        Boolean(reports.sales.reconciliation?.reconciled)
        && Boolean(reports.inventory.reconciliation?.reconciled)
        && Boolean(reports.finance.reconciliation?.reconciled)
        && Boolean(reports.collections.reconciliation?.reconciled),
      sales: reports.sales.reconciliation,
      inventory: reports.inventory.reconciliation,
      finance: reports.finance.reconciliation,
      collections: reports.collections.reconciliation,
    },
  };

  const created = await AuditSnapshot.create({
    userId,
    branchId: branchId || null,
    snapshot_date: snapshotStart,
    summary_data,
  });

  await logAudit({
    userId,
    tenantUserId: userId,
    actorUserId,
    branchId,
    entityType: 'audit_snapshot',
    action: 'capture',
    entityId: String(created._id),
    source: 'api',
    metadata: {
      snapshot_date: snapshotStart.toISOString(),
    },
  });

  return success(req, res, {
    immutable: true,
    created: true,
    snapshot: created,
  }, 201);
});

const listAuditSnapshots = asyncHandler(async (req, res) => {
  const { userId, branchId } = buildReportContext(req);
  const fromRaw = req.query?.from || null;
  const toRaw = req.query?.to || null;

  const from = fromRaw ? parseDateInput(fromRaw) : null;
  const to = toRaw ? parseDateInput(toRaw) : null;

  if (fromRaw && !from) {
    throw badRequest('from must be a valid ISO datetime.', [{ field: 'from', reason: 'invalid' }]);
  }

  if (toRaw && !to) {
    throw badRequest('to must be a valid ISO datetime.', [{ field: 'to', reason: 'invalid' }]);
  }

  const limitRaw = Number(req.query?.limit);
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 180) : 30;

  const match = {
    userId,
  };

  if (branchId) {
    match.branchId = branchId;
  }

  if (from || to) {
    match.snapshot_date = {};
    if (from) {
      match.snapshot_date.$gte = from;
    }
    if (to) {
      match.snapshot_date.$lte = to;
    }
  }

  const rows = await AuditSnapshot.find(match)
    .sort({ snapshot_date: -1 })
    .limit(limit)
    .lean();

  return success(req, res, {
    total: rows.length,
    rows,
  });
});

module.exports = {
  getComplianceDashboard,
  getSalesReport,
  getInventoryReport,
  getFinanceReport,
  getCollectionsReport,
  getTaxSummary,
  getReconciliationOverview,
  exportReport,
  captureAuditSnapshot,
  listAuditSnapshots,
};
