import { Picker } from '@react-native-picker/picker';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton, AppCard, AppInput } from '../components/ui';
import { UI_COLORS } from '../constants/ui-theme';
import { useAppData } from '../context/AppDataContext';

const formatMoney = (value) => `৳${Number(value || 0).toFixed(2)}`;

const ENTRY_TYPES = [
  { label: 'All', value: '' },
  { label: 'IN', value: 'IN' },
  { label: 'OUT', value: 'OUT' },
];

export default function CashbookScreen() {
  const {
    getCashbookEntries,
    getCashflowSummary,
    refreshAll,
    refreshing,
  } = useAppData();

  const [entryType, setEntryType] = useState('');
  const [days, setDays] = useState('30');
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const daysValue = Number(days);
    const normalizedDays = Number.isInteger(daysValue) && daysValue > 0 ? daysValue : 30;

    setLoading(true);
    try {
      const [nextEntries, nextSummary] = await Promise.all([
        getCashbookEntries({ entryType: entryType || null, limit: 250 }),
        getCashflowSummary({ days: normalizedDays }),
      ]);

      setEntries(nextEntries || []);
      setSummary(nextSummary || null);
    } finally {
      setLoading(false);
    }
  }, [days, entryType, getCashbookEntries, getCashflowSummary]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={entries}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.container}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>Cashbook</Text>
            <Text style={styles.subtitle}>Unified cash journal from sales, payments, and expenses.</Text>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>Filters</Text>

              <View style={styles.row}>
                <View style={styles.flexItem}>
                  <Text style={styles.label}>Entry Type</Text>
                  <View style={styles.pickerWrap}>
                    <Picker selectedValue={entryType} onValueChange={(value) => setEntryType(String(value))}>
                      {ENTRY_TYPES.map((option) => (
                        <Picker.Item key={`entry-type-${option.value || 'all'}`} label={option.label} value={option.value} />
                      ))}
                    </Picker>
                  </View>
                </View>

                <View style={styles.flexItem}>
                  <Text style={styles.label}>Summary Window (days)</Text>
                  <AppInput value={days} onChangeText={setDays} keyboardType="number-pad" placeholder="30" />
                </View>
              </View>

              <View style={styles.buttonRow}>
                <AppButton title={loading ? 'Loading...' : 'Apply'} onPress={load} style={styles.buttonFlex} />
                <AppButton
                  title={refreshing ? 'Refreshing...' : 'Refresh'}
                  variant="secondary"
                  style={styles.buttonFlex}
                  onPress={async () => {
                    await refreshAll();
                    await load();
                  }}
                />
              </View>
            </AppCard>

            {summary ? (
              <AppCard style={styles.card}>
                <Text style={styles.sectionTitle}>Cashflow Summary</Text>
                <Text style={styles.meta}>Inflow: {formatMoney(summary.total_in)}</Text>
                <Text style={styles.meta}>Outflow: {formatMoney(summary.total_out)}</Text>
                <Text style={styles.meta}>Net: {formatMoney(summary.net_cashflow)}</Text>
              </AppCard>
            ) : null}

            <Text style={styles.sectionTitle}>Journal Entries</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.emptyText}>{loading ? 'Loading...' : 'No cashbook entries found.'}</Text>}
        renderItem={({ item }) => (
          <AppCard style={styles.rowCard}>
            <View style={styles.rowHeader}>
              <Text style={styles.rowType}>{item.entry_type}</Text>
              <Text style={item.entry_type === 'IN' ? styles.amountIn : styles.amountOut}>{formatMoney(item.amount)}</Text>
            </View>
            <Text style={styles.meta}>{item.category || 'GENERAL'}{item.payment_method ? ` | ${item.payment_method}` : ''}</Text>
            <Text style={styles.meta}>{item.note || 'No note'}</Text>
            <Text style={styles.meta}>{item.occurred_at || 'N/A'}</Text>
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
  row: { flexDirection: 'row', gap: 10 },
  flexItem: { flex: 1 },
  pickerWrap: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    backgroundColor: UI_COLORS.surface,
    overflow: 'hidden',
  },
  buttonRow: { flexDirection: 'row', gap: 10 },
  buttonFlex: { flex: 1 },
  meta: { fontSize: 13, color: UI_COLORS.textSecondary },
  rowCard: { gap: 4 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowType: { fontSize: 13, fontWeight: '700', color: UI_COLORS.textPrimary },
  amountIn: { fontSize: 15, fontWeight: '700', color: UI_COLORS.textSuccess },
  amountOut: { fontSize: 15, fontWeight: '700', color: UI_COLORS.textDanger },
  emptyText: { fontSize: 14, color: UI_COLORS.textMuted },
});
