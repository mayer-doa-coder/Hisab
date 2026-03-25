import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UI_COLORS } from '../constants/ui-theme';
import { useAppData } from '../context/AppDataContext';
import { fetchBackendHealth } from '../services/backend/backendHealth';
import CustomerRiskBadge from './customers/CustomerRiskBadge';
import { CUSTOMER_RISK_LEVELS } from '../services/customers/customerRiskEngine';
import {
  DATE_RANGE_OPTIONS,
  DATE_RANGE_TYPES,
  buildKpiDateFilter,
  formatRangeLabel,
} from '../services/analytics/dateRangeUtils';

const TRANSACTION_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'credit', label: 'Credit' },
  { value: 'payment', label: 'Payment' },
];

const QUICK_ACTIONS = [
  { label: 'Add Product', icon: 'add-box', route: 'Products' },
  { label: 'Add Customer', icon: 'person-add', route: 'Customers' },
  { label: 'Add Credit', icon: 'credit-score', route: 'Baki' },
  { label: 'Record Payment', icon: 'payments', route: 'Baki' },
  { label: 'Add Stock Movement', icon: 'swap-horiz', route: 'Movement' },
];

const toFinite = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const formatMoney = (value) => `৳${toFinite(value, 0).toFixed(2)}`;

const formatLocalDateTime = (value) => {
  if (!value) {
    return 'Never';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Invalid time';
  }

  return date.toLocaleString();
};

function KpiCard({ title, value, icon, tone = 'primary' }) {
  const toneStyle =
    tone === 'success'
      ? [styles.kpiCard, styles.kpiCardSuccess]
      : tone === 'warning'
        ? [styles.kpiCard, styles.kpiCardWarning]
        : tone === 'danger'
          ? [styles.kpiCard, styles.kpiCardDanger]
          : [styles.kpiCard, styles.kpiCardPrimary];

  return (
    <View style={toneStyle}>
      <View style={styles.kpiTitleRow}>
        <Text style={styles.kpiTitle}>{title}</Text>
        <MaterialIcons name={icon} size={16} color={UI_COLORS.textSecondary} />
      </View>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

function SummaryCard({ title, value, icon }) {
  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryCardTopRow}>
        <Text style={styles.summaryCardTitle}>{title}</Text>
        <MaterialIcons name={icon} size={16} color={UI_COLORS.textSecondary} />
      </View>
      <Text style={styles.summaryCardValue}>{value}</Text>
    </View>
  );
}

function ListRow({ title, subtitle, rightText, badge }) {
  return (
    <View style={styles.listRow}>
      <View style={styles.listRowLeft}>
        <Text numberOfLines={1} style={styles.listRowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.listRowSubtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.listRowRight}>
        {badge || null}
        {rightText ? <Text style={styles.listRowRightText}>{rightText}</Text> : null}
      </View>
    </View>
  );
}

function LoadingPlaceholder() {
  return (
    <View style={styles.loadingCard}>
      <ActivityIndicator size="small" color={UI_COLORS.primary} />
      <Text style={styles.loadingCardText}>Loading dashboard data...</Text>
    </View>
  );
}

