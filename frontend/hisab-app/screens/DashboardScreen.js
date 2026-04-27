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
import { useLanguage } from '../context/LanguageContext';
import { DATE_RANGE_TYPES, buildKpiDateFilter } from '../services/analytics/dateRangeUtils';
import { fetchComplianceDashboardOnline } from '../services/backend/reportingApi';
import { fetchActivityInsightExampleOnline } from '../services/backend/pilotApi';
import { AppButton, AppCard } from '../components/ui';
import { getDashboardTip } from '../services/onboarding/contextualTips';
import { SPACING } from '../theme/spacing';
import { TYPOGRAPHY } from '../theme/typography';

const REPORT_PERIODS = [
  { key: 'daily', labelKey: 'dashboard.daily', rangeType: DATE_RANGE_TYPES.TODAY },
  { key: 'weekly', labelKey: 'dashboard.weekly', rangeType: DATE_RANGE_TYPES.WEEK },
  { key: 'monthly', labelKey: 'dashboard.monthly', rangeType: DATE_RANGE_TYPES.MONTH },
];

const QUICK_OPTIONS = [
  { route: 'Sales', labelKey: 'dashboard.quick.sales', icon: 'point-of-sale' },
  { route: 'Baki', labelKey: 'dashboard.quick.baki', icon: 'account-balance' },
  { route: 'Cashbook', labelKey: 'dashboard.quick.cashbook', icon: 'account-balance-wallet' },
  { route: 'Expenses', labelKey: 'dashboard.quick.expenses', icon: 'receipt' },
  { route: 'DayClose', labelKey: 'dashboard.quick.dayClose', icon: 'event-available' },
];

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatMoney = (value) => `৳${toNumber(value, 0).toFixed(2)}`;

