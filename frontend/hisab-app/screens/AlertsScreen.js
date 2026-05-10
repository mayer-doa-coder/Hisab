import { useCallback, useEffect, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton, AppCard } from '../components/ui';
import { UI_COLORS } from '../constants/ui-theme';
import { useAppData } from '../context/AppDataContext';

const ALERT_TYPES = [
  { label: 'সব', value: '' },
  { label: 'কম স্টক', value: 'LOW_STOCK' },
  { label: 'মেয়াদ', value: 'EXPIRY' },
  { label: 'বেশি স্টক', value: 'OVERSTOCK' },
  { label: 'ডেড স্টক', value: 'DEAD_STOCK' },
];

const SEVERITY_OPTIONS = [
  { label: 'সব', value: '' },
  { label: 'জরুরি', value: 'critical' },
  { label: 'বেশি', value: 'high' },
  { label: 'মাঝারি', value: 'medium' },
  { label: 'কম', value: 'low' },
];

const ALERT_TYPE_BN = {
  LOW_STOCK: 'কম স্টক',
  EXPIRY: 'মেয়াদ শেষ',
  OVERSTOCK: 'বেশি স্টক',
  DEAD_STOCK: 'ডেড স্টক',
};

const SEVERITY_BN = {
  critical: 'জরুরি',
  high: 'বেশি',
  medium: 'মাঝারি',
  low: 'কম',
};

const formatNumber = (value, digits = 2) => Number(value || 0).toFixed(digits);

