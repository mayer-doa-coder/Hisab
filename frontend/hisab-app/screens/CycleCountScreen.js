import { Picker } from '@react-native-picker/picker';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton, AppCard, AppInput } from '../components/ui';
import { UI_COLORS } from '../constants/ui-theme';
import { useAppData } from '../context/AppDataContext';

export default function CycleCountScreen() {
  const {
    products,
    getCycleCounts,
    recordCycleCount,
    validateInventoryBatchConsistency,
    refreshAll,
    refreshing,
  } = useAppData();

  const [selectedProductId, setSelectedProductId] = useState('');
  const [physicalQuantity, setPhysicalQuantity] = useState('');
  const [note, setNote] = useState('');
  const [rows, setRows] = useState([]);
  const [consistency, setConsistency] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!products.length) {
      setSelectedProductId('');
      return;
    }

    if (!selectedProductId || !products.some((row) => Number(row.id) === Number(selectedProductId))) {
      setSelectedProductId(String(products[0].id));
    }
  }, [products, selectedProductId]);

  const load = useCallback(async () => {
    const productId = Number(selectedProductId);
    setLoading(true);
    try {
      const [historyRows, consistencyResult] = await Promise.all([
        getCycleCounts({ productId: Number.isInteger(productId) && productId > 0 ? productId : null, limit: 120 }),
        validateInventoryBatchConsistency({ productId: Number.isInteger(productId) && productId > 0 ? productId : null }),
      ]);

      setRows(historyRows || []);
      setConsistency(consistencyResult || null);
    } finally {
      setLoading(false);
    }
  }, [getCycleCounts, selectedProductId, validateInventoryBatchConsistency]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async () => {
    const productId = Number(selectedProductId);
    const physical = Number(physicalQuantity);

    if (!Number.isInteger(productId) || productId <= 0) {
      Alert.alert('প্রয়োজনীয়', 'Select a product first.');
      return;
    }

    if (!Number.isInteger(physical) || physical < 0) {
      Alert.alert('অবৈধ', 'Physical quantity must be a non-negative integer.');
      return;
    }

    if (saving) {
      return;
    }

    try {
      setSaving(true);
      const result = await recordCycleCount({
        productId,
        physicalQuantity: physical,
        note: note || null,
      });

      setPhysicalQuantity('');
      setNote('');
      await load();

      Alert.alert(
        'Cycle Count Saved',
        `System: ${result.system_quantity} | Physical: ${result.physical_quantity} | Variance: ${result.variance}`
      );
    } catch (error) {
      Alert.alert('ব্যর্থ', error?.message || 'Unable to save cycle count.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={rows}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.container}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>চক্র গণনা</Text>
            <Text style={styles.subtitle}>ভৌত গণনা রেকর্ড করুন এবং স্বয়ংক্রিয়ভাবে সমন্বয় হবে।</Text>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>নতুন গণনা</Text>

              <View style={styles.pickerWrap}>
                <Picker selectedValue={selectedProductId} onValueChange={(value) => setSelectedProductId(String(value))}>
                  {products.map((row) => (
                    <Picker.Item key={`cycle-product-${row.id}`} label={String(row.name || '')} value={String(row.id)} />
                  ))}
                </Picker>
              </View>

              <AppInput
                value={physicalQuantity}
                onChangeText={setPhysicalQuantity}
                keyboardType="number-pad"
                placeholder="বাস্তব পরিমাণ"
              />

              <AppInput value={note} onChangeText={setNote} placeholder="নোট (ঐচ্ছিক)" />

              <View style={styles.buttonRow}>
                <AppButton title={saving ? 'Saving...' : 'Record Count'} onPress={handleSubmit} disabled={saving} style={styles.buttonFlex} />
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

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>ব্যাচ সামঞ্জস্য</Text>
              <Text style={styles.metaText}>Status: {consistency?.is_consistent ? 'CONSISTENT' : 'MISMATCH'}</Text>
              {!consistency?.is_consistent && Array.isArray(consistency?.mismatches) ? (
                consistency.mismatches.map((row) => (
                  <Text key={`cycle-mismatch-${row.product_id}`} style={styles.metaText}>
                    Product #{row.product_id}: product={row.product_quantity}, batch={row.batch_quantity}
                  </Text>
                ))
              ) : null}
            </AppCard>

            <Text style={styles.sectionTitle}>সাম্প্রতিক চক্র গণনা</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.emptyText}>{loading ? 'Loading...' : 'No cycle count records yet.'}</Text>}
        renderItem={({ item }) => (
          <AppCard style={styles.rowCard}>
            <Text style={styles.rowTitle}>{item.product_name}</Text>
            <Text style={styles.rowMeta}>System: {item.system_quantity} | Physical: {item.physical_quantity}</Text>
            <Text style={styles.rowMeta}>Variance: {item.variance}</Text>
            <Text style={styles.rowMeta}>At: {item.timestamp || 'N/A'}</Text>
            <Text style={styles.rowMeta}>{item.note || 'No note'}</Text>
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
  rowCard: { gap: 4 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: UI_COLORS.textPrimary },
  rowMeta: { fontSize: 13, color: UI_COLORS.textSecondary },
});