export default function DashboardScreen() {
  const navigation = useNavigation();
  const { isOnline, session } = useAuth();
  const { t } = useLanguage();
  const {
    customers,
    refreshAll,
    getDashboardKpiSummary,
    getStockMovementCountInRange,
  } = useAppData();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [period, setPeriod] = useState('daily');
  const [complianceDashboard, setComplianceDashboard] = useState(null);
  const [activityInsightExample, setActivityInsightExample] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [, setLastRefreshAt] = useState(null);
  const [kpis, setKpis] = useState({
    totalCredit: 0,
    totalPayment: 0,
    totalSales: 0,
    net: 0,
    activeCustomers: 0,
  });

  const summary = useMemo(() => {
    const totalOutstandingDue = (customers || []).reduce(
      (sum, row) => sum + Math.max(0, toNumber(row.total_due, 0)),
      0,
    );
    return { totalOutstandingDue };
  }, [customers]);
  const totalCustomers = (customers || []).length;

  const loadDashboard = useCallback(async () => {
    const selectedPeriod = REPORT_PERIODS.find((r) => r.key === period) || REPORT_PERIODS[0];
    const range = buildKpiDateFilter(selectedPeriod.rangeType, new Date());

    try {
      setLoading(true);
      setLoadError('');

      const [kpiSummary, , onlineDashboard, pilotExample] = await Promise.all([
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
          ? fetchActivityInsightExampleOnline({ accessToken: session.access_token })
          : Promise.resolve(null),
      ]);

      setKpis({
        totalCredit: toNumber(kpiSummary?.total_credit, 0),
        totalPayment: toNumber(kpiSummary?.total_payment, 0),
        totalSales: toNumber(kpiSummary?.total_sales, 0),
        net: toNumber(kpiSummary?.net, 0),
        activeCustomers: toNumber(kpiSummary?.active_customers, 0),
      });
      setComplianceDashboard(onlineDashboard?.dashboards || null);
      setActivityInsightExample(pilotExample?.example || null);
      setLastRefreshAt(new Date().toISOString());
    } catch (error) {
      setLoadError(error?.message || t('dashboard.loadError'));
    } finally {
      setLoading(false);
    }
  }, [getDashboardKpiSummary, getStockMovementCountInRange, isOnline, period, session?.access_token, t]);

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

  const todaySales = toNumber(
    complianceDashboard?.sales?.totalSales ?? kpis.totalSales,
    kpis.totalSales,
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={UI_COLORS.primary}
          />
        }
      >
        {/* ── Header ──────────────────────────────────────── */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>{t('dashboard.title')}</Text>
            <Text style={styles.headerSubtitle}>{t('dashboard.subtitle')}</Text>
          </View>
        </View>

        {/* ── Hero metric ──────────────────────────────────── */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>{t('dashboard.totalDue')}</Text>
          <Text style={styles.heroAmount} adjustsFontSizeToFit numberOfLines={1}>
            {formatMoney(summary.totalOutstandingDue)}
          </Text>

          <View style={styles.metricsRow}>
            <View style={styles.metricBlock}>
              <Text style={styles.metricLabel}>{t('dashboard.todaySales')}</Text>
              <Text style={styles.metricValue}>{formatMoney(todaySales)}</Text>
            </View>

            <View style={styles.metricDivider} />

            <View style={styles.metricBlock}>
              <Text style={styles.metricLabel}>{t('dashboard.todayPayments')}</Text>
              <Text style={[styles.metricValue, styles.metricValueGreen]}>
                {formatMoney(kpis.totalPayment)}
              </Text>
            </View>
          </View>
        </View>

        {/* ── 2 Primary CTAs ───────────────────────────────── */}
        <View style={styles.ctaRow}>
          <TouchableOpacity
            style={styles.ctaPrimary}
            activeOpacity={0.84}
            onPress={() => navigation.navigate('Baki')}
          >
            <MaterialIcons name="sync-alt" size={24} color={UI_COLORS.textOnPrimary} />
            <Text style={styles.ctaPrimaryText}>{t('dashboard.bakiAction')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.ctaGreen}
            activeOpacity={0.84}
            onPress={() => navigation.navigate('Sales')}
          >
            <MaterialIcons name="shopping-cart" size={24} color={UI_COLORS.textOnPrimary} />
            <Text style={styles.ctaGreenText}>{t('dashboard.sellAction')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.quickOptionsWrap}>
          {QUICK_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.route}
              style={styles.quickOptionCard}
              activeOpacity={0.84}
              onPress={() => navigation.navigate(option.route)}
            >
              <View style={styles.quickOptionIconWrap}>
                <MaterialIcons name={option.icon} size={18} color={UI_COLORS.primary} />
              </View>
              <Text style={styles.quickOptionLabel}>{t(option.labelKey)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Analytics toggle ─────────────────────────────── */}
        <TouchableOpacity
          style={styles.analyticsToggle}
          activeOpacity={0.75}
          onPress={() => setShowAnalytics((v) => !v)}
        >
          <Text style={styles.analyticsToggleText}>{t('dashboard.analytics')}</Text>
          <MaterialIcons
            name={showAnalytics ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
            size={20}
            color={UI_COLORS.primary}
          />
        </TouchableOpacity>

        {/* ── Collapsible analytics ────────────────────────── */}
        {showAnalytics && (
          <>
            {/* Period selector — ghost/outlined feel */}
            <AppCard variant="outlined" style={styles.card}>
              <Text style={styles.cardTitle}>{t('dashboard.period')}</Text>
              <View style={styles.periodRow}>
                {REPORT_PERIODS.map((option) => (
                  <AppButton
                    key={option.key}
                    title={t(option.labelKey)}
                    variant={period === option.key ? 'primary' : 'secondary'}
                    size="sm"
                    style={styles.periodButton}
                    onPress={() => setPeriod(option.key)}
                  />
                ))}
              </View>
            </AppCard>

            {/* Sales — flat background, inline metrics */}
            <AppCard variant="flat" style={styles.card}>
              <Text style={styles.cardTitle}>{t('dashboard.salesReport')}</Text>
              <View style={styles.inlineMetrics}>
                <View style={styles.inlineMetricItem}>
                  <Text style={styles.inlineMetricValue}>{formatMoney(complianceDashboard?.sales?.totalSales)}</Text>
                  <Text style={styles.inlineMetricLabel}>{t('dashboard.totalSales')}</Text>
                </View>
                <View style={styles.inlineMetricItem}>
                  <Text style={styles.inlineMetricValue}>{toNumber(complianceDashboard?.sales?.transactionCount, 0)}</Text>
                  <Text style={styles.inlineMetricLabel}>{t('dashboard.transactions')}</Text>
                </View>
              </View>
              <Text style={styles.cardSubtitle}>{t('dashboard.topProducts')}</Text>
              {(complianceDashboard?.sales?.topSellingProducts || []).slice(0, 5).map((row) => (
                <Text key={`top-${row.productId}`} style={styles.cardLine}>
                  {row.productName}: {toNumber(row.unitsSold, 0)}
                </Text>
              ))}
            </AppCard>

            {/* Inventory — default with stronger border */}
            <AppCard style={styles.card}>
              <Text style={styles.cardTitle}>{t('dashboard.inventoryReport')}</Text>
              <View style={styles.inlineMetrics}>
                <View style={styles.inlineMetricItem}>
                  <Text style={styles.inlineMetricValue}>{(complianceDashboard?.inventory?.currentStockLevels || []).length}</Text>
                  <Text style={styles.inlineMetricLabel}>{t('dashboard.current')}</Text>
                </View>
                <View style={[styles.inlineMetricItem, { borderLeftWidth: 1, borderLeftColor: UI_COLORS.borderSoft, paddingLeft: 12 }]}>
                  <Text style={[styles.inlineMetricValue, { color: UI_COLORS.textWarning }]}>{(complianceDashboard?.inventory?.lowStockItems || []).length}</Text>
                  <Text style={styles.inlineMetricLabel}>{t('dashboard.low')}</Text>
                </View>
                <View style={[styles.inlineMetricItem, { borderLeftWidth: 1, borderLeftColor: UI_COLORS.borderSoft, paddingLeft: 12 }]}>
                  <Text style={[styles.inlineMetricValue, { color: UI_COLORS.textDanger }]}>{(complianceDashboard?.inventory?.deadStockItems || []).length}</Text>
                  <Text style={styles.inlineMetricLabel}>{t('dashboard.dead')}</Text>
                </View>
              </View>
            </AppCard>

            {/* Finance — accent stripe */}
            <AppCard variant="accent" style={styles.card}>
              <Text style={styles.cardTitle}>{t('dashboard.financeReport')}</Text>
              <View style={styles.inlineMetrics}>
                <View style={styles.inlineMetricItem}>
                  <Text style={[styles.inlineMetricValue, { color: UI_COLORS.textSuccess }]}>{formatMoney(complianceDashboard?.finance?.totalRevenue)}</Text>
                  <Text style={styles.inlineMetricLabel}>{t('dashboard.income')}</Text>
                </View>
                <View style={styles.inlineMetricItem}>
                  <Text style={[styles.inlineMetricValue, { color: UI_COLORS.textDanger }]}>{formatMoney(complianceDashboard?.finance?.totalExpenses)}</Text>
                  <Text style={styles.inlineMetricLabel}>{t('dashboard.expense')}</Text>
                </View>
                <View style={styles.inlineMetricItem}>
                  <Text style={styles.inlineMetricValue}>{formatMoney(complianceDashboard?.finance?.netProfit)}</Text>
                  <Text style={styles.inlineMetricLabel}>{t('dashboard.profit')}</Text>
                </View>
              </View>
            </AppCard>

            {/* Collections — elevated */}
            <AppCard variant="elevated" style={styles.card}>
              <Text style={styles.cardTitle}>{t('dashboard.collectionsReport')}</Text>
              <Text style={styles.cardLine}>{t('dashboard.totalBaki', { amount: formatMoney(complianceDashboard?.collections?.totalBaki) })}</Text>
              <Text style={styles.cardLine}>{t('dashboard.overdue', { amount: formatMoney(complianceDashboard?.collections?.overdueAmount) })}</Text>
              <Text style={styles.cardLine}>{t('dashboard.recoveryRate', { rate: toNumber(complianceDashboard?.collections?.recoveryRate, 0).toFixed(2) })}</Text>
            </AppCard>

            {/* Tip — accent */}
            <AppCard variant="accent" style={styles.card}>
              <Text style={styles.cardTitle}>{t('dashboard.tip')}</Text>
              <Text style={styles.cardLine}>{getDashboardTip({
                period,
                totalCustomers,
                isOnline,
              })}</Text>
              <View style={styles.inlineButtonRow}>
                <AppButton
                  title={t('dashboard.onboarding')}
                  variant="secondary"
                  size="sm"
                  style={styles.inlineButton}
                  onPress={() => navigation.navigate('Onboarding')}
                />
                <AppButton
                  title={t('dashboard.help')}
                  variant="secondary"
                  size="sm"
                  style={styles.inlineButton}
                  onPress={() => navigation.navigate('HelpCenter')}
                />
              </View>
            </AppCard>

            {/* Activity — flat */}
            <AppCard variant="flat" style={styles.card}>
              <Text style={styles.cardTitle}>{t('dashboard.activityReport')}</Text>
              <Text style={styles.cardLine}>{activityInsightExample?.activity?.event_type || 'sale_created'}</Text>
              <Text style={styles.cardLine}>{activityInsightExample?.metrics?.dao || ''}</Text>
              <Text style={styles.cardLine}>{activityInsightExample?.metrics?.digitalSalesRatio || ''}</Text>
              <Text style={styles.cardLine}>{activityInsightExample?.metrics?.featureUsage || ''}</Text>
              <Text style={styles.cardLine}>{activityInsightExample?.insight || ''}</Text>
            </AppCard>
          </>
        )}

        {loading && !refreshing && (
          <Text style={styles.statusText}>{t('dashboard.loading')}</Text>
        )}
        {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: UI_COLORS.background },
  container: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl,
    gap: SPACING.lg,
  },

  /* header */
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flex: 1 },
  headerTitle: { ...TYPOGRAPHY.h2, color: UI_COLORS.textPrimary, fontFamily: 'AnekBangla_800ExtraBold' },
  headerSubtitle: { ...TYPOGRAPHY.small, color: UI_COLORS.textSecondary, marginTop: 2 },
  profileBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.surface,
  },

  /* hero card */
  heroCard: {
    backgroundColor: UI_COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    gap: SPACING.md,
  },
  heroLabel: {
    fontSize: 13,
    fontFamily: 'AnekBangla_600SemiBold',
    color: UI_COLORS.textSecondary,
    letterSpacing: 0.5,
  },
  heroAmount: {
    fontSize: 48,
    fontFamily: 'AnekBangla_800ExtraBold',
    color: UI_COLORS.textPrimary,
    letterSpacing: -1,
    lineHeight: 54,
  },
  metricsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: UI_COLORS.borderSoft,
    paddingTop: SPACING.md,
  },
  metricBlock: { flex: 1, gap: 4 },
  metricDivider: {
    width: 1,
    backgroundColor: UI_COLORS.borderSoft,
    marginHorizontal: SPACING.md,
  },
  metricLabel: { fontSize: 12, color: UI_COLORS.textMuted, fontFamily: 'AnekBangla_600SemiBold' },
  metricValue: { fontSize: 20, fontFamily: 'AnekBangla_700Bold', color: UI_COLORS.textPrimary },
  metricValueGreen: { color: UI_COLORS.textSuccess },

  /* primary CTAs */
  ctaRow: {
    flexDirection: 'row',
    gap: 10,
  },
  ctaPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: UI_COLORS.primary,
    borderRadius: 14,
    paddingVertical: 18,
  },
  ctaPrimaryText: { fontSize: 16, fontFamily: 'AnekBangla_800ExtraBold', color: UI_COLORS.textOnPrimary },
  ctaGreen: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: UI_COLORS.success,
    borderRadius: 14,
    paddingVertical: 18,
  },
  ctaGreenText: { fontSize: 16, fontFamily: 'AnekBangla_800ExtraBold', color: UI_COLORS.textOnPrimary },

  quickOptionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickOptionCard: {
    width: '31.8%',
    minHeight: 82,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: UI_COLORS.surface,
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
    shadowColor: '#FFFFFF',
    shadowOffset: { width: -2, height: -2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    elevation: 4,
  },
  quickOptionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI_COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
  },
  quickOptionLabel: {
    fontSize: 12,
    fontFamily: 'AnekBangla_700Bold',
    color: UI_COLORS.textPrimary,
    textAlign: 'center',
  },

  /* secondary nav */
  secondaryNav: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryNavItem: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.surface,
  },
  secondaryNavIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: UI_COLORS.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryNavLabel: {
    fontSize: 12,
    fontFamily: 'AnekBangla_700Bold',
    color: UI_COLORS.textPrimary,
    textAlign: 'center',
  },

  /* analytics toggle */
  analyticsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.surface,
  },
  analyticsToggleText: { ...TYPOGRAPHY.body, color: UI_COLORS.primary, fontFamily: 'AnekBangla_600SemiBold' },

  /* analytics cards */
  card: {},
  cardTitle: { ...TYPOGRAPHY.subheading, color: UI_COLORS.textPrimary, marginBottom: SPACING.sm },
  cardSubtitle: { ...TYPOGRAPHY.small, color: UI_COLORS.textPrimary, marginTop: SPACING.sm, fontFamily: 'AnekBangla_700Bold' },
  cardLine: { ...TYPOGRAPHY.small, color: UI_COLORS.textSecondary },
  periodRow: { flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' },
  periodButton: { flexGrow: 1 },
  inlineButtonRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  inlineButton: { flex: 1 },
  inlineMetrics: { flexDirection: 'row', gap: 12, marginBottom: SPACING.xs },
  inlineMetricItem: { gap: 2 },
  inlineMetricValue: { fontSize: 18, fontFamily: 'AnekBangla_800ExtraBold', color: UI_COLORS.textPrimary },
  inlineMetricLabel: { fontSize: 11, fontFamily: 'AnekBangla_600SemiBold', color: UI_COLORS.textMuted },

  statusText: { ...TYPOGRAPHY.small, color: UI_COLORS.textMuted, textAlign: 'center' },
  errorText: { ...TYPOGRAPHY.small, color: UI_COLORS.danger, textAlign: 'center' },
});
