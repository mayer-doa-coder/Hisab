import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { AppDataContext } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  addBaki as dbAddBaki,
  addPayment as dbAddPayment,
  addCustomer as dbAddCustomer,
  createTables,
  deleteCustomer as dbDeleteCustomer,
  deleteProduct as dbDeleteProduct,
  fetchBakiWithCustomer,
  fetchCustomers,
  fetchCustomersBasic,
  fetchProducts,
  getCustomerRiskMetrics as dbGetCustomerRiskMetrics,
  getCustomerFeatureSourceRows as dbGetCustomerFeatureSourceRows,
  getExpiredProducts as dbGetExpiredProducts,
  getExpiringSoonProducts as dbGetExpiringSoonProducts,
  getLowStockProducts as dbGetLowStockProducts,
  getInventoryBatches as dbGetInventoryBatches,
  selectBatchForSale as dbSelectBatchForSale,
  getInventoryAlerts as dbGetInventoryAlerts,
  refreshInventoryAlerts as dbRefreshInventoryAlerts,
  getDeadStockProducts as dbGetDeadStockProducts,
  getInventoryHealthInsights as dbGetInventoryHealthInsights,
  getCycleCounts as dbGetCycleCounts,
  recordCycleCount as dbRecordCycleCount,
  validateInventoryBatchConsistency as dbValidateInventoryBatchConsistency,
  getCustomerLedger as dbGetCustomerLedger,
  getBakiKpiSummary as dbGetBakiKpiSummary,
  getCollectionsDashboard as dbGetCollectionsDashboard,
  getCustomerStatement as dbGetCustomerStatement,
  buildCustomerStatementCsv as dbBuildCustomerStatementCsv,
  scheduleCollectionReminder as dbScheduleCollectionReminder,
  getCollectionReminders as dbGetCollectionReminders,
  createPaymentPromise as dbCreatePaymentPromise,
  getPaymentPromises as dbGetPaymentPromises,
  updatePaymentPromiseStatus as dbUpdatePaymentPromiseStatus,
  getDashboardKpiSummary as dbGetDashboardKpiSummary,
  getDashboardTopActiveCustomers as dbGetDashboardTopActiveCustomers,
  getAuditLogs as dbGetAuditLogs,
  getProductSalesDailyAggregation as dbGetProductSalesDailyAggregation,
  getStockMovements as dbGetStockMovements,
  getStockMovementCountInRange as dbGetStockMovementCountInRange,
  insertProduct,
  addStockMovement as dbAddStockMovement,
  createSale as dbCreateSale,
  getSalesHistory as dbGetSalesHistory,
  getRecentSoldProducts as dbGetRecentSoldProducts,
  getSaleReceipt as dbGetSaleReceipt,
  validateSalesMovementConsistency as dbValidateSalesMovementConsistency,
  addSupplier as dbAddSupplier,
  updateSupplier as dbUpdateSupplier,
  deleteSupplier as dbDeleteSupplier,
  listSuppliers as dbListSuppliers,
  createPurchaseOrder as dbCreatePurchaseOrder,
  getPurchaseHistory as dbGetPurchaseHistory,
  getOpenPurchaseOrders as dbGetOpenPurchaseOrders,
  getPurchaseOrderDetails as dbGetPurchaseOrderDetails,
  receivePurchaseItems as dbReceivePurchaseItems,
  recordSupplierPayment as dbRecordSupplierPayment,
  getSupplierPayables as dbGetSupplierPayables,
  validatePurchaseMovementConsistency as dbValidatePurchaseMovementConsistency,
  createExpense as dbCreateExpense,
  getExpenses as dbGetExpenses,
  getCashbookEntries as dbGetCashbookEntries,
  getCashflowSummary as dbGetCashflowSummary,
  getProfitReport as dbGetProfitReport,
  getProductMarginReport as dbGetProductMarginReport,
  getDayCloseSnapshot as dbGetDayCloseSnapshot,
  closeBusinessDay as dbCloseBusinessDay,
  getDayCloseReports as dbGetDayCloseReports,
  updateCustomer as dbUpdateCustomer,
  updateProduct as dbUpdateProduct,
} from '../../database/db';
import { seedDemoData, isDemoDataSeeded } from '../../database/seedData';
import {
  applyCustomerRiskClassification,
  createCustomerRiskModel,
  TRUST_MODEL_FEATURE_FLAGS,
} from '../../services/customers/customerRiskEngine';
import { createTrustRolloutController } from '../../services/customers/trustRolloutControl';
import { createTrustMonitoringEngine } from '../../services/customers/trustMonitoringEngine';
import { computeFeatureBatch } from '../../services/features/featureCalculator';
import { createReorderPredictor } from '../../services/reorder/reorderSuggestionEngine';
import { pushTrustMonitoringSnapshotOnline } from '../../services/backend/trustMonitoringApi';
import { fetchCustomerTrustScoresOnline } from '../../services/backend/trustApi';
import {
  fetchCollectionsDashboardOnline,
  fetchCustomerStatementOnline,
  exportCustomerStatementCsvOnline,
  createCustomerReminderOnline,
  listCustomerRemindersOnline,
  createPaymentPromiseOnline,
  listPaymentPromisesOnline,
  updatePaymentPromiseStatusOnline,
} from '../../services/backend/creditApi';
import {
  listApprovalRequestsOnline,
  approveApprovalRequestOnline,
  rejectApprovalRequestOnline,
} from '../../services/backend/approvalApi';
import { runDataSync } from '../../services/sync/dataSync';
import { ACTIONS as RBAC_ACTIONS, checkPermission as checkRolePermission, canonicalizeRole } from '../../security/rbac';
import { MainStackNavigator } from '../../navigation/MainNavigator';
import { BootLoading } from './BootLoading';

