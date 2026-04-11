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
import { AppCard } from '../components/ui';
import { SPACING } from '../theme/spacing';
import { TYPOGRAPHY } from '../theme/typography';

const QUICK_ACTIONS = [
  { icon: 'add-circle-outline', label: '+ Baki', route: 'Baki' },
  { icon: 'payments', label: '+ Payment', route: 'Baki' },
  { icon: 'groups', label: 'Customers', route: 'Customers' },
  { icon: 'inventory-2', label: 'Stock', route: 'Products' },
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
  const { isOnline } = useAuth();
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
  const [todayMovementCount, setTodayMovementCount] = useState(0);
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
    const range = buildKpiDateFilter(DATE_RANGE_TYPES.TODAY, new Date());

    try {
      setLoading(true);
      setLoadError('');

      const [kpiSummary, movementCount] = await Promise.all([
        getDashboardKpiSummary({
          startDateIso: range.startDateIso,
          endDateIso: range.endDateIso,
          transactionType: 'all',
        }),
        getStockMovementCountInRange({
          startDateIso: range.startDateIso,
          endDateIso: range.endDateIso,
        }),
      ]);

      setKpis({
        totalCredit: toNumber(kpiSummary?.total_credit, 0),
        totalPayment: toNumber(kpiSummary?.total_payment, 0),
        net: toNumber(kpiSummary?.net, 0),
        activeCustomers: toNumber(kpiSummary?.active_customers, 0),
      });
      setTodayMovementCount(Math.max(0, toNumber(movementCount, 0)));
      setLastRefreshAt(new Date().toISOString());
    } catch (error) {
      setLoadError(error?.message || 'Unable to load dashboard metrics.');
    } finally {
      setLoading(false);
    }
  }, [getDashboardKpiSummary, getStockMovementCountInRange]);

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
    gap: SPACING.sm,
  },
  quickActionItem: {
    flex: 1,
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
  statusText: {
    ...TYPOGRAPHY.small,
    color: UI_COLORS.textMuted,
  },
  errorText: {
    ...TYPOGRAPHY.small,
    color: UI_COLORS.danger,
  },
});
