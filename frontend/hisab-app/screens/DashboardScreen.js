import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UI_COLORS } from '../constants/ui-theme';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../context/AuthContext';
import { DATE_RANGE_TYPES, buildKpiDateFilter } from '../services/analytics/dateRangeUtils';
import { fetchComplianceDashboardOnline } from '../services/backend/reportingApi';
import { fetchActivityInsightExampleOnline } from '../services/backend/pilotApi';
import { AppButton, AppCard } from '../components/ui';
import { getDashboardTip } from '../services/onboarding/contextualTips';
import { SPACING } from '../theme/spacing';
import { TYPOGRAPHY } from '../theme/typography';

const QUICK_ACTIONS = [
  { icon: 'add-circle-outline', label: '+ Baki', route: 'Baki' },
  { icon: 'payments', label: '+ Payment', route: 'Baki' },
  { icon: 'groups', label: 'Customers', route: 'Customers' },
  { icon: 'inventory-2', label: 'Stock', route: 'Products' },
  { icon: 'analytics', label: 'Reports', route: 'Reports' },
];

const REPORT_PERIODS = [
  { key: 'daily', label: 'Daily', rangeType: DATE_RANGE_TYPES.TODAY },
  { key: 'weekly', label: 'Weekly', rangeType: DATE_RANGE_TYPES.WEEK },
  { key: 'monthly', label: 'Monthly', rangeType: DATE_RANGE_TYPES.MONTH },
];

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatMoney = (value) => `৳${toNumber(value, 0).toFixed(2)}`;

const formatDateTime = (isoString) => {
  if (!isoString) {
    return 'Just now';
  }

  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) {
    return 'Just now';
  }

  return parsed.toLocaleString();
};

