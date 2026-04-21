import { Picker } from '@react-native-picker/picker';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton, AppCard } from '../components/ui';
import { UI_COLORS } from '../constants/ui-theme';
import { useAppData } from '../context/AppDataContext';

const ALERT_TYPES = [
  { label: 'All', value: '' },
  { label: 'Low Stock', value: 'LOW_STOCK' },
  { label: 'Expiry', value: 'EXPIRY' },
  { label: 'Overstock', value: 'OVERSTOCK' },
  { label: 'Dead Stock', value: 'DEAD_STOCK' },
];

const SEVERITY_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Critical', value: 'critical' },
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' },
];

const formatNumber = (value, digits = 2) => Number(value || 0).toFixed(digits);

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
          <View>
            <Text style={styles.title}>Inventory Alerts</Text>
            <Text style={styles.subtitle}>Low stock, expiry, overstock, and dead stock warnings with severity.</Text>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>Filters</Text>

              <Text style={styles.label}>Alert Type</Text>
              <View style={styles.pickerWrap}>
                <Picker selectedValue={alertType} onValueChange={(value) => setAlertType(String(value))}>
                  {ALERT_TYPES.map((item) => (
                    <Picker.Item key={`alert-type-${item.value || 'all'}`} label={item.label} value={item.value} />
                  ))}
                </Picker>
              </View>

              <Text style={styles.label}>Severity</Text>
              <View style={styles.pickerWrap}>
                <Picker selectedValue={severity} onValueChange={(value) => setSeverity(String(value))}>
                  {SEVERITY_OPTIONS.map((item) => (
                    <Picker.Item key={`alert-sev-${item.value || 'all'}`} label={item.label} value={item.value} />
                  ))}
                </Picker>
              </View>

              <View style={styles.buttonRow}>
                <AppButton title={loading ? 'Loading...' : 'Apply'} onPress={load} style={styles.buttonFlex} />
                <AppButton
                  title={refreshing ? 'Refreshing...' : 'Refresh All'}
                  variant="secondary"
                  style={styles.buttonFlex}
                  onPress={async () => {
                    await refreshAll();
                    await load();
                  }}
                />
              </View>

              <AppButton
                title="Regenerate Alerts"
                onPress={async () => {
                  await refreshInventoryAlerts({ expiryAlertDays: 7, deadStockDays: 60 });
                  await load();
                }}
                variant="secondary"
              />
            </AppCard>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>Inventory Health</Text>
              <Text style={styles.metaText}>Products: {Number(health?.summary?.products || 0)}</Text>
              <Text style={styles.metaText}>Avg Turnover: {formatNumber(health?.summary?.average_turnover_rate || 0, 4)}</Text>
              <Text style={styles.metaText}>Avg Expiry Risk: {formatNumber(health?.summary?.average_expiry_risk_score || 0)}%</Text>
              <Text style={styles.metaText}>Dead Stock Count: {Number(health?.summary?.dead_stock_count || 0)}</Text>
              <Text style={styles.metaText}>Low Stock Count: {Number(health?.summary?.low_stock_count || 0)}</Text>
              <Text style={styles.metaText}>Overstock Count: {Number(health?.summary?.overstock_count || 0)}</Text>
            </AppCard>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>Dead Stock Snapshot</Text>
              {deadStockRows.length ? (
                deadStockRows.slice(0, 8).map((row) => (
                  <Text key={`dead-${row.id}`} style={styles.metaText}>
                    {row.name} | Qty {row.quantity} | Last sale: {row.last_sale_date || 'Never'}
                  </Text>
                ))
              ) : (
                <Text style={styles.metaText}>No dead stock right now.</Text>
              )}
            </AppCard>

            <Text style={styles.sectionTitle}>Active Alerts</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.emptyText}>{loading ? 'Loading...' : 'No active alerts.'}</Text>}
        renderItem={({ item }) => (
          <AppCard style={styles.rowCard}>
            <View style={styles.rowHeader}>
              <Text style={styles.rowType}>{item.alert_type}</Text>
              <Text style={styles.rowSeverity}>{String(item.severity || '').toUpperCase()}</Text>
            </View>
            <Text style={styles.rowMeta}>{item.product_name}</Text>
            <Text style={styles.rowMessage}>{item.message}</Text>
          </AppCard>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: UI_COLORS.background },
  container: { padding: 18, gap: 12 },
  title: { fontSize: 28, fontWeight: '700', color: UI_COLORS.textPrimary },
  subtitle: { fontSize: 14, color: UI_COLORS.textSecondary, marginBottom: 6 },
  card: { gap: 8, marginTop: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: UI_COLORS.textPrimary, marginTop: 10 },
  label: { fontSize: 13, color: UI_COLORS.textMuted },
  pickerWrap: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    backgroundColor: UI_COLORS.surface,
    overflow: 'hidden',
  },
  buttonRow: { flexDirection: 'row', gap: 10 },
  buttonFlex: { flex: 1 },
  metaText: { fontSize: 13, color: UI_COLORS.textSecondary },
  emptyText: { fontSize: 14, color: UI_COLORS.textMuted },
  rowCard: { gap: 6 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowType: { fontSize: 13, fontWeight: '700', color: UI_COLORS.primary },
  rowSeverity: { fontSize: 12, fontWeight: '700', color: UI_COLORS.textDanger },
  rowMeta: { fontSize: 13, color: UI_COLORS.textSecondary },
  rowMessage: { fontSize: 14, color: UI_COLORS.textPrimary },
});