export default function DashboardScreen() {
  const navigation = useNavigation();
  const {
    products,
    customers,
    lowStockProducts,
    expiredProducts,
    expiringSoonProducts,
    reorderSuggestions,
    refreshAll,
    getDashboardKpiSummary,
    getDashboardTopActiveCustomers,
    getStockMovementCountInRange,
  } = useAppData();

  const [selectedRange, setSelectedRange] = useState(DATE_RANGE_TYPES.TODAY);
  const [transactionType, setTransactionType] = useState('all');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [rangeLabel, setRangeLabel] = useState('');
  const [loadError, setLoadError] = useState('');
  const [lastRefreshAt, setLastRefreshAt] = useState(null);
  const [todayMovementCount, setTodayMovementCount] = useState(0);
  const [topActiveCustomers, setTopActiveCustomers] = useState([]);
  const [backendInfo, setBackendInfo] = useState({
    checking: false,
    ok: false,
    status: 'unknown',
    baseUrl: '',
    database: null,
    errorMessage: '',
  });
  const [kpis, setKpis] = useState({
    totalCredit: 0,
    totalPayment: 0,
    net: 0,
    transactions: 0,
    activeCustomers: 0,
    collectionRate: 0,
    averageTransaction: 0,
    topDebtorName: null,
    topDebtorDue: 0,
    mostActiveCustomerName: null,
    mostActiveCustomerTxCount: 0,
  });

  const summary = useMemo(() => {
    const totalOutstandingDue = (customers || []).reduce((sum, row) => sum + Math.max(0, toFinite(row.total_due, 0)), 0);

    return {
      totalProducts: (products || []).length,
      totalCustomers: (customers || []).length,
      totalOutstandingDue,
    };
  }, [customers, products]);

  const actionableReorder = useMemo(
    () => (reorderSuggestions || []).filter((item) => Boolean(item?.shouldReorder)),
    [reorderSuggestions]
  );

  const topLowStockItems = useMemo(() => {
    return [...(lowStockProducts || [])]
      .sort((a, b) => toFinite(a.quantity, 0) - toFinite(b.quantity, 0))
      .slice(0, 3);
  }, [lowStockProducts]);

  const topExpiredItems = useMemo(() => {
    return [...(expiredProducts || [])]
      .sort((a, b) => new Date(a.expiry_date || 0).getTime() - new Date(b.expiry_date || 0).getTime())
      .slice(0, 3);
  }, [expiredProducts]);

  const topExpiringSoonItems = useMemo(() => {
    return [...(expiringSoonProducts || [])]
      .sort((a, b) => new Date(a.expiry_date || 0).getTime() - new Date(b.expiry_date || 0).getTime())
      .slice(0, 3);
  }, [expiringSoonProducts]);

  const topReorderItems = useMemo(() => {
    return [...actionableReorder]
      .sort((a, b) => toFinite(b.urgencyScore, 0) - toFinite(a.urgencyScore, 0))
      .slice(0, 3);
  }, [actionableReorder]);

  const riskSnapshot = useMemo(() => {
    const counts = {
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const customer of customers || []) {
      const riskLevel = customer?.risk_level || CUSTOMER_RISK_LEVELS.LOW;
      if (riskLevel === CUSTOMER_RISK_LEVELS.HIGH) {
        counts.high += 1;
      } else if (riskLevel === CUSTOMER_RISK_LEVELS.MEDIUM) {
        counts.medium += 1;
      } else {
        counts.low += 1;
      }
    }

    const topRiskyCustomers = [...(customers || [])]
      .filter((customer) => {
        const due = Math.max(0, toFinite(customer?.total_due, 0));
        const riskScore = toFinite(customer?.risk_score, 0);
        return due > 0 || riskScore > 0;
      })
      .sort((a, b) => {
        const riskDiff = toFinite(b?.risk_score, 0) - toFinite(a?.risk_score, 0);
        if (riskDiff !== 0) {
          return riskDiff;
        }

        return Math.max(0, toFinite(b?.total_due, 0)) - Math.max(0, toFinite(a?.total_due, 0));
      })
      .slice(0, 5);

    return {
      ...counts,
      topRiskyCustomers,
    };
  }, [customers]);

  const loadDashboard = useCallback(async () => {
    const filter = buildKpiDateFilter(selectedRange, new Date());
    const todayFilter = buildKpiDateFilter(DATE_RANGE_TYPES.TODAY, new Date());

    try {
      setLoading(true);
      setLoadError('');

      const [kpiSummary, movementCount, activeCustomersRows] = await Promise.all([
        getDashboardKpiSummary({
          startDateIso: filter.startDateIso,
          endDateIso: filter.endDateIso,
          transactionType,
        }),
        getStockMovementCountInRange({
          startDateIso: todayFilter.startDateIso,
          endDateIso: todayFilter.endDateIso,
        }),
        getDashboardTopActiveCustomers({
          startDateIso: filter.startDateIso,
          endDateIso: filter.endDateIso,
          transactionType,
          limit: 5,
        }),
      ]);

      setRangeLabel(
        formatRangeLabel({
          startDateIso: filter.startDateIso,
          endDateIso: filter.endDateIso,
        })
      );

      setKpis({
        totalCredit: Number(kpiSummary?.total_credit || 0),
        totalPayment: Number(kpiSummary?.total_payment || 0),
        net: Number(kpiSummary?.net || 0),
        transactions: Number(kpiSummary?.transactions_count || 0),
        activeCustomers: Number(kpiSummary?.active_customers || 0),
        collectionRate: Number(kpiSummary?.collection_rate || 0),
        averageTransaction: Number(kpiSummary?.average_transaction || 0),
        topDebtorName: kpiSummary?.top_debtor_name || null,
        topDebtorDue: Number(kpiSummary?.top_debtor_due || 0),
        mostActiveCustomerName: kpiSummary?.most_active_customer_name || null,
        mostActiveCustomerTxCount: Number(kpiSummary?.most_active_customer_tx_count || 0),
      });

      setTodayMovementCount(Math.max(0, toFinite(movementCount, 0)));
      setTopActiveCustomers(Array.isArray(activeCustomersRows) ? activeCustomersRows : []);
      setLastRefreshAt(new Date().toISOString());
    } catch (error) {
      setLoadError(error?.message || 'Unable to load dashboard KPIs.');
    } finally {
      setLoading(false);
    }
  }, [
    getDashboardKpiSummary,
    getDashboardTopActiveCustomers,
    getStockMovementCountInRange,
    selectedRange,
    transactionType,
  ]);

  const checkBackend = useCallback(async () => {
    setBackendInfo((prev) => ({
      ...prev,
      checking: true,
      errorMessage: '',
    }));

    const health = await fetchBackendHealth();

    setBackendInfo({
      checking: false,
      ok: Boolean(health?.ok),
      status: health?.status || 'unknown',
      baseUrl: health?.baseUrl || '',
      database: health?.database || null,
      errorMessage: health?.errorMessage || '',
    });
  }, []);

  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      setLoadError('');
      await refreshAll();
      await Promise.all([loadDashboard(), checkBackend()]);
    } catch (error) {
      setLoadError(error?.message || 'Refresh failed. Please try again.');
    } finally {
      setRefreshing(false);
    }
  }, [checkBackend, loadDashboard, refreshAll]);

  const handleRetry = useCallback(async () => {
    await Promise.all([loadDashboard(), checkBackend()]);
  }, [checkBackend, loadDashboard]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    checkBackend();
  }, [checkBackend]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={UI_COLORS.primary} />}
      >
        <View style={styles.headerWrap}>
          <Text style={styles.title}>Dashboard</Text>
          <Text style={styles.subtitle}>Dynamic business overview from app database + backend health.</Text>
          <Text style={styles.rangeLabel}>{rangeLabel}</Text>
          <Text style={styles.rangeLabel}>Last refresh: {formatLocalDateTime(lastRefreshAt)}</Text>
        </View>

        <View style={styles.kpiGrid}>
          <SummaryCard title="Total Products" value={String(summary.totalProducts)} icon="inventory-2" />
          <SummaryCard title="Total Customers" value={String(summary.totalCustomers)} icon="groups" />
          <SummaryCard title="Outstanding Due" value={formatMoney(summary.totalOutstandingDue)} icon="account-balance" />
          <SummaryCard title="Today's Movement" value={String(todayMovementCount)} icon="swap-horiz" />
        </View>

        <View style={styles.filterRow}>
          {DATE_RANGE_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[styles.filterChip, selectedRange === option.value && styles.filterChipActive]}
              onPress={() => setSelectedRange(option.value)}
            >
              <Text style={[styles.filterText, selectedRange === option.value && styles.filterTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>Transaction Filter</Text>
          <View style={styles.filterRow}>
            {TRANSACTION_FILTERS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[styles.filterChip, transactionType === option.value && styles.filterChipActive]}
                onPress={() => setTransactionType(option.value)}
              >
                <Text style={[styles.filterText, transactionType === option.value && styles.filterTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionWrap}>
            {QUICK_ACTIONS.map((action) => (
              <TouchableOpacity
                key={action.label}
                style={styles.quickActionButton}
                onPress={() => navigation.navigate(action.route)}
              >
                <MaterialIcons name={action.icon} size={16} color={UI_COLORS.primary} />
                <Text style={styles.quickActionText}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.kpiGrid}>
          <KpiCard title="Total Credit" value={`৳${kpis.totalCredit.toFixed(2)}`} icon="add-card" tone="warning" />
          <KpiCard title="Payments" value={`৳${kpis.totalPayment.toFixed(2)}`} icon="payments" tone="success" />
          <KpiCard
            title="Net"
            value={`৳${kpis.net.toFixed(2)}`}
            icon="account-balance-wallet"
            tone={kpis.net >= 0 ? 'danger' : 'success'}
          />
          <KpiCard title="Transactions" value={String(kpis.transactions)} icon="receipt-long" tone="primary" />
          <KpiCard title="Collection Rate" value={`${kpis.collectionRate.toFixed(1)}%`} icon="query-stats" tone="success" />
          <KpiCard title="Active Customers" value={String(kpis.activeCustomers)} icon="person-search" tone="primary" />
        </View>

        <View style={styles.insightWrap}>
          <Text style={styles.sectionTitle}>Smart Insights</Text>

          <View style={styles.insightCard}>
            <Text style={styles.insightLabel}>Top Debtor</Text>
            <Text style={styles.insightValue}>
              {kpis.topDebtorName ? `${kpis.topDebtorName} (৳${kpis.topDebtorDue.toFixed(2)})` : 'No debtor found'}
            </Text>
          </View>

          <View style={styles.insightCard}>
            <Text style={styles.insightLabel}>Most Active Customer</Text>
            <Text style={styles.insightValue}>
              {kpis.mostActiveCustomerName
                ? `${kpis.mostActiveCustomerName} (${kpis.mostActiveCustomerTxCount} transactions)`
                : 'No customer activity in range'}
            </Text>
          </View>

          <View style={styles.insightRow}>
            <View style={[styles.insightMiniCard, styles.insightMiniPrimary]}>
              <Text style={styles.insightMiniTitle}>Active Customers</Text>
              <Text style={styles.insightMiniValue}>{kpis.activeCustomers}</Text>
            </View>
            <View style={[styles.insightMiniCard, styles.insightMiniSuccess]}>
              <Text style={styles.insightMiniTitle}>Collection Rate</Text>
              <Text style={styles.insightMiniValue}>{kpis.collectionRate.toFixed(1)}%</Text>
            </View>
          </View>

          <View style={styles.insightCard}>
            <Text style={styles.insightLabel}>Average Transaction</Text>
            <Text style={styles.insightValue}>৳{kpis.averageTransaction.toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>Most Active Customers ({topActiveCustomers.length})</Text>
          {topActiveCustomers.length === 0 ? (
            <Text style={styles.emptyText}>No customer activity found for the selected period.</Text>
          ) : (
            topActiveCustomers.map((row) => (
              <ListRow
                key={`active-${row.customer_id}`}
                title={String(row.customer_name || 'Unknown Customer')}
                subtitle={`Credit ${formatMoney(row.credit_total)} • Payment ${formatMoney(row.payment_total)}`}
                rightText={`${Math.max(0, toFinite(row.tx_count, 0))} tx`}
              />
            ))
          )}
        </View>

        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>Inventory Health</Text>

          <View style={styles.kpiGrid}>
            <SummaryCard title="Low Stock" value={String((lowStockProducts || []).length)} icon="warning-amber" />
            <SummaryCard title="Expired" value={String((expiredProducts || []).length)} icon="event-busy" />
            <SummaryCard title="Expiring Soon" value={String((expiringSoonProducts || []).length)} icon="event" />
            <SummaryCard title="Reorder Suggestions" value={String(actionableReorder.length)} icon="fact-check" />
          </View>

          <Text style={styles.subSectionTitle}>Top Low-Stock Items</Text>
          {topLowStockItems.length === 0 ? (
            <Text style={styles.emptyText}>No low-stock items right now.</Text>
          ) : (
            topLowStockItems.map((item) => (
              <ListRow
                key={`low-${item.id}`}
                title={String(item.name || 'Unnamed product')}
                subtitle={`Qty ${toFinite(item.quantity, 0)} / Threshold ${toFinite(item.low_stock_threshold, 0)}`}
              />
            ))
          )}

          <Text style={styles.subSectionTitle}>Top Expired Items</Text>
          {topExpiredItems.length === 0 ? (
            <Text style={styles.emptyText}>No expired products.</Text>
          ) : (
            topExpiredItems.map((item) => (
              <ListRow
                key={`expired-${item.id}`}
                title={String(item.name || 'Unnamed product')}
                subtitle={`Expiry ${String(item.expiry_date || 'N/A').slice(0, 10)}`}
              />
            ))
          )}

          <Text style={styles.subSectionTitle}>Top Expiring Soon (next 7 days)</Text>
          {topExpiringSoonItems.length === 0 ? (
            <Text style={styles.emptyText}>No products expiring in next 7 days.</Text>
          ) : (
            topExpiringSoonItems.map((item) => (
              <ListRow
                key={`soon-${item.id}`}
                title={String(item.name || 'Unnamed product')}
                subtitle={`Expiry ${String(item.expiry_date || 'N/A').slice(0, 10)}`}
              />
            ))
          )}

          <Text style={styles.subSectionTitle}>Top Reorder Suggestions</Text>
          {topReorderItems.length === 0 ? (
            <Text style={styles.emptyText}>No reorder action required.</Text>
          ) : (
            topReorderItems.map((item) => (
              <ListRow
                key={`reorder-${item.productId}`}
                title={String(item.productName || 'Unnamed product')}
                subtitle={`Suggested Order ${toFinite(item.suggestedOrderQuantity, 0)} • ${item.reason || 'Reorder advised'}`}
              />
            ))
          )}
        </View>

        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>Customer Risk Snapshot</Text>
          <View style={styles.kpiGrid}>
            <SummaryCard title="High Risk" value={String(riskSnapshot.high)} icon="priority-high" />
            <SummaryCard title="Medium Risk" value={String(riskSnapshot.medium)} icon="report-problem" />
            <SummaryCard title="Low Risk" value={String(riskSnapshot.low)} icon="verified-user" />
          </View>

          <Text style={styles.subSectionTitle}>Top Risky Customers</Text>
          {riskSnapshot.topRiskyCustomers.length === 0 ? (
            <Text style={styles.emptyText}>No risky customers to show.</Text>
          ) : (
            riskSnapshot.topRiskyCustomers.map((row) => (
              <ListRow
                key={`risk-${row.id}`}
                title={String(row.name || 'Unnamed customer')}
                subtitle={`Due ${formatMoney(row.total_due)}`}
                badge={<CustomerRiskBadge riskLevel={row.risk_level} compact />}
              />
            ))
          )}
        </View>

        <View style={styles.statusWrap}>
          <View style={styles.statusHeaderRow}>
            <Text style={styles.sectionTitle}>Integration Status</Text>
            <TouchableOpacity style={styles.statusButton} onPress={checkBackend}>
              <Text style={styles.statusButtonText}>{backendInfo.checking ? 'Checking...' : 'Recheck'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.statusLineRow}>
            <View
              style={[
                styles.statusDot,
                backendInfo.ok ? styles.statusDotOnline : styles.statusDotOffline,
              ]}
            />
            <Text style={styles.statusText}>
              Backend: {backendInfo.ok ? 'Connected' : 'Offline'}
              {backendInfo.baseUrl ? ` (${backendInfo.baseUrl})` : ''}
            </Text>
          </View>

          <View style={styles.statusLineRow}>
            <View style={[styles.statusDot, styles.statusDotOnline]} />
            <Text style={styles.statusText}>Database: Connected (SQLite local)</Text>
          </View>

          {backendInfo.database ? (
            <Text style={styles.statusSubText}>Backend DB: {String(backendInfo.database)}</Text>
          ) : null}

          {!backendInfo.ok && backendInfo.errorMessage ? (
            <Text style={styles.statusErrorText}>{backendInfo.errorMessage}</Text>
          ) : null}
        </View>

        {loadError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Unable to load dashboard</Text>
            <Text style={styles.errorText}>{loadError}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {loading ? <LoadingPlaceholder /> : null}

        {!loading && !loadError && summary.totalProducts === 0 && summary.totalCustomers === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No business data found yet</Text>
            <Text style={styles.emptyText}>Use quick actions above to add products, customers, and transactions.</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: UI_COLORS.background,
  },
  container: {
    padding: 16,
    gap: 12,
  },
  headerWrap: {
    backgroundColor: UI_COLORS.surface,
    borderColor: UI_COLORS.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: UI_COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: UI_COLORS.textSecondary,
  },
  rangeLabel: {
    marginTop: 4,
    fontSize: 12,
    color: UI_COLORS.textMuted,
    fontWeight: '600',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sectionWrap: {
    backgroundColor: UI_COLORS.surface,
    borderColor: UI_COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: UI_COLORS.textPrimary,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
  },
  filterChipActive: {
    backgroundColor: '#DBEAFE',
  },
  filterText: {
    color: UI_COLORS.textSecondary,
    fontWeight: '700',
    fontSize: 12,
  },
  filterTextActive: {
    color: UI_COLORS.primary,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryCard: {
    width: '48.5%',
    minHeight: 84,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: UI_COLORS.surface,
  },
  summaryCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryCardTitle: {
    fontSize: 12,
    color: UI_COLORS.textSecondary,
    fontWeight: '700',
    flex: 1,
  },
  summaryCardValue: {
    marginTop: 8,
    fontSize: 18,
    color: UI_COLORS.textPrimary,
    fontWeight: '800',
  },
  quickActionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#C7D7FF',
    borderRadius: 999,
    backgroundColor: '#EEF3FF',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  quickActionText: {
    fontSize: 12,
    color: UI_COLORS.primary,
    fontWeight: '700',
  },
  insightWrap: {
    backgroundColor: UI_COLORS.surface,
    borderColor: UI_COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  insightCard: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#F8FAFC',
  },
  insightLabel: {
    fontSize: 12,
    color: UI_COLORS.textSecondary,
    fontWeight: '700',
  },
  insightValue: {
    marginTop: 6,
    fontSize: 14,
    color: UI_COLORS.textPrimary,
    fontWeight: '800',
  },
  insightRow: {
    flexDirection: 'row',
    gap: 8,
  },
  insightMiniCard: {
    flex: 1,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
  },
  insightMiniPrimary: {
    backgroundColor: '#F5F8FF',
    borderColor: '#C7D7FF',
  },
  insightMiniSuccess: {
    backgroundColor: '#ECFDF3',
    borderColor: '#BBF7D0',
  },
  insightMiniTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: UI_COLORS.textSecondary,
  },
  insightMiniValue: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: '800',
    color: UI_COLORS.textPrimary,
  },
  listRow: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  listRowLeft: {
    flex: 1,
  },
  listRowRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  listRowTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  listRowSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: UI_COLORS.textSecondary,
  },
  listRowRightText: {
    fontSize: 12,
    fontWeight: '700',
    color: UI_COLORS.primary,
  },
  subSectionTitle: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '800',
    color: UI_COLORS.textPrimary,
  },
  emptyText: {
    fontSize: 12,
    color: UI_COLORS.textMuted,
  },
  statusWrap: {
    backgroundColor: UI_COLORS.surface,
    borderColor: UI_COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  statusHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusButton: {
    backgroundColor: '#E7EEFF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusButtonText: {
    color: UI_COLORS.primary,
    fontWeight: '700',
    fontSize: 12,
  },
  statusLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  statusDotOnline: {
    backgroundColor: '#16A34A',
  },
  statusDotOffline: {
    backgroundColor: '#DC2626',
  },
  statusText: {
    fontSize: 12,
    color: UI_COLORS.textSecondary,
    fontWeight: '600',
  },
  statusSubText: {
    fontSize: 12,
    color: UI_COLORS.textMuted,
  },
  statusErrorText: {
    fontSize: 12,
    color: UI_COLORS.danger,
  },
  kpiCard: {
    width: '48.5%',
    minHeight: 92,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  kpiCardPrimary: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CFD8E3',
  },
  kpiCardSuccess: {
    backgroundColor: '#ECFDF3',
    borderColor: '#BBF7D0',
  },
  kpiCardWarning: {
    backgroundColor: '#FEF9C3',
    borderColor: '#FDE68A',
  },
  kpiCardDanger: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  kpiTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  kpiTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: UI_COLORS.textSecondary,
    flex: 1,
  },
  kpiValue: {
    marginTop: 10,
    fontSize: 20,
    fontWeight: '800',
    color: UI_COLORS.textPrimary,
  },
  loadingWrap: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: UI_COLORS.textMuted,
  },
  errorText: {
    color: UI_COLORS.danger,
    fontSize: 12,
    fontWeight: '600',
  },
  loadingCard: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: UI_COLORS.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingCardText: {
    color: UI_COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  errorCard: {
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    padding: 12,
    gap: 8,
  },
  errorTitle: {
    color: UI_COLORS.danger,
    fontSize: 14,
    fontWeight: '800',
  },
  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor: UI_COLORS.danger,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyCard: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: UI_COLORS.surface,
    gap: 6,
  },
  emptyTitle: {
    color: UI_COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
});
