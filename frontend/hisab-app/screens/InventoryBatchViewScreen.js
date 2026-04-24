import { Picker } from '@react-native-picker/picker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton, AppCard } from '../components/ui';
import { UI_COLORS } from '../constants/ui-theme';
import { useAppData } from '../context/AppDataContext';

const formatMoney = (value) => `৳${Number(value || 0).toFixed(2)}`;

export default function InventoryBatchViewScreen() {
  const {
    products,
    getInventoryBatches,
    selectBatchForSale,
    validateInventoryBatchConsistency,
    refreshAll,
    refreshing,
  } = useAppData();

  const [selectedProductId, setSelectedProductId] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nextBatch, setNextBatch] = useState(null);
  const [consistency, setConsistency] = useState(null);

  useEffect(() => {
    if (!products.length) {
      setSelectedProductId('');
      return;
    }

    if (!selectedProductId || !products.some((row) => Number(row.id) === Number(selectedProductId))) {
      setSelectedProductId(String(products[0].id));
    }
  }, [products, selectedProductId]);

  const selectedProductName = useMemo(() => {
    const row = products.find((item) => Number(item.id) === Number(selectedProductId));
    return row ? String(row.name || '') : '';
  }, [products, selectedProductId]);

  const load = useCallback(async () => {
    const productId = Number(selectedProductId);
    if (!Number.isInteger(productId) || productId <= 0) {
      setRows([]);
      setNextBatch(null);
      setConsistency(null);
      return;
    }

    setLoading(true);
    try {
      const [batchRows, batchCandidate, consistencyResult] = await Promise.all([
        getInventoryBatches({ productId, includeDepleted: true, limit: 400 }),
        selectBatchForSale({ productId }),
        validateInventoryBatchConsistency({ productId }),
      ]);

      setRows(batchRows || []);
      setNextBatch(batchCandidate || null);
      setConsistency(consistencyResult || null);
    } finally {
      setLoading(false);
    }
  }, [getInventoryBatches, selectBatchForSale, selectedProductId, validateInventoryBatchConsistency]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={rows}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.container}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>ইনভেন্টরি ব্যাচ</Text>
            <Text style={styles.subtitle}>FEFO-ready lot visibility with per-batch quantity tracking.</Text>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>পণ্য</Text>
              <View style={styles.pickerWrap}>
                <Picker selectedValue={selectedProductId} onValueChange={(value) => setSelectedProductId(String(value))}>
                  {products.map((row) => (
                    <Picker.Item key={`batch-product-${row.id}`} label={String(row.name || '')} value={String(row.id)} />
                  ))}
                </Picker>
              </View>

              <View style={styles.buttonRow}>
                <AppButton title={loading ? 'লোড হচ্ছে...' : 'Load Batches'} onPress={load} style={styles.buttonFlex} />
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
            </AppCard>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>FEFO Selection</Text>
              <Text style={styles.metaText}>Product: {selectedProductName || 'N/A'}</Text>
              {nextBatch ? (
                <>
                  <Text style={styles.metaText}>Next Batch: {nextBatch.batch_number || 'Unnumbered'}</Text>
                  <Text style={styles.metaText}>Qty: {nextBatch.quantity}</Text>
                  <Text style={styles.metaText}>Expiry: {nextBatch.expiry_date || 'No expiry'}</Text>
                </>
              ) : (
                <Text style={styles.metaText}>বিক্রির জন্য কোনো ব্যাচ নেই।</Text>
              )}
            </AppCard>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>সামঞ্জস্য</Text>
              <Text style={styles.metaText}>
                Status: {consistency?.is_consistent ? 'CONSISTENT' : 'MISMATCH'}
              </Text>
              {!consistency?.is_consistent && Array.isArray(consistency?.mismatches) ? (
                consistency.mismatches.map((row) => (
                  <Text key={`mismatch-${row.product_id}`} style={styles.metaText}>
                    Product #{row.product_id}: product={row.product_quantity} vs batch={row.batch_quantity}
                  </Text>
                ))
              ) : null}
            </AppCard>

            <Text style={styles.sectionTitle}>ব্যাচ তালিকা</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.emptyText}>{loading ? 'লোড হচ্ছে...' : 'No batches found.'}</Text>}
        renderItem={({ item }) => (
          <AppCard style={styles.rowCard}>
            <Text style={styles.rowTitle}>{item.batch_number || 'Unnumbered Batch'}</Text>
            <Text style={styles.rowMeta}>{item.product_name}</Text>
            <Text style={styles.rowMeta}>Qty: {item.quantity}</Text>
            <Text style={styles.rowMeta}>Expiry: {item.expiry_date || 'No expiry'}</Text>
            <Text style={styles.rowMeta}>Purchase Date: {item.purchase_date || 'N/A'}</Text>
            <Text style={styles.rowMeta}>Cost: {formatMoney(item.cost_price)}</Text>
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
