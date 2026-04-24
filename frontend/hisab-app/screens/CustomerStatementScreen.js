import { Picker } from '@react-native-picker/picker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UI_COLORS } from '../constants/ui-theme';
import { useAppData } from '../context/AppDataContext';

export default function CustomerStatementScreen() {
  const { customers, getCustomerStatementData, exportCustomerStatementCsvData } = useAppData();

  const [customerId, setCustomerId] = useState('');
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!customers.length) {
      setCustomerId('');
      return;
    }

    if (!customerId || !customers.some((row) => Number(row.id) === Number(customerId))) {
      setCustomerId(String(customers[0].id));
    }
  }, [customers, customerId]);

  const loadStatement = useCallback(async () => {
    if (!customerId) {
      setStatement(null);
      return;
    }

    try {
  setLoading(true);
  const next = await getCustomerStatementData({ customerId: Number(customerId) });
  setStatement(next || null);
} catch (error) {
  Alert.alert(
    'লোড ব্যর্থ',
    error?.message || 'কাস্টমার স্টেটমেন্ট লোড করা যায়নি।'
  );
} finally {
  setLoading(false);
}
  }, [customerId, getCustomerStatementData]);

  useEffect(() => {
    loadStatement();
  }, [loadStatement]);

  const summary = useMemo(() => statement?.summary || {}, [statement]);
  const entries = useMemo(() => (Array.isArray(statement?.entries) ? statement.entries : []), [statement]);

  const handleExport = async () => {
    try {
      if (!customerId) {
        throw new Error('Select a customer first.');
      }

      const csv = await exportCustomerStatementCsvData({ customerId: Number(customerId) });
      await Share.share({
        title: 'Customer Statement CSV',
        message: String(csv || ''),
      });
    } catch (error) {
      Alert.alert('এক্সপোর্ট ব্যর্থ', error?.message || 'স্টেটমেন্ট CSV এক্সপোর্ট করা যায়নি।');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>কাস্টমার বিবৃতি</Text>
        <Text style={styles.subtitle}>বিবৃতির সারসংক্ষেপ, এন্ট্রি, রিমাইন্ডার ও প্রতিশ্রুতি।</Text>

        {customers.length > 0 ? (
          <View style={styles.pickerWrap}>
            <Picker selectedValue={customerId} onValueChange={(value) => setCustomerId(String(value))}>
              {customers.map((row) => (
                <Picker.Item
                  key={`statement-customer-${row.id}`}
                  label={`${row.name} (${row.phone || 'No phone'})`}
                  value={String(row.id)}
                />
              ))}
            </Picker>
          </View>
        ) : (
          <Text style={styles.empty}>কোনো কাস্টমার পাওয়া যায়নি।</Text>
        )}

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>মোট বাকি</Text>
            <Text style={styles.summaryValue}>৳{Number(summary.total_credit || 0).toFixed(2)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>মোট পেমেন্ট</Text>
            <Text style={styles.summaryValue}>৳{Number(summary.total_payment || 0).toFixed(2)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>সমাপনী বাকি</Text>
            <Text style={styles.summaryValue}>৳{Number(summary.closing_balance || 0).toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.button} onPress={loadStatement}>
            <Text style={styles.buttonText}>{loading ? 'লোড হচ্ছে...' : 'Reload Statement'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.buttonSecondary} onPress={handleExport}>
            <Text style={styles.buttonSecondaryText}>CSV রপ্তানি</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>খাতার এন্ট্রি</Text>
          {entries.length === 0 ? (
            <Text style={styles.empty}>No statement entries found.</Text>
          ) : (
            entries.map((entry) => (
              <View key={`statement-entry-${entry.id || entry.entry_id}`} style={styles.entryRow}>
                <View>
                  <Text style={styles.entryType}>{String(entry.type || entry.event_type || '').toUpperCase()}</Text>
                  <Text style={styles.entryMeta}>{entry.created_at || ''}</Text>
                  {!!entry.note && <Text style={styles.entryMeta}>{entry.note}</Text>}
                </View>
                <View style={styles.entryRight}>
                  <Text style={styles.entryAmount}>৳{Number(entry.amount || Math.abs(entry.amount_change || 0)).toFixed(2)}</Text>
                  <Text style={styles.entryStatus}>{entry.status || ''}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: UI_COLORS.background },
  container: { padding: 16, gap: 12 },
  title: { fontSize: 26, fontWeight: '700', color: UI_COLORS.textPrimary },
  subtitle: { fontSize: 13, color: UI_COLORS.textSecondary },
  pickerWrap: { borderWidth: 1, borderColor: UI_COLORS.border, borderRadius: 10, overflow: 'hidden', backgroundColor: UI_COLORS.surface },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summaryCard: {
    width: '31%',
    backgroundColor: UI_COLORS.surface,
    borderColor: UI_COLORS.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  summaryLabel: { fontSize: 11, color: UI_COLORS.textSecondary },
  summaryValue: { fontSize: 14, color: UI_COLORS.textPrimary, fontWeight: '700', marginTop: 3 },
  actionsRow: { flexDirection: 'row', gap: 10 },
  button: {
    flex: 1,
    backgroundColor: UI_COLORS.primary,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonText: { color: UI_COLORS.surface, fontWeight: '700', fontSize: 12 },
  buttonSecondary: {
    flex: 1,
    backgroundColor: UI_COLORS.surfaceSubtle,
    borderColor: UI_COLORS.borderSoft,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonSecondaryText: { color: UI_COLORS.primary, fontWeight: '700', fontSize: 12 },
  section: {
    backgroundColor: UI_COLORS.surface,
    borderColor: UI_COLORS.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: UI_COLORS.textPrimary },
  entryRow: {
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
    borderRadius: 8,
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  entryType: { color: UI_COLORS.textPrimary, fontWeight: '700', fontSize: 12 },
  entryMeta: { color: UI_COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  entryRight: { alignItems: 'flex-end', gap: 2 },
  entryAmount: { color: UI_COLORS.textPrimary, fontWeight: '700' },
  entryStatus: { color: UI_COLORS.primary, fontSize: 11, textTransform: 'uppercase' },
  empty: { color: UI_COLORS.textMuted, fontSize: 13 },
});
