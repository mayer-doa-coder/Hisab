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

const SECONDARY_NAV = [
  { icon: 'groups', labelKey: 'dashboard.customers', route: 'Customers' },
  { icon: 'inventory-2', labelKey: 'dashboard.products', route: 'Products' },
  { icon: 'analytics', labelKey: 'dashboard.reports', route: 'Reports' },
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
    products,
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
    net: 0,
    activeCustomers: 0,
  });

  const summary = useMemo(() => {
    const totalOutstandingDue = (customers || []).reduce(
      (sum, row) => sum + Math.max(0, toNumber(row.total_due, 0)),
      0,
    );
    return {
      totalProducts: (products || []).length,
      totalCustomers: (customers || []).length,
      totalOutstandingDue,
    };
  }, [customers, products]);

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
    complianceDashboard?.sales?.totalSales ?? kpis.totalCredit,
    kpis.totalCredit,
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
          <TouchableOpacity
            style={styles.profileBtn}
            onPress={() => navigation.navigate('Profile')}
            accessibilityRole="button"
          >
            <MaterialIcons name="account-circle" size={30} color={UI_COLORS.primary} />
          </TouchableOpacity>
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

        {/* ── Secondary navigation ─────────────────────────── */}
        <View style={styles.secondaryNav}>
          {SECONDARY_NAV.map((item) => (
            <TouchableOpacity
              key={item.route}
              style={styles.secondaryNavItem}
              activeOpacity={0.78}
              onPress={() => navigation.navigate(item.route)}
            >
              <View style={styles.secondaryNavIcon}>
                <MaterialIcons name={item.icon} size={24} color={UI_COLORS.primary} />
              </View>
              <Text style={styles.secondaryNavLabel}>{t(item.labelKey)}</Text>
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
              <Text style={styles.cardTitle}>বিক্রির হিসাব</Text>
              <View style={styles.inlineMetrics}>
                <View style={styles.inlineMetricItem}>
                  <Text style={styles.inlineMetricValue}>{formatMoney(complianceDashboard?.sales?.totalSales)}</Text>
                  <Text style={styles.inlineMetricLabel}>মোট বিক্রি</Text>
                </View>
                <View style={styles.inlineMetricItem}>
                  <Text style={styles.inlineMetricValue}>{toNumber(complianceDashboard?.sales?.transactionCount, 0)}</Text>
                  <Text style={styles.inlineMetricLabel}>লেনদেন</Text>
                </View>
              </View>
              <Text style={styles.cardSubtitle}>সেরা পণ্য</Text>
              {(complianceDashboard?.sales?.topSellingProducts || []).slice(0, 5).map((row) => (
                <Text key={`top-${row.productId}`} style={styles.cardLine}>
                  {row.productName}: {toNumber(row.unitsSold, 0)} টি
                </Text>
              ))}
            </AppCard>

            {/* Inventory — default with stronger border */}
            <AppCard style={styles.card}>
              <Text style={styles.cardTitle}>মালের হিসাব</Text>
              <View style={styles.inlineMetrics}>
                <View style={styles.inlineMetricItem}>
                  <Text style={styles.inlineMetricValue}>{(complianceDashboard?.inventory?.currentStockLevels || []).length}</Text>
                  <Text style={styles.inlineMetricLabel}>বর্তমান</Text>
                </View>
                <View style={[styles.inlineMetricItem, { borderLeftWidth: 1, borderLeftColor: UI_COLORS.borderSoft, paddingLeft: 12 }]}>
                  <Text style={[styles.inlineMetricValue, { color: UI_COLORS.textWarning }]}>{(complianceDashboard?.inventory?.lowStockItems || []).length}</Text>
                  <Text style={styles.inlineMetricLabel}>কম</Text>
                </View>
                <View style={[styles.inlineMetricItem, { borderLeftWidth: 1, borderLeftColor: UI_COLORS.borderSoft, paddingLeft: 12 }]}>
                  <Text style={[styles.inlineMetricValue, { color: UI_COLORS.textDanger }]}>{(complianceDashboard?.inventory?.deadStockItems || []).length}</Text>
                  <Text style={styles.inlineMetricLabel}>বন্ধ</Text>
                </View>
              </View>
            </AppCard>

            {/* Finance — accent stripe */}
            <AppCard variant="accent" style={styles.card}>
              <Text style={styles.cardTitle}>আর্থিক হিসাব</Text>
              <View style={styles.inlineMetrics}>
                <View style={styles.inlineMetricItem}>
                  <Text style={[styles.inlineMetricValue, { color: UI_COLORS.textSuccess }]}>{formatMoney(complianceDashboard?.finance?.totalRevenue)}</Text>
                  <Text style={styles.inlineMetricLabel}>আয়</Text>
                </View>
                <View style={styles.inlineMetricItem}>
                  <Text style={[styles.inlineMetricValue, { color: UI_COLORS.textDanger }]}>{formatMoney(complianceDashboard?.finance?.totalExpenses)}</Text>
                  <Text style={styles.inlineMetricLabel}>খরচ</Text>
                </View>
                <View style={styles.inlineMetricItem}>
                  <Text style={styles.inlineMetricValue}>{formatMoney(complianceDashboard?.finance?.netProfit)}</Text>
                  <Text style={styles.inlineMetricLabel}>লাভ</Text>
                </View>
              </View>
            </AppCard>

            {/* Collections — elevated */}
            <AppCard variant="elevated" style={styles.card}>
              <Text style={styles.cardTitle}>আদায়ের হিসাব</Text>
              <Text style={styles.cardLine}>মোট বাকি: {formatMoney(complianceDashboard?.collections?.totalBaki)}</Text>
              <Text style={styles.cardLine}>বকেয়া: {formatMoney(complianceDashboard?.collections?.overdueAmount)}</Text>
              <Text style={styles.cardLine}>আদায়ের হার: {toNumber(complianceDashboard?.collections?.recoveryRate, 0).toFixed(2)}%</Text>
            </AppCard>

            {/* Tip — accent */}
            <AppCard variant="accent" style={styles.card}>
              <Text style={styles.cardTitle}>পরামর্শ</Text>
              <Text style={styles.cardLine}>{getDashboardTip({
                period,
                totalCustomers: summary.totalCustomers,
                isOnline,
              })}</Text>
              <View style={styles.inlineButtonRow}>
                <AppButton
                  title="পরিচিতি"
                  variant="secondary"
                  size="sm"
                  style={styles.inlineButton}
                  onPress={() => navigation.navigate('Onboarding')}
                />
                <AppButton
                  title="সাহায্য"
                  variant="secondary"
                  size="sm"
                  style={styles.inlineButton}
                  onPress={() => navigation.navigate('HelpCenter')}
                />
              </View>
            </AppCard>

            {/* Activity — flat */}
            <AppCard variant="flat" style={styles.card}>
              <Text style={styles.cardTitle}>কার্যক্রমের বিশ্লেষণ</Text>
              <Text style={styles.cardLine}>কার্যক্রম: {activityInsightExample?.activity?.event_type || 'sale_created'}</Text>
              <Text style={styles.cardLine}>{activityInsightExample?.metrics?.dao || 'অপারেটরের কার্যক্রম DAO আপডেট করে।'}</Text>
              <Text style={styles.cardLine}>{activityInsightExample?.metrics?.digitalSalesRatio || 'বিক্রির মোট ডিজিটাল অনুপাত আপডেট করে।'}</Text>
              <Text style={styles.cardLine}>{activityInsightExample?.metrics?.featureUsage || 'ফিচার ব্যবহারের সংখ্যা বাড়ে।'}</Text>
              <Text style={styles.cardLine}>{activityInsightExample?.insight || 'গ্রহণযোগ্যতার সংকেত কার্যকর অন্তর্দৃষ্টিতে রূপান্তরিত হয়।'}</Text>
            </AppCard>
          </>
        )}

        {/* ── Footer ──────────────────────────────────────── */}
        <View style={styles.footer}>
          <View style={styles.footerItem}>
            <MaterialIcons name="groups" size={14} color={UI_COLORS.textMuted} />
            <Text style={styles.footerText}>{summary.totalCustomers} কাস্টমার</Text>
          </View>
          <Text style={styles.footerDot}>·</Text>
          <View style={styles.footerItem}>
            <MaterialIcons name="inventory-2" size={14} color={UI_COLORS.textMuted} />
            <Text style={styles.footerText}>{summary.totalProducts} পণ্য</Text>
          </View>
          <Text style={styles.footerDot}>·</Text>
          <View style={styles.footerItem}>
            <MaterialIcons
              name={isOnline ? 'cloud-done' : 'cloud-off'}
              size={14}
              color={isOnline ? UI_COLORS.textSuccess : UI_COLORS.textMuted}
            />
            <Text style={[styles.footerText, isOnline && { color: UI_COLORS.textSuccess }]}>
               {isOnline ? t('dashboard.connected') : t('dashboard.offline')}
            </Text>
          </View>
        </View>

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

  /* footer */
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  footerItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footerText: { fontSize: 12, color: UI_COLORS.textMuted },
  footerDot: { fontSize: 12, color: UI_COLORS.textMuted },

  statusText: { ...TYPOGRAPHY.small, color: UI_COLORS.textMuted, textAlign: 'center' },
  errorText: { ...TYPOGRAPHY.small, color: UI_COLORS.danger, textAlign: 'center' },
});