function ActionIconButton({ icon, label, onPress }) {
  return (
    <TouchableOpacity style={styles.quickActionItem} activeOpacity={0.86} onPress={onPress}>
      <View style={styles.quickActionIconCircle}>
        <MaterialIcons name={icon} size={24} color={UI_COLORS.primary} />
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function DashboardScreen() {
  const navigation = useNavigation();
  const { isOnline, session } = useAuth();
  const {
    products,
    customers,
    refreshAll,
    getDashboardKpiSummary,
    getStockMovementCountInRange,
  } = useAppData();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [lastRefreshAt, setLastRefreshAt] = useState(null);
  const [period, setPeriod] = useState('daily');
  const [todayMovementCount, setTodayMovementCount] = useState(0);
  const [complianceDashboard, setComplianceDashboard] = useState(null);
  const [activityInsightExample, setActivityInsightExample] = useState(null);
  const [kpis, setKpis] = useState({
    totalCredit: 0,
    totalPayment: 0,
    net: 0,
    activeCustomers: 0,
  });

  const summary = useMemo(() => {
    const totalOutstandingDue = (customers || []).reduce((sum, row) => sum + Math.max(0, toNumber(row.total_due, 0)), 0);

    return {
      totalProducts: (products || []).length,
      totalCustomers: (customers || []).length,
      totalOutstandingDue,
    };
  }, [customers, products]);

  const loadDashboard = useCallback(async () => {
    const selectedPeriod = REPORT_PERIODS.find((row) => row.key === period) || REPORT_PERIODS[0];
    const range = buildKpiDateFilter(selectedPeriod.rangeType, new Date());

    try {
      setLoading(true);
      setLoadError('');

      const [kpiSummary, movementCount, onlineDashboard, pilotExample] = await Promise.all([
        getDashboardKpiSummary({
          startDateIso: range.startDateIso,
          endDateIso: range.endDateIso,
          transactionType: 'all',
        }),
        getStockMovementCountInRange({
          startDateIso: range.startDateIso,
          endDateIso: range.endDateIso,
        }),
        isOnline && session?.access_token
          ? fetchComplianceDashboardOnline({
            accessToken: session.access_token,
            period: selectedPeriod.key,
            fromDateIso: range.startDateIso,
            toDateIso: range.endDateIso,
          })
          : Promise.resolve(null),
        isOnline && session?.access_token
          ? fetchActivityInsightExampleOnline({
            accessToken: session.access_token,
          })
          : Promise.resolve(null),
      ]);

      setKpis({
        totalCredit: toNumber(kpiSummary?.total_credit, 0),
        totalPayment: toNumber(kpiSummary?.total_payment, 0),
        net: toNumber(kpiSummary?.net, 0),
        activeCustomers: toNumber(kpiSummary?.active_customers, 0),
      });
      setTodayMovementCount(Math.max(0, toNumber(movementCount, 0)));
      setComplianceDashboard(onlineDashboard?.dashboards || null);
      setActivityInsightExample(pilotExample?.example || null);
      setLastRefreshAt(new Date().toISOString());
    } catch (error) {
      setLoadError(error?.message || 'Unable to load dashboard metrics.');
    } finally {
      setLoading(false);
    }
  }, [getDashboardKpiSummary, getStockMovementCountInRange, isOnline, period, session?.access_token]);

  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await refreshAll();
      await loadDashboard();
    } finally {
      setRefreshing(false);
    }
  }, [loadDashboard, refreshAll]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={UI_COLORS.primary} />}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Hisab</Text>
            <Text style={styles.headerSubtitle}>Today at a glance</Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.profileIconButton}
            onPress={() => navigation.navigate('Profile')}
          >
            <MaterialIcons name="account-circle" size={28} color={UI_COLORS.primary} />
          </TouchableOpacity>
        </View>

        <AppCard style={styles.totalDueCard}>
          <Text style={styles.totalDueLabel}>Total Baki</Text>
          <Text style={styles.totalDueValue}>{formatMoney(summary.totalOutstandingDue)}</Text>
          <View style={styles.todayRow}>
            <View style={styles.todayMetricPill}>
              <Text style={styles.todayMetricLabel}>Today Credit</Text>
              <Text style={styles.todayMetricValue}>{formatMoney(kpis.totalCredit)}</Text>
            </View>
            <View style={styles.todayMetricPill}>
              <Text style={styles.todayMetricLabel}>Today Payment</Text>
              <Text style={styles.todayMetricValue}>{formatMoney(kpis.totalPayment)}</Text>
            </View>
          </View>
        </AppCard>

        <AppCard style={styles.totalDueCard}>
          <Text style={styles.sectionTitle}>Reporting Period</Text>
          <View style={styles.periodRow}>
            {REPORT_PERIODS.map((option) => (
              <AppButton
                key={option.key}
                title={option.label}
                variant={period === option.key ? 'primary' : 'secondary'}
                style={styles.periodButton}
                onPress={() => setPeriod(option.key)}
              />
            ))}
          </View>
        </AppCard>

        <AppCard style={styles.totalDueCard}>
          <Text style={styles.sectionTitle}>Sales Dashboard</Text>
          <Text style={styles.metaText}>Total Sales: {formatMoney(complianceDashboard?.sales?.totalSales)}</Text>
          <Text style={styles.metaText}>Transactions: {toNumber(complianceDashboard?.sales?.transactionCount, 0)}</Text>
          <Text style={styles.sectionSubTitle}>Top Selling Products</Text>
          {(complianceDashboard?.sales?.topSellingProducts || []).slice(0, 5).map((row) => (
            <Text key={`top-${row.productId}`} style={styles.metaText}>
              {row.productName}: {toNumber(row.unitsSold, 0)} units
            </Text>
          ))}
        </AppCard>

        <AppCard style={styles.totalDueCard}>
          <Text style={styles.sectionTitle}>Inventory Dashboard</Text>
          <Text style={styles.metaText}>Current Stock Items: {(complianceDashboard?.inventory?.currentStockLevels || []).length}</Text>
          <Text style={styles.metaText}>Low Stock Items: {(complianceDashboard?.inventory?.lowStockItems || []).length}</Text>
          <Text style={styles.metaText}>Dead Stock Items: {(complianceDashboard?.inventory?.deadStockItems || []).length}</Text>
        </AppCard>

        <AppCard style={styles.totalDueCard}>
          <Text style={styles.sectionTitle}>Finance Dashboard</Text>
          <Text style={styles.metaText}>Revenue: {formatMoney(complianceDashboard?.finance?.totalRevenue)}</Text>
          <Text style={styles.metaText}>Expenses: {formatMoney(complianceDashboard?.finance?.totalExpenses)}</Text>
          <Text style={styles.metaText}>Profit: {formatMoney(complianceDashboard?.finance?.netProfit)}</Text>
        </AppCard>

        <AppCard style={styles.totalDueCard}>
          <Text style={styles.sectionTitle}>Collections Dashboard</Text>
          <Text style={styles.metaText}>Total Baki: {formatMoney(complianceDashboard?.collections?.totalBaki)}</Text>
          <Text style={styles.metaText}>Overdue: {formatMoney(complianceDashboard?.collections?.overdueAmount)}</Text>
          <Text style={styles.metaText}>Recovery Rate: {toNumber(complianceDashboard?.collections?.recoveryRate, 0).toFixed(2)}%</Text>
        </AppCard>

        <AppCard style={styles.totalDueCard}>
          <Text style={styles.sectionTitle}>Pilot Adoption Tip</Text>
          <Text style={styles.metaText}>{getDashboardTip({
            period,
            totalCustomers: summary.totalCustomers,
            isOnline,
          })}</Text>
          <View style={styles.inlineButtonRow}>
            <AppButton
              title="Open Onboarding"
              variant="secondary"
              style={styles.inlineButton}
              onPress={() => navigation.navigate('Onboarding')}
            />
            <AppButton
              title="Help Center"
              variant="secondary"
              style={styles.inlineButton}
              onPress={() => navigation.navigate('HelpCenter')}
            />
          </View>
        </AppCard>

        <AppCard style={styles.totalDueCard}>
          <Text style={styles.sectionTitle}>Activity to Insight Example</Text>
          <Text style={styles.metaText}>Activity: {activityInsightExample?.activity?.event_type || 'sale_created'}</Text>
          <Text style={styles.metaText}>{activityInsightExample?.metrics?.dao || 'Operator activity updates DAO.'}</Text>
          <Text style={styles.metaText}>{activityInsightExample?.metrics?.digitalSalesRatio || 'Sale totals update digital ratio.'}</Text>
          <Text style={styles.metaText}>{activityInsightExample?.metrics?.featureUsage || 'Feature usage count increments.'}</Text>
          <Text style={styles.metaText}>{activityInsightExample?.insight || 'Adoption signals convert into actionable insights.'}</Text>
        </AppCard>

        <View>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionGrid}>
            {QUICK_ACTIONS.map((action) => (
              <ActionIconButton
                key={action.label}
                icon={action.icon}
                label={action.label}
                onPress={() => navigation.navigate(action.route)}
              />
            ))}
          </View>
        </View>

        <View style={styles.footStatRow}>
          <View style={styles.footStatItem}>
            <Text style={styles.footStatLabel}>Customers</Text>
            <Text style={styles.footStatValue}>{summary.totalCustomers}</Text>
          </View>
          <View style={styles.footStatItem}>
            <Text style={styles.footStatLabel}>Products</Text>
            <Text style={styles.footStatValue}>{summary.totalProducts}</Text>
          </View>
          <View style={styles.footStatItem}>
            <Text style={styles.footStatLabel}>Moves Today</Text>
            <Text style={styles.footStatValue}>{todayMovementCount}</Text>
          </View>
        </View>

        <Text style={styles.statusText}>
          Sync: {isOnline ? 'Online' : 'Offline'} | Last refresh: {formatDateTime(lastRefreshAt)}
        </Text>
        {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}
        {loading ? <Text style={styles.statusText}>Loading dashboard data...</Text> : null}
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
    padding: SPACING.lg,
    paddingBottom: SPACING.xl,
    gap: SPACING.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    ...TYPOGRAPHY.h2,
    color: UI_COLORS.textPrimary,
  },
  headerSubtitle: {
    ...TYPOGRAPHY.body,
    color: UI_COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  profileIconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI_COLORS.surface,
  },
  totalDueCard: {
    backgroundColor: UI_COLORS.surface,
  },
  totalDueLabel: {
    ...TYPOGRAPHY.small,
    color: UI_COLORS.textSecondary,
  },
  totalDueValue: {
    ...TYPOGRAPHY.h1,
    color: UI_COLORS.textPrimary,
    marginTop: SPACING.xs,
    fontWeight: '700',
  },
  todayRow: {
    marginTop: SPACING.md,
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  todayMetricPill: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.surfaceSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  todayMetricLabel: {
    ...TYPOGRAPHY.small,
    color: UI_COLORS.textMuted,
  },
  todayMetricValue: {
    ...TYPOGRAPHY.body,
    color: UI_COLORS.textPrimary,
    fontWeight: '700',
    marginTop: SPACING.xs,
  },
  sectionTitle: {
    ...TYPOGRAPHY.subheading,
    color: UI_COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  quickActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  quickActionItem: {
    width: '30%',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  quickActionIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    ...TYPOGRAPHY.small,
    color: UI_COLORS.textPrimary,
    fontWeight: '700',
    textAlign: 'center',
  },
  footStatRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  footStatItem: {
    flex: 1,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    backgroundColor: UI_COLORS.surface,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footStatLabel: {
    ...TYPOGRAPHY.small,
    color: UI_COLORS.textMuted,
  },
  footStatValue: {
    ...TYPOGRAPHY.body,
    color: UI_COLORS.textPrimary,
    marginTop: SPACING.xs,
    fontWeight: '700',
  },
  periodRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  periodButton: {
    minHeight: 44,
    flexGrow: 1,
  },
  inlineButtonRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  inlineButton: {
    flex: 1,
    minHeight: 42,
  },
  metaText: {
    ...TYPOGRAPHY.small,
    color: UI_COLORS.textSecondary,
  },
  sectionSubTitle: {
    ...TYPOGRAPHY.small,
    color: UI_COLORS.textPrimary,
    marginTop: SPACING.sm,
    fontWeight: '700',
  },
  statusText: {
    ...TYPOGRAPHY.small,
    color: UI_COLORS.textMuted,
  },
  errorText: {
    ...TYPOGRAPHY.small,
    color: UI_COLORS.danger,
  },
});
