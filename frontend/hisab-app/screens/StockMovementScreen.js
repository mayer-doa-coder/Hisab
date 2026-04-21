import { Picker } from '@react-native-picker/picker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UI_COLORS } from '../constants/ui-theme';
import { useAppData } from '../context/AppDataContext';

const MOVEMENT_OPTIONS = [
  { label: 'Stock In (+)', value: 'in' },
  { label: 'Stock Out (-)', value: 'out' },
  { label: 'Adjust (+/-)', value: 'adjust' },
];

const STOCK_OUT_REASON_OPTIONS = [
  { label: 'Damage', value: 'DAMAGE' },
  { label: 'Expiry', value: 'EXPIRY' },
  { label: 'Adjustment', value: 'ADJUSTMENT' },
];

const formatDateTime = (value) => {
  if (!value) {
    return 'N/A';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Invalid date';
  }

  return parsed.toISOString().replace('T', ' ').slice(0, 16);
};

const deltaPrefix = (delta) => {
  if (delta > 0) {
    return '+';
  }

  return '';
};

export default function StockMovementScreen() {
  const { products, addStockMovement, getStockMovementHistory, refreshAll, refreshing } = useAppData();

  const [productId, setProductId] = useState('');
  const [movementType, setMovementType] = useState('in');
  const [stockOutReason, setStockOutReason] = useState('DAMAGE');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyRows, setHistoryRows] = useState([]);

  useEffect(() => {
    if (!products.length) {
      setProductId('');
      setHistoryRows([]);
      return;
    }

    if (!productId || !products.some((item) => Number(item.id) === Number(productId))) {
      setProductId(String(products[0].id));
    }
  }, [products, productId]);

  const selectedProduct = useMemo(
    () => products.find((item) => Number(item.id) === Number(productId)) || null,
    [products, productId]
  );

  const loadHistory = useCallback(async (nextProductId) => {
    if (!nextProductId) {
      setHistoryRows([]);
      return;
    }

    try {
      setLoadingHistory(true);
      const rows = await getStockMovementHistory({ productId: Number(nextProductId), limit: 50 });
      setHistoryRows(rows);
    } catch (error) {
      Alert.alert('Load Failed', error?.message || 'Unable to load movement history.');
    } finally {
      setLoadingHistory(false);
    }
  }, [getStockMovementHistory]);

  useEffect(() => {
    loadHistory(productId);
  }, [productId, loadHistory]);

  const handleSaveMovement = async () => {
    if (saving) {
      return;
    }

    try {
      setSaving(true);
      await addStockMovement({
        productId: Number(productId),
        movementType,
        quantity: Number(quantity),
        note,
        stockOutReason: movementType === 'out' ? stockOutReason : null,
      });

      setQuantity('');
      setNote('');
      await refreshAll();
      await loadHistory(productId);
      Alert.alert('Success', 'Stock movement recorded.');
    } catch (error) {
      Alert.alert('Save Failed', error?.message || 'Unable to save stock movement.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <FlatList
          data={historyRows}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={styles.formWrap}>
              <Text style={styles.title}>Stock Movement</Text>
              <Text style={styles.subtitle}>Record every inventory change with before/after quantity history.</Text>

              {products.length === 0 ? (
                <Text style={styles.emptyText}>No products available. Add a product first.</Text>
              ) : (
                <>
                  <Text style={styles.label}>Product *</Text>
                  <View style={styles.pickerWrap}>
                    <Picker selectedValue={productId} onValueChange={(value) => setProductId(String(value))}>
                      {products.map((item) => (
                        <Picker.Item
                          key={`movement-product-${item.id}`}
                          label={`${item.name} (Qty: ${item.quantity})`}
                          value={String(item.id)}
                        />
                      ))}
                    </Picker>
                  </View>

                  <Text style={styles.label}>Movement Type *</Text>
                  <View style={styles.pickerWrap}>
                    <Picker selectedValue={movementType} onValueChange={(value) => setMovementType(String(value))}>
                      {MOVEMENT_OPTIONS.map((option) => (
                        <Picker.Item key={option.value} label={option.label} value={option.value} />
                      ))}
                    </Picker>
                  </View>

                  {movementType === 'out' ? (
                    <>
                      <Text style={styles.label}>Stock-Out Reason *</Text>
                      <View style={styles.pickerWrap}>
                        <Picker selectedValue={stockOutReason} onValueChange={(value) => setStockOutReason(String(value))}>
                          {STOCK_OUT_REASON_OPTIONS.map((option) => (
                            <Picker.Item key={option.value} label={option.label} value={option.value} />
                          ))}
                        </Picker>
                      </View>
                      <Text style={styles.reasonHint}>Sales stock-out is recorded from Sales flow, not manual movement.</Text>
                    </>
                  ) : null}

                  <Text style={styles.label}>Quantity *</Text>
                  <TextInput
                    value={quantity}
                    onChangeText={setQuantity}
                    placeholder="Enter quantity"
                    style={styles.input}
                    keyboardType="numeric"
                  />

                  <Text style={styles.label}>Note</Text>
                  <TextInput
                    value={note}
                    onChangeText={setNote}
                    placeholder="Reason for movement"
                    style={[styles.input, styles.noteInput]}
                    multiline
                  />

                  {selectedProduct ? (
                    <View style={styles.stockHintCard}>
                      <Text style={styles.stockHintText}>Current Quantity: {selectedProduct.quantity}</Text>
                    </View>
                  ) : null}

                  <TouchableOpacity
                    style={[styles.button, (saving || refreshing) && styles.buttonDisabled]}
                    onPress={handleSaveMovement}
                    disabled={saving || refreshing || !productId}
                  >
                    <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Save Movement'}</Text>
                  </TouchableOpacity>
                </>
              )}

              <View style={styles.headerRow}>
                <Text style={styles.sectionTitle}>Movement History</Text>
                <TouchableOpacity style={styles.refreshButton} onPress={() => loadHistory(productId)}>
                  <Text style={styles.refreshText}>{loadingHistory ? 'Loading...' : 'Reload'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>{loadingHistory ? 'Loading movement history...' : 'No movement found.'}</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTopRow}>
                <Text style={styles.rowTitle}>{item.product_name}</Text>
                <Text style={styles.badge}>{item.movement_type.toUpperCase()}</Text>
              </View>
              <Text style={styles.meta}>Delta: {deltaPrefix(Number(item.quantity_delta))}{item.quantity_delta}</Text>
              {item.stock_out_reason ? <Text style={styles.meta}>Reason: {item.stock_out_reason}</Text> : null}
              {item.receipt_id ? <Text style={styles.meta}>Receipt: {item.receipt_id}</Text> : null}
              <Text style={styles.meta}>Before: {item.quantity_before} | After: {item.quantity_after}</Text>
              <Text style={styles.meta}>Date: {formatDateTime(item.created_at)}</Text>
              {item.note ? <Text style={styles.meta}>Note: {item.note}</Text> : null}
            </View>
          )}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: UI_COLORS.background },
  flex: { flex: 1 },
  container: { padding: 16, gap: 12 },
  formWrap: { gap: 8 },
  title: { fontSize: 26, fontWeight: '700', color: UI_COLORS.textPrimary },
  subtitle: { marginTop: 4, fontSize: 13, color: UI_COLORS.textSecondary, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', color: UI_COLORS.textPrimary },
  pickerWrap: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    backgroundColor: UI_COLORS.surface,
    overflow: 'hidden',
  },
  input: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: UI_COLORS.textPrimary,
    backgroundColor: UI_COLORS.surface,
  },
  noteInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  stockHintCard: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 8,
    backgroundColor: UI_COLORS.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  stockHintText: {
    color: UI_COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  reasonHint: {
    marginTop: 4,
    color: UI_COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  button: {
    marginTop: 8,
    backgroundColor: UI_COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: UI_COLORS.textOnPrimary, fontSize: 15, fontWeight: '700' },
  headerRow: {
    marginTop: 16,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: { fontSize: 19, fontWeight: '700', color: UI_COLORS.textPrimary },
  refreshButton: {
    backgroundColor: UI_COLORS.surfaceSubtle,
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  refreshText: { color: UI_COLORS.primary, fontSize: 12, fontWeight: '600' },
  emptyText: { fontSize: 14, color: UI_COLORS.textMuted },
  card: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    padding: 12,
    backgroundColor: UI_COLORS.surface,
    marginBottom: 10,
  },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowTitle: { fontSize: 16, fontWeight: '700', color: UI_COLORS.textPrimary },
  badge: {
    fontSize: 11,
    color: UI_COLORS.primary,
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: UI_COLORS.surfaceSubtle,
    fontWeight: '700',
  },
  meta: { marginTop: 4, fontSize: 13, color: UI_COLORS.textSecondary },
});