const DEFAULT_TRUST_PREDICTION_HORIZON = '1_month';

const RISK_LEVEL_TOKEN_LABELS = Object.freeze({
  LOW: 'কম ঝুঁকি',
  MEDIUM: 'মাঝারি ঝুঁকি',
  HIGH: 'বেশি ঝুঁকি',
});

const toUiRiskLabel = (value) => {
  const token = String(value || '').trim().toUpperCase();
  return RISK_LEVEL_TOKEN_LABELS[token] || String(value || 'কম ঝুঁকি');
};

export function MainDataShell() {
  const { user, session, isOnline, authDeviceProfile, ensureValidAccessToken } = useAuth();
  const { t } = useLanguage();
  const activeRole = canonicalizeRole(user?.role);

  const trustRolloutController = useMemo(() => createTrustRolloutController({
    config: {
      enable_new_scoring: true,
      rollout_percentage: 5,
      rollout_stage: 'stage_1_canary',
      challenger_enabled: true,
      revert_target: 'champion',
    },
    logger: console.warn,
  }), []);

  const trustMonitoringEngine = useMemo(() => createTrustMonitoringEngine({
    rolloutController: trustRolloutController,
    guardrails: {
      fallback_rate_max: 0.3,
      brier_degradation_max: 0.02,
      error_rate_max: 0.02,
      calibration_shift_max: 0.05,
      feature_mean_shift_max: 0.35,
      feature_variance_shift_max: 0.5,
      prediction_drift_psi_max: 0.25,
      min_samples_for_guardrails: 40,
      min_labeled_samples: 20,
    },
    baseline: {
      performance: { brier_score: 0.18 },
      prediction_histogram: new Array(10).fill(0.1),
      feature_stats: {},
    },
    logger: console.warn,
  }), [trustRolloutController]);

  const trustRoutingFlags = useMemo(() => {
    const rolloutState = trustRolloutController.getConfig();
    return {
      ...TRUST_MODEL_FEATURE_FLAGS,
      enable_new_scoring: rolloutState.enable_new_scoring,
      rollout_percentage: rolloutState.rollout_percentage,
      use_challenger_model: rolloutState.challenger_enabled,
      shadow_mode: false,
    };
  }, [trustRolloutController]);

  const customerRiskModel = useMemo(() => createCustomerRiskModel('hybrid', {
    featureFlags: trustRoutingFlags,
    useChallengerModel: true,
    rolloutController: trustRolloutController,
    monitoringEngine: trustMonitoringEngine,
    routingConfig: {
      sparseHistoryThreshold: 3,
      richHistoryThreshold: 12,
      highVolatilityThreshold: 45,
      logisticConfidenceMin: 0.1,
      lightgbmConfidenceMin: 0.1,
    },
    logger: console.warn,
    shadowLogger: console.warn,
  }), [trustMonitoringEngine, trustRolloutController, trustRoutingFlags]);

  const reorderPredictor = useMemo(() => createReorderPredictor('markov-chain', {
    accessToken: session?.access_token || null,
    backendEnabled: Boolean(isOnline),
  }), [isOnline, session?.access_token]);

  const reorderRuleConfig = useMemo(() => ({
    windowDays: 30,
    leadTimeDays: 3,
    reviewPeriodDays: 7,
    safetyDays: 2,
    minOrderQuantity: 1,
  }), []);

  const [booting, setBooting] = useState(true);
  const [initialDataLoading, setInitialDataLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingData, setSyncingData] = useState(false);
  const syncInFlightRef = useRef(false);
  const lastMonitoringUploadMsRef = useRef(0);
  const [products, setProducts] = useState([]);
  const [expiringSoonProducts, setExpiringSoonProducts] = useState([]);
  const [expiredProducts, setExpiredProducts] = useState([]);
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [bakiRows, setBakiRows] = useState([]);
  const [reorderSuggestions, setReorderSuggestions] = useState([]);
  const lowStockAlertRef = useRef('');

  const loadAllData = useCallback(async () => {
    const [coreProductsResult, coreCustomersResult, coreBakiResult] = await Promise.allSettled([
      fetchProducts(),
      fetchCustomers(),
      fetchBakiWithCustomer(),
    ]);

    const productRows = coreProductsResult.status === 'fulfilled' ? coreProductsResult.value : [];
    let customerRows = coreCustomersResult.status === 'fulfilled' ? coreCustomersResult.value : [];

    if (coreCustomersResult.status !== 'fulfilled') {
      try {
        customerRows = await fetchCustomersBasic();
        console.warn('[APP] using fallback customer query due to primary query failure.');
      } catch (fallbackError) {
        console.error('[APP] fallback customer query failed:', fallbackError);
      }
    }

    const bakiHistoryRows = coreBakiResult.status === 'fulfilled' ? coreBakiResult.value : [];

    const [expiringSoonResult, expiredResult, lowStockResult, salesResult, customerRiskResult, featureSourceResult] =
      await Promise.allSettled([
        dbGetExpiringSoonProducts(7),
        dbGetExpiredProducts(),
        dbGetLowStockProducts(),
        dbGetProductSalesDailyAggregation({ days: reorderRuleConfig.windowDays }),
        dbGetCustomerRiskMetrics(),
        dbGetCustomerFeatureSourceRows(),
      ]);

    const expiringSoonRows = expiringSoonResult.status === 'fulfilled' ? expiringSoonResult.value : [];
    const expiredRows = expiredResult.status === 'fulfilled' ? expiredResult.value : [];
    const lowStockRows = lowStockResult.status === 'fulfilled' ? lowStockResult.value : [];
    const salesRows = salesResult.status === 'fulfilled' ? salesResult.value : [];
    const customerRiskRows = customerRiskResult.status === 'fulfilled' ? customerRiskResult.value : [];

    const primaryPredictions = customerRiskRows
      .filter((row) => row && Number.isFinite(Number(row.customer_id)))
      .map((row) => ({
        customer_id: Number(row.customer_id),
        probability: row.default_probability ?? row.model_probability ?? row.ml_probability ?? null,
        confidence: row.confidence_score ?? row.model_confidence ?? row.ml_confidence ?? null,
      }))
      .filter((row) => row.probability !== null || row.confidence !== null);

    const featureSourceRows = featureSourceResult.status === 'fulfilled' ? featureSourceResult.value : [];

    let featureBatch = null;
    try {
      featureBatch = computeFeatureBatch(featureSourceRows);
    } catch (error) {
      console.error('[APP] feature batch computation failed:', error);
    }

    let enrichedCustomers = customerRows;
    try {
      enrichedCustomers = applyCustomerRiskClassification(
        customerRows,
        customerRiskRows,
        customerRiskModel,
        featureBatch,
        {
          primaryPredictions,
          monitoringEngine: trustMonitoringEngine,
          autoComputeMonitoringSnapshot: true,
        }
      );
    } catch (error) {
      console.error('[APP] customer risk classification failed:', error);
    }

    if (isOnline && session?.access_token && enrichedCustomers.length > 0) {
      try {
        const onlineTrustByCustomerId = await fetchCustomerTrustScoresOnline({
          accessToken: session.access_token,
          customerIds: enrichedCustomers.map((row) => row.id),
          horizon: DEFAULT_TRUST_PREDICTION_HORIZON,
        });

        enrichedCustomers = enrichedCustomers.map((row) => {
          const onlineTrust = onlineTrustByCustomerId[String(row.id)];
          if (!onlineTrust) return row;
          return {
            ...row,
            trust_score: Number.isFinite(Number(onlineTrust.trust_score))
              ? Number(onlineTrust.trust_score)
              : (Number.isFinite(Number(row.trust_score)) ? Number(row.trust_score) : null),
            risk_score: Number.isFinite(Number(onlineTrust.risk_score))
              ? Number(onlineTrust.risk_score)
              : (Number.isFinite(Number(row.risk_score)) ? Number(row.risk_score) : null),
            risk_level: toUiRiskLabel(onlineTrust.risk_level || row.risk_level),
            risk_level_token: String(onlineTrust.risk_level || '').trim().toUpperCase() || null,
            risk_reasons: Array.isArray(onlineTrust.risk_reasons)
              ? onlineTrust.risk_reasons
              : Array.isArray(row.risk_reasons)
                ? row.risk_reasons
                : [],
            prediction_horizon: onlineTrust.prediction_horizon || DEFAULT_TRUST_PREDICTION_HORIZON,
            prediction_targets: onlineTrust.prediction_targets || null,
          };
        });
      } catch (error) {
        console.warn('[APP] online trust scoring fetch failed:', error?.message || error);
      }
    }

    let nextSuggestions = [];
    try {
      nextSuggestions = await Promise.resolve(reorderPredictor.predict({
        products: productRows,
        salesRows,
        config: reorderRuleConfig,
        accessToken: session?.access_token || null,
        horizon: '1W',
      }));
    } catch (error) {
      console.error('[APP] reorder suggestion calculation failed:', error);
    }

    setProducts(productRows);
    setExpiringSoonProducts(expiringSoonRows);
    setExpiredProducts(expiredRows);
    setLowStockProducts(lowStockRows);
    setCustomers(enrichedCustomers);
    setBakiRows(bakiHistoryRows);
    setReorderSuggestions(nextSuggestions);
  }, [
    customerRiskModel,
    isOnline,
    reorderPredictor,
    reorderRuleConfig,
    session?.access_token,
    trustMonitoringEngine,
  ]);

  useEffect(() => {
    let disposed = false;

    const bootAndHydrate = async () => {
      try {
        await createTables();
      } catch (error) {
        console.error('[APP] boot failed:', error);
      }

      if (disposed) return;

      try {
        await loadAllData();
      } catch (error) {
        console.error('[APP] initial data hydration failed:', error);
      } finally {
        if (!disposed) {
          setInitialDataLoading(false);
          setBooting(false);
        }
      }
    };

    void bootAndHydrate();
    return () => { disposed = true; };
  }, [loadAllData]);

  useEffect(() => {
    if (booting) return;
    if (typeof __DEV__ === 'undefined' || !__DEV__) return;
    const uid = Number(user?.id);
    if (!uid || !Number.isFinite(uid)) return;

    let disposed = false;
    const runSeed = async () => {
      try {
        const alreadySeeded = await isDemoDataSeeded(uid);
        if (!alreadySeeded && !disposed) {
          await seedDemoData(uid);
          if (!disposed) await loadAllData();
        }
      } catch (err) {
        console.warn('[APP] demo seed skipped:', err?.message || err);
      }
    };

    void runSeed();
    return () => { disposed = true; };
  }, [booting, user?.id, loadAllData]);

  useEffect(() => {
    const notificationsEnabled = Boolean(authDeviceProfile?.lowStockNotificationsEnabled);
    if (!notificationsEnabled || !Array.isArray(lowStockProducts)) {
      lowStockAlertRef.current = '';
      return;
    }
    if (lowStockProducts.length === 0) {
      lowStockAlertRef.current = '';
      return;
    }

    const signature = lowStockProducts
      .map((row) => `${String(row.id)}:${Number(row.quantity || 0)}:${Number(row.low_stock_threshold || 0)}`)
      .sort()
      .join('|');

    if (!signature || signature === lowStockAlertRef.current) return;
    lowStockAlertRef.current = signature;
    Alert.alert(
      t('notification.lowStock.title'),
      t('notification.lowStock.body', { count: lowStockProducts.length })
    );
  }, [authDeviceProfile?.lowStockNotificationsEnabled, lowStockProducts, t]);

  const refreshAll = useCallback(async () => {
    try {
      setRefreshing(true);
      await loadAllData();
    } finally {
      setRefreshing(false);
    }
  }, [loadAllData]);

  const runOnlineSync = useCallback(async () => {
    if (booting || !isOnline || !session?.token || !user?.id) {
      return { synced: 0, appliedServerChanges: 0, skipped: true };
    }
    if (syncInFlightRef.current) {
      return { synced: 0, appliedServerChanges: 0, skipped: true };
    }

    syncInFlightRef.current = true;
    setSyncingData(true);
    try {
      const activeAccessToken = await ensureValidAccessToken({ minValidityMs: 45 * 1000 });
      if (!activeAccessToken) return { synced: 0, appliedServerChanges: 0, skipped: true };

      const syncVerboseLogs =
        (typeof __DEV__ !== 'undefined' && __DEV__)
        || String(process?.env?.EXPO_PUBLIC_SYNC_VERBOSE || '').trim() === '1';

      const result = await runDataSync({
        userId: Number(user.id),
        accessToken: activeAccessToken,
      });

      if (
        syncVerboseLogs
        || Number(result?.synced || 0) > 0
        || Number(result?.appliedServerChanges || 0) > 0
        || Boolean(result?.hasMoreServerChanges)
      ) {
        console.info('[SYNC][APP][TRIGGERED]', {
          userId: Number(user.id),
          reason: 'interval_or_foreground',
          synced: Number(result?.synced || 0),
          appliedServerChanges: Number(result?.appliedServerChanges || 0),
          hasMoreServerChanges: Boolean(result?.hasMoreServerChanges),
        });
      }

      if (Number(result?.synced || 0) > 0 || Number(result?.appliedServerChanges || 0) > 0) {
        await loadAllData();
      }

      const now = Date.now();
      if (now - lastMonitoringUploadMsRef.current >= 60 * 1000) {
        const requestRows = trustMonitoringEngine.getRecentRequests();
        if (requestRows.length > 0) {
          const snapshot = trustMonitoringEngine.computeSnapshot();
          await pushTrustMonitoringSnapshotOnline({
            accessToken: activeAccessToken,
            source: 'phase8_runtime_react_native',
            appVersion: '1.0.0',
            snapshot: {
              ...snapshot,
              baseline: trustMonitoringEngine.getBaseline(),
              metadata: {
                user_id: Number(user.id),
                rollout_stage: trustRolloutController.getConfig().rollout_stage,
                rollout_percentage: trustRolloutController.getConfig().rollout_percentage,
              },
            },
          });
          lastMonitoringUploadMsRef.current = now;
        }
      }

      return result;
    } catch (error) {
      console.warn('[APP] data sync skipped or failed:', error?.message || error);
      return { synced: 0, appliedServerChanges: 0, skipped: true };
    } finally {
      syncInFlightRef.current = false;
      setSyncingData(false);
    }
  }, [booting, ensureValidAccessToken, isOnline, loadAllData, session?.token, trustMonitoringEngine, trustRolloutController, user?.id]);

  useEffect(() => {
    if (booting || !isOnline || !session?.access_token || !user?.id) return undefined;

    let disposed = false;
    const run = async () => {
      if (disposed) return;
      await runOnlineSync();
    };

    run();
    const timer = setInterval(run, 20000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [booting, isOnline, runOnlineSync, session?.access_token, user?.id]);

  // ── Product callbacks ──────────────────────────────────────────────────────

  const addProduct = useCallback(
    async ({ name, quantity, price, expiryDate, lowStockThreshold }) => {
      const saved = await insertProduct({ name, quantity, price, expiryDate, lowStockThreshold });
      await refreshAll();
      return saved;
    },
    [refreshAll]
  );

  const updateProduct = useCallback(
    async ({ id, name, quantity, price, expiryDate, lowStockThreshold }) => {
      const updated = await dbUpdateProduct({ id, name, quantity, price, expiryDate, lowStockThreshold });
      await refreshAll();
      return updated;
    },
    [refreshAll]
  );

  const deleteProduct = useCallback(async (id) => {
    const deleted = await dbDeleteProduct(id);
    await refreshAll();
    return deleted;
  }, [refreshAll]);

  const addStockMovement = useCallback(
    async ({ productId, movementType, quantity, note, stockOutReason }) => {
      const saved = await dbAddStockMovement({ productId, movementType, quantity, note, stockOutReason });
      await refreshAll();
      return saved;
    },
    [refreshAll]
  );

  // ── Sales callbacks ────────────────────────────────────────────────────────

  const createSale = useCallback(
    async ({ customerId = null, items = [], payments = [], paymentMode = 'CASH', note = null, timestamp = null } = {}) => {
      const saved = await dbCreateSale({ customerId, items, payments, paymentMode, note, timestamp });
      await refreshAll();
      await runOnlineSync();
      return saved;
    },
    [refreshAll, runOnlineSync]
  );

  const getSalesHistory = useCallback(async ({
    limit = 100, fromDateIso = null, toDateIso = null,
    customerId = null, productId = null, paymentMode = null, searchText = '',
  } = {}) => {
    return dbGetSalesHistory({ limit, fromDateIso, toDateIso, customerId, productId, paymentMode, searchText });
  }, []);

  const getRecentSoldProducts = useCallback(async ({ limit = 12 } = {}) => {
    return dbGetRecentSoldProducts({ limit });
  }, []);

  const getSaleReceipt = useCallback(async ({ saleId = null, receiptId = null } = {}) => {
    return dbGetSaleReceipt({ saleId, receiptId });
  }, []);

  const validateSalesMovementConsistency = useCallback(async ({ dateIso = null } = {}) => {
    return dbValidateSalesMovementConsistency({ dateIso });
  }, []);

  // ── Supplier / Purchase callbacks ──────────────────────────────────────────

  const listSuppliers = useCallback(async ({ searchText = '', limit = 200 } = {}) => {
    return dbListSuppliers({ searchText, limit });
  }, []);

  const addSupplier = useCallback(async ({ name, phone, address } = {}) => {
    const saved = await dbAddSupplier({ name, phone, address });
    await refreshAll();
    await runOnlineSync();
    return saved;
  }, [refreshAll, runOnlineSync]);

  const updateSupplier = useCallback(async ({ id, name, phone, address } = {}) => {
    const updated = await dbUpdateSupplier({ id, name, phone, address });
    await refreshAll();
    await runOnlineSync();
    return updated;
  }, [refreshAll, runOnlineSync]);

  const deleteSupplier = useCallback(async (id) => {
    const deleted = await dbDeleteSupplier(id);
    await refreshAll();
    await runOnlineSync();
    return deleted;
  }, [refreshAll, runOnlineSync]);

  const createPurchaseOrder = useCallback(
    async ({ supplierId, items, note, purchaseDate, paidAmount, paymentMethod } = {}) => {
      const saved = await dbCreatePurchaseOrder({ supplierId, items, note, purchaseDate, paidAmount, paymentMethod });
      await refreshAll();
      await runOnlineSync();
      return saved;
    },
    [refreshAll, runOnlineSync]
  );

  const getPurchaseHistory = useCallback(async ({
    limit = 100, fromDateIso = null, toDateIso = null,
    supplierId = null, status = null, searchText = '',
  } = {}) => {
    return dbGetPurchaseHistory({ limit, fromDateIso, toDateIso, supplierId, status, searchText });
  }, []);

  const getOpenPurchaseOrders = useCallback(async ({ limit = 100 } = {}) => {
    return dbGetOpenPurchaseOrders({ limit });
  }, []);

  const getPurchaseOrderDetails = useCallback(async ({ purchaseOrderId } = {}) => {
    return dbGetPurchaseOrderDetails({ purchaseOrderId });
  }, []);

  const receivePurchaseItems = useCallback(async ({ purchaseOrderId, items, note, receivedAt } = {}) => {
    const saved = await dbReceivePurchaseItems({ purchaseOrderId, items, note, receivedAt });
    await refreshAll();
    await runOnlineSync();
    return saved;
  }, [refreshAll, runOnlineSync]);

  const recordSupplierPayment = useCallback(
    async ({ supplierId, amount, purchaseOrderId, paymentMethod, note, paidAt } = {}) => {
      const saved = await dbRecordSupplierPayment({ supplierId, amount, purchaseOrderId, paymentMethod, note, paidAt });
      await refreshAll();
      await runOnlineSync();
      return saved;
    },
    [refreshAll, runOnlineSync]
  );

  const getSupplierPayables = useCallback(async ({ supplierId = null, limit = 120 } = {}) => {
    return dbGetSupplierPayables({ supplierId, limit });
  }, []);

  const validatePurchaseMovementConsistency = useCallback(async ({ dateIso = null } = {}) => {
    return dbValidatePurchaseMovementConsistency({ dateIso });
  }, []);

  // ── Finance callbacks ──────────────────────────────────────────────────────

  const createExpense = useCallback(
    async ({ title, amount, category, paymentMethod, note, expenseDate } = {}) => {
      const saved = await dbCreateExpense({ title, amount, category, paymentMethod, note, expenseDate });
      await refreshAll();
      await runOnlineSync();
      return saved;
    },
    [refreshAll, runOnlineSync]
  );

  const getExpenses = useCallback(async ({ fromDateIso, toDateIso, category, searchText, limit } = {}) => {
    return dbGetExpenses({ fromDateIso, toDateIso, category, searchText, limit });
  }, []);

  const getCashbookEntries = useCallback(
    async ({ fromDateIso, toDateIso, entryType, paymentMethod, limit } = {}) => {
      return dbGetCashbookEntries({ fromDateIso, toDateIso, entryType, paymentMethod, limit });
    },
    []
  );

  const getCashflowSummary = useCallback(async ({ fromDateIso, toDateIso, days } = {}) => {
    return dbGetCashflowSummary({ fromDateIso, toDateIso, days });
  }, []);

  const getProfitReport = useCallback(async ({ fromDateIso, toDateIso, days } = {}) => {
    return dbGetProfitReport({ fromDateIso, toDateIso, days });
  }, []);

  const getProductMarginReport = useCallback(async ({ fromDateIso, toDateIso, days, limit } = {}) => {
    return dbGetProductMarginReport({ fromDateIso, toDateIso, days, limit });
  }, []);

  const getDayCloseSnapshot = useCallback(async ({ businessDate } = {}) => {
    return dbGetDayCloseSnapshot({ businessDate });
  }, []);

  const closeBusinessDay = useCallback(async ({ businessDate, cashOnHand, note } = {}) => {
    const saved = await dbCloseBusinessDay({ businessDate, cashOnHand, note });
    await refreshAll();
    await runOnlineSync();
    return saved;
  }, [refreshAll, runOnlineSync]);

  const getDayCloseReports = useCallback(async ({ limit } = {}) => {
    return dbGetDayCloseReports({ limit });
  }, []);

  // ── Inventory callbacks ────────────────────────────────────────────────────

  const getInventoryBatches = useCallback(
    async ({ productId = null, includeDepleted = false, limit = 300 } = {}) => {
      return dbGetInventoryBatches({ productId, includeDepleted, limit });
    },
    []
  );

  const selectBatchForSale = useCallback(async ({ productId } = {}) => {
    return dbSelectBatchForSale(productId);
  }, []);

  const getInventoryAlerts = useCallback(
    async ({ alertType = null, severity = null, activeOnly = true, limit = 200 } = {}) => {
      return dbGetInventoryAlerts({ alertType, severity, activeOnly, limit });
    },
    []
  );

  const refreshInventoryAlerts = useCallback(async ({ expiryAlertDays, deadStockDays } = {}) => {
    const rows = await dbRefreshInventoryAlerts({ expiryAlertDays, deadStockDays });
    await refreshAll();
    return rows;
  }, [refreshAll]);

  const getDeadStockProducts = useCallback(async ({ thresholdDays = 60, limit = 200 } = {}) => {
    return dbGetDeadStockProducts({ thresholdDays, limit });
  }, []);

  const getInventoryHealthInsights = useCallback(
    async ({ lookbackDays = 30, expiryAlertDays = 7, deadStockDays = 60 } = {}) => {
      return dbGetInventoryHealthInsights({ lookbackDays, expiryAlertDays, deadStockDays });
    },
    []
  );

  const getCycleCounts = useCallback(async ({ productId = null, limit = 120 } = {}) => {
    return dbGetCycleCounts({ productId, limit });
  }, []);

  const recordCycleCount = useCallback(async ({ productId, physicalQuantity, note, timestamp } = {}) => {
    const row = await dbRecordCycleCount({ productId, physicalQuantity, note, timestamp });
    await refreshAll();
    await runOnlineSync();
    return row;
  }, [refreshAll, runOnlineSync]);

  const validateInventoryBatchConsistency = useCallback(async ({ productId = null } = {}) => {
    return dbValidateInventoryBatchConsistency({ productId });
  }, []);

  const getStockMovementHistory = useCallback(async ({ productId = null, limit = 100 } = {}) => {
    return dbGetStockMovements({ productId, limit });
  }, []);

  // ── Customer / Baki callbacks ──────────────────────────────────────────────

  const addCustomer = useCallback(
    async ({ name, phone, address, creditLimit, dueTermsDays }) => {
      const saved = await dbAddCustomer({ name, phone, address, creditLimit, dueTermsDays });
      await refreshAll();
      await runOnlineSync();
      return saved;
    },
    [refreshAll, runOnlineSync]
  );

  const updateCustomer = useCallback(
    async ({ id, name, phone, address, creditLimit, dueTermsDays, riskLevel }) => {
      const updated = await dbUpdateCustomer({ id, name, phone, address, creditLimit, dueTermsDays, riskLevel });
      await refreshAll();
      await runOnlineSync();
      return updated;
    },
    [refreshAll, runOnlineSync]
  );

  const deleteCustomer = useCallback(async (id) => {
    const deleted = await dbDeleteCustomer(id);
    await refreshAll();
    return deleted;
  }, [refreshAll]);

  const addBaki = useCallback(
    async ({ customerId, amount, note, dueDate, dueTermsDays, referenceId, imageUrl }) => {
      const saved = await dbAddBaki({ customerId, amount, note, dueDate, dueTermsDays, referenceId, imageUrl });
      await refreshAll();
      await runOnlineSync();
      return saved;
    },
    [refreshAll, runOnlineSync]
  );

  const addBakiPayment = useCallback(
    async ({ customerId, amount, note, paymentMethod, referenceId }) => {
      const saved = await dbAddPayment({ customerId, amount, note, paymentMethod, referenceId });
      await refreshAll();
      await runOnlineSync();
      return saved;
    },
    [refreshAll, runOnlineSync]
  );

  const getCustomerLedger = useCallback(async (customerId) => {
    return dbGetCustomerLedger(customerId);
  }, []);

  const getBakiKpiSummary = useCallback(async ({ startDateIso, endDateIso, rangeDays }) => {
    return dbGetBakiKpiSummary({ startDateIso, endDateIso, rangeDays });
  }, []);

  // ── Collections / Credit callbacks ────────────────────────────────────────

  const getCollectionsDashboardData = useCallback(async () => {
    if (isOnline && session?.access_token) {
      return fetchCollectionsDashboardOnline({ accessToken: session.access_token });
    }
    return dbGetCollectionsDashboard();
  }, [isOnline, session?.access_token]);

  const getCustomerStatementData = useCallback(
    async ({ customerId, fromDateIso = null, toDateIso = null } = {}) => {
      if (isOnline && session?.access_token) {
        return fetchCustomerStatementOnline({ accessToken: session.access_token, customerId, fromDateIso, toDateIso });
      }
      return dbGetCustomerStatement({ customerId, fromDateIso, toDateIso });
    },
    [isOnline, session?.access_token]
  );

  const exportCustomerStatementCsvData = useCallback(
    async ({ customerId, fromDateIso = null, toDateIso = null } = {}) => {
      if (isOnline && session?.access_token) {
        return exportCustomerStatementCsvOnline({ accessToken: session.access_token, customerId, fromDateIso, toDateIso });
      }
      const statement = await dbGetCustomerStatement({ customerId, fromDateIso, toDateIso });
      return dbBuildCustomerStatementCsv({ statement });
    },
    [isOnline, session?.access_token]
  );

  const scheduleCustomerReminder = useCallback(
    async ({
      customerId, bakiTransactionId = null, channel = 'manual',
      message = null, sentAt = null, status = 'sent', referenceId = null,
    } = {}) => {
      if (isOnline && session?.access_token) {
        const saved = await createCustomerReminderOnline({
          accessToken: session.access_token,
          customerId, bakiEntryId: bakiTransactionId, channel, message, sentAt, status, referenceId,
        });
        await refreshAll();
        await runOnlineSync();
        return saved;
      }
      const saved = await dbScheduleCollectionReminder({
        customerId, bakiTransactionId, channel, message, sentAt, status, referenceId,
      });
      await refreshAll();
      return saved;
    },
    [isOnline, refreshAll, runOnlineSync, session?.access_token]
  );

  const getCustomerReminders = useCallback(async ({ customerId, limit = 100 } = {}) => {
    if (isOnline && session?.access_token) {
      const response = await listCustomerRemindersOnline({ accessToken: session.access_token, customerId, limit });
      return Array.isArray(response?.items) ? response.items : [];
    }
    return dbGetCollectionReminders({ customerId, limit });
  }, [isOnline, session?.access_token]);

  const createCustomerPromise = useCallback(
    async ({ customerId, promisedAmount, promiseDate, note = null } = {}) => {
      if (isOnline && session?.access_token) {
        const saved = await createPaymentPromiseOnline({
          accessToken: session.access_token, customerId, promisedAmount, promiseDate, note,
        });
        await refreshAll();
        await runOnlineSync();
        return saved;
      }
      const saved = await dbCreatePaymentPromise({ customerId, promisedAmount, promiseDate, note });
      await refreshAll();
      return saved;
    },
    [isOnline, refreshAll, runOnlineSync, session?.access_token]
  );

  const getCustomerPromises = useCallback(async ({ customerId = null, status = 'all', limit = 100 } = {}) => {
    if (isOnline && session?.access_token && customerId) {
      const response = await listPaymentPromisesOnline({ accessToken: session.access_token, customerId, status });
      return Array.isArray(response?.items) ? response.items : [];
    }
    return dbGetPaymentPromises({ customerId, status, limit });
  }, [isOnline, session?.access_token]);

  const updateCustomerPromiseStatus = useCallback(
    async ({ promiseId, status, fulfilledBakiTransactionId = null } = {}) => {
      if (isOnline && session?.access_token) {
        const updated = await updatePaymentPromiseStatusOnline({
          accessToken: session.access_token, promiseId, status,
        });
        await refreshAll();
        await runOnlineSync();
        return updated;
      }
      const updated = await dbUpdatePaymentPromiseStatus({ promiseId, status, fulfilledBakiTransactionId });
      await refreshAll();
      return updated;
    },
    [isOnline, refreshAll, runOnlineSync, session?.access_token]
  );

  // ── Approval callbacks ─────────────────────────────────────────────────────

  const listApprovalRequests = useCallback(async ({ status = 'PENDING', actionType = null } = {}) => {
    if (!isOnline || !session?.access_token) return [];
    const response = await listApprovalRequestsOnline({ accessToken: session.access_token, status, actionType });
    return Array.isArray(response?.items) ? response.items : [];
  }, [isOnline, session?.access_token]);

  const approveApprovalRequest = useCallback(async ({ approvalRequestId, decisionNote = null } = {}) => {
    if (!isOnline || !session?.access_token) throw new Error('Online connection is required to approve requests.');
    const result = await approveApprovalRequestOnline({
      accessToken: session.access_token, approvalRequestId, decisionNote,
    });
    await refreshAll();
    return result;
  }, [isOnline, refreshAll, session?.access_token]);

  const rejectApprovalRequest = useCallback(async ({ approvalRequestId, decisionNote = null } = {}) => {
    if (!isOnline || !session?.access_token) throw new Error('Online connection is required to reject requests.');
    const result = await rejectApprovalRequestOnline({
      accessToken: session.access_token, approvalRequestId, decisionNote,
    });
    await refreshAll();
    return result;
  }, [isOnline, refreshAll, session?.access_token]);

  // ── Dashboard / Audit callbacks ────────────────────────────────────────────

  const getDashboardKpiSummary = useCallback(async ({ startDateIso, endDateIso, transactionType }) => {
    return dbGetDashboardKpiSummary({ startDateIso, endDateIso, transactionType });
  }, []);

  const getDashboardTopActiveCustomers = useCallback(
    async ({ startDateIso, endDateIso, transactionType, limit }) => {
      return dbGetDashboardTopActiveCustomers({ startDateIso, endDateIso, transactionType, limit });
    },
    []
  );

  const getStockMovementCountInRange = useCallback(async ({ startDateIso, endDateIso }) => {
    return dbGetStockMovementCountInRange({ startDateIso, endDateIso });
  }, []);

  const getAuditLogs = useCallback(async ({ entityType, action, searchText, limit } = {}) => {
    return dbGetAuditLogs({ entityType, action, searchText, limit });
  }, []);

  // ── Context value ──────────────────────────────────────────────────────────

  const contextValue = useMemo(
    () => ({
      booting,
      initialDataLoading,
      refreshing,
      syncingData,
      products,
      expiringSoonProducts,
      expiredProducts,
      lowStockProducts,
      reorderSuggestions,
      reorderRuleConfig,
      customers,
      bakiRows,
      refreshAll,
      addProduct,
      updateProduct,
      deleteProduct,
      addStockMovement,
      getStockMovementHistory,
      createSale,
      getSalesHistory,
      getRecentSoldProducts,
      getSaleReceipt,
      validateSalesMovementConsistency,
      listSuppliers,
      addSupplier,
      updateSupplier,
      deleteSupplier,
      createPurchaseOrder,
      getPurchaseHistory,
      getOpenPurchaseOrders,
      getPurchaseOrderDetails,
      receivePurchaseItems,
      recordSupplierPayment,
      getSupplierPayables,
      validatePurchaseMovementConsistency,
      createExpense,
      getExpenses,
      getCashbookEntries,
      getCashflowSummary,
      getProfitReport,
      getProductMarginReport,
      getDayCloseSnapshot,
      closeBusinessDay,
      getDayCloseReports,
      getInventoryBatches,
      selectBatchForSale,
      getInventoryAlerts,
      refreshInventoryAlerts,
      getDeadStockProducts,
      getInventoryHealthInsights,
      getCycleCounts,
      recordCycleCount,
      validateInventoryBatchConsistency,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      addBaki,
      addBakiPayment,
      getCustomerLedger,
      getBakiKpiSummary,
      getCollectionsDashboardData,
      getCustomerStatementData,
      exportCustomerStatementCsvData,
      scheduleCustomerReminder,
      getCustomerReminders,
      createCustomerPromise,
      getCustomerPromises,
      updateCustomerPromiseStatus,
      getDashboardKpiSummary,
      getDashboardTopActiveCustomers,
      getStockMovementCountInRange,
      getAuditLogs,
      listApprovalRequests,
      approveApprovalRequest,
      rejectApprovalRequest,
      activeRole,
      hasPermission: (action) => checkRolePermission(activeRole, action),
      runOnlineSync,
      getTrustRolloutConfig: () => trustRolloutController.getConfig(),
      setTrustRolloutStage: (stageKey) => trustRolloutController.setRolloutStage(stageKey),
      setTrustRolloutPercentage: (percentage) => trustRolloutController.setRolloutPercentage(percentage),
      getTrustRolloutEvents: () => trustRolloutController.getRecentEvents(),
      getTrustMonitoringSnapshot: () => trustMonitoringEngine.computeSnapshot(),
      getTrustGuardrailAlerts: () => trustMonitoringEngine.getRecentAlerts(),
    }),
    [
      booting, initialDataLoading, refreshing, syncingData,
      products, expiringSoonProducts, expiredProducts, lowStockProducts,
      reorderSuggestions, reorderRuleConfig, customers, bakiRows,
      refreshAll, addProduct, updateProduct, deleteProduct, addStockMovement,
      getStockMovementHistory, createSale, getSalesHistory, getRecentSoldProducts,
      getSaleReceipt, validateSalesMovementConsistency, listSuppliers, addSupplier,
      updateSupplier, deleteSupplier, createPurchaseOrder, getPurchaseHistory,
      getOpenPurchaseOrders, getPurchaseOrderDetails, receivePurchaseItems,
      recordSupplierPayment, getSupplierPayables, validatePurchaseMovementConsistency,
      createExpense, getExpenses, getCashbookEntries, getCashflowSummary,
      getProfitReport, getProductMarginReport, getDayCloseSnapshot, closeBusinessDay,
      getDayCloseReports, getInventoryBatches, selectBatchForSale, getInventoryAlerts,
      refreshInventoryAlerts, getDeadStockProducts, getInventoryHealthInsights,
      getCycleCounts, recordCycleCount, validateInventoryBatchConsistency,
      addCustomer, updateCustomer, deleteCustomer, addBaki, addBakiPayment,
      getCustomerLedger, getBakiKpiSummary, getCollectionsDashboardData,
      getCustomerStatementData, exportCustomerStatementCsvData, scheduleCustomerReminder,
      getCustomerReminders, createCustomerPromise, getCustomerPromises,
      updateCustomerPromiseStatus, getDashboardKpiSummary, getDashboardTopActiveCustomers,
      getStockMovementCountInRange, getAuditLogs, listApprovalRequests,
      approveApprovalRequest, rejectApprovalRequest,
      activeRole, runOnlineSync, trustMonitoringEngine, trustRolloutController,
    ]
  );

  if (booting) {
    return <BootLoading title={t('app.boot.title')} subtitle={t('app.boot.subtitle')} />;
  }

  return (
    <AppDataContext.Provider value={contextValue}>
      <MainStackNavigator />
    </AppDataContext.Provider>
  );
}