function ChipRow({ options, selected, onSelect }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.value === '' ? '__all__' : opt.value}
          style={[styles.chip, selected === opt.value && styles.chipActive]}
          onPress={() => onSelect(opt.value)}
          activeOpacity={0.78}
        >
          <Text style={[styles.chipText, selected === opt.value && styles.chipTextActive]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

export default function AlertsScreen() {
  const {
    getInventoryAlerts,
    refreshInventoryAlerts,
    getInventoryHealthInsights,
    getDeadStockProducts,
    refreshAll,
    refreshing,
  } = useAppData();

  const [alertType, setAlertType] = useState('');
  const [severity, setSeverity] = useState('');
  const [alerts, setAlerts] = useState([]);
  const [health, setHealth] = useState({ summary: {}, rows: [] });
  const [deadStockRows, setDeadStockRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [alertRows, healthResult, deadRows] = await Promise.all([
        getInventoryAlerts({ alertType: alertType || null, severity: severity || null, activeOnly: true, limit: 300 }),
        getInventoryHealthInsights({ lookbackDays: 30, expiryAlertDays: 7, deadStockDays: 60 }),
        getDeadStockProducts({ thresholdDays: 60, limit: 120 }),
      ]);
      setAlerts(alertRows || []);
      setHealth(healthResult || { summary: {}, rows: [] });
      setDeadStockRows(deadRows || []);
    } finally {
      setLoading(false);
    }
  }, [alertType, getDeadStockProducts, getInventoryAlerts, getInventoryHealthInsights, severity]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={alerts}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.container}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>স্টক সতর্কতা</Text>
            <Text style={styles.subtitle}>কম স্টক, মেয়াদ, অতিরিক্ত ও ডেড স্টক।</Text>

            <AppCard style={styles.filterCard}>
              <Text style={styles.filterLabel}>ধরন</Text>
              <ChipRow options={ALERT_TYPES} selected={alertType} onSelect={setAlertType} />

              <Text style={[styles.filterLabel, styles.filterLabelGap]}>তীব্রতা</Text>
              <ChipRow options={SEVERITY_OPTIONS} selected={severity} onSelect={setSeverity} />

              <View style={styles.actionRow}>
                <AppButton
                  title={loading ? 'লোড হচ্ছে...' : 'প্রয়োগ করুন'}
                  onPress={load}
                  style={styles.actionBtn}
                />
                <AppButton
                  title={refreshing ? 'রিফ্রেশ হচ্ছে...' : 'রিফ্রেশ'}
                  variant="secondary"
                  style={styles.actionBtn}
                  onPress={async () => { await refreshAll(); await load(); }}
                />
              </View>
              <AppButton
                title="সতর্কতা পুনরায় তৈরি করুন"
                variant="secondary"
                onPress={async () => {
                  await refreshInventoryAlerts({ expiryAlertDays: 7, deadStockDays: 60 });
                  await load();
                }}
              />
            </AppCard>

            <AppCard style={styles.summaryCard}>
              <Text style={styles.sectionTitle}>স্টকের অবস্থা</Text>
              <View style={styles.summaryGrid}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{Number(health?.summary?.products || 0)}</Text>
                  <Text style={styles.summaryLabel}>পণ্য</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, styles.summaryDanger]}>
                    {Number(health?.summary?.low_stock_count || 0)}
                  </Text>
                  <Text style={styles.summaryLabel}>কম স্টক</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, styles.summaryWarn]}>
                    {Number(health?.summary?.dead_stock_count || 0)}
                  </Text>
                  <Text style={styles.summaryLabel}>ডেড স্টক</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>
                    {Number(health?.summary?.overstock_count || 0)}
                  </Text>
                  <Text style={styles.summaryLabel}>বেশি স্টক</Text>
                </View>
              </View>
              <Text style={styles.summaryMeta}>
                গড় মেয়াদ ঝুঁকি: {formatNumber(health?.summary?.average_expiry_risk_score || 0)}%
              </Text>
            </AppCard>

            {deadStockRows.length > 0 ? (
              <AppCard style={styles.deadCard}>
                <Text style={styles.sectionTitle}>ডেড স্টক ({deadStockRows.length})</Text>
                {deadStockRows.slice(0, 6).map((row) => (
                  <View key={`dead-${row.id}`} style={styles.deadRow}>
                    <Text style={styles.deadName}>{row.name}</Text>
                    <Text style={styles.deadMeta}>
                      {row.quantity} পিস · {row.last_sale_date ? `শেষ বিক্রি: ${row.last_sale_date}` : 'বিক্রি হয়নি'}
                    </Text>
                  </View>
                ))}
              </AppCard>
            ) : null}

            <Text style={styles.sectionTitle}>সক্রিয় সতর্কতা</Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {loading ? 'লোড হচ্ছে...' : 'কোনো সক্রিয় সতর্কতা নেই।'}
          </Text>
        }
        renderItem={({ item }) => (
          <AppCard style={styles.alertCard}>
            <View style={styles.alertHeader}>
              <Text style={styles.alertType}>
                {ALERT_TYPE_BN[item.alert_type] || item.alert_type}
              </Text>
              <Text style={[
                styles.alertSeverity,
                item.severity === 'critical' && styles.severityCritical,
                item.severity === 'high' && styles.severityHigh,
              ]}>
                {SEVERITY_BN[item.severity] || item.severity}
              </Text>
            </View>
            <Text style={styles.alertProduct}>{item.product_name}</Text>
            <Text style={styles.alertMessage}>{item.message}</Text>
          </AppCard>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: UI_COLORS.background },
  container: { padding: 16, gap: 12, paddingBottom: 24 },
  header: { gap: 4 },
  title: { fontSize: 26, fontWeight: '700', color: UI_COLORS.textPrimary },
  subtitle: { fontSize: 13, color: UI_COLORS.textSecondary, marginBottom: 4 },

  filterCard: { gap: 10, marginTop: 8 },
  filterLabel: { fontSize: 12, fontWeight: '700', color: UI_COLORS.textSecondary },
  filterLabelGap: { marginTop: 4 },
  chipScroll: { gap: 8, paddingVertical: 2 },
  chip: {
    borderRadius: 99,
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
    backgroundColor: UI_COLORS.surfaceSubtle,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: UI_COLORS.primary, borderColor: UI_COLORS.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: UI_COLORS.textSecondary },
  chipTextActive: { color: UI_COLORS.textOnPrimary },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1 },

  summaryCard: { gap: 10, marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: UI_COLORS.textPrimary },
  summaryGrid: { flexDirection: 'row', gap: 0 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 22, fontWeight: '800', color: UI_COLORS.textPrimary },
  summaryDanger: { color: UI_COLORS.textDanger },
  summaryWarn: { color: UI_COLORS.textWarning },
  summaryLabel: { fontSize: 11, color: UI_COLORS.textMuted, fontWeight: '600', marginTop: 2 },
  summaryMeta: { fontSize: 12, color: UI_COLORS.textSecondary },

  deadCard: { gap: 8, marginTop: 4 },
  deadRow: { gap: 2 },
  deadName: { fontSize: 13, fontWeight: '700', color: UI_COLORS.textPrimary },
  deadMeta: { fontSize: 12, color: UI_COLORS.textSecondary },

  emptyText: { fontSize: 14, color: UI_COLORS.textMuted, textAlign: 'center', paddingVertical: 24 },

  alertCard: { gap: 4 },
  alertHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  alertType: { fontSize: 13, fontWeight: '700', color: UI_COLORS.primary },
  alertSeverity: { fontSize: 12, fontWeight: '700', color: UI_COLORS.textSecondary },
  severityCritical: { color: UI_COLORS.textDanger },
  severityHigh: { color: UI_COLORS.textWarning },
  alertProduct: { fontSize: 14, fontWeight: '600', color: UI_COLORS.textPrimary },
  alertMessage: { fontSize: 13, color: UI_COLORS.textSecondary },
});
