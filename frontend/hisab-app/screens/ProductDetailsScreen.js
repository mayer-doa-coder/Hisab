import { Picker } from '@react-native-picker/picker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UI_COLORS } from '../constants/ui-theme';
import { useAppData } from '../context/AppDataContext';

const formatDateSafe = (dateString) => {
  if (!dateString) {
    return 'N/A';
  }

  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) {
    return 'Invalid date';
  }

  return parsed.toISOString().slice(0, 10);
};

const formatDateTime = (dateString) => {
  if (!dateString) {
    return 'N/A';
  }

  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) {
    return 'Invalid date';
  }

  return parsed.toISOString().replace('T', ' ').slice(0, 16);
};

export default function ProductDetailsScreen() {
  const { products, getStockMovementHistory, refreshAll, refreshing } = useAppData();

  const [productId, setProductId] = useState('');
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

  const threshold = Number.isFinite(Number(selectedProduct?.low_stock_threshold))
    ? Math.max(0, Math.trunc(Number(selectedProduct?.low_stock_threshold)))
    : 5;
  const quantity = Number(selectedProduct?.quantity || 0);
  const isLowStock = quantity <= threshold;

  const loadHistory = useCallback(async (nextProductId) => {
    if (!nextProductId) {
      setHistoryRows([]);
      return;
    }

    try {
      setLoadingHistory(true);
      const rows = await getStockMovementHistory({ productId: Number(nextProductId), limit: 30 });
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

  const handleRefresh = async () => {
    await refreshAll();
    await loadHistory(productId);
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
            <View>
              <Text style={styles.title}>Product Details</Text>
              <Text style={styles.subtitle}>Inspect product status, thresholds, expiry, and movement timeline.</Text>

              {products.length === 0 ? (
                <Text style={styles.emptyText}>No products available.</Text>
              ) : (
                <>
                  <Text style={styles.label}>Select Product</Text>
                  <View style={styles.pickerWrap}>
                    <Picker selectedValue={productId} onValueChange={(value) => setProductId(String(value))}>
                      {products.map((item) => (
                        <Picker.Item
                          key={`details-product-${item.id}`}
                          label={`${item.name} (Qty: ${item.quantity})`}
                          value={String(item.id)}
                        />
                      ))}
                    </Picker>
                  </View>

                  {selectedProduct ? (
                    <View style={styles.summaryCard}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.rowTitle}>{selectedProduct.name}</Text>
                        {isLowStock ? <Text style={styles.lowStockBadge}>Low Stock</Text> : null}
                      </View>
                      <Text style={styles.meta}>Product ID: {selectedProduct.id}</Text>
                      <Text style={styles.meta}>Current Quantity: {quantity}</Text>
                      <Text style={styles.meta}>Low Stock Threshold: {threshold}</Text>
                      <Text style={styles.meta}>Unit Price: ৳{Number(selectedProduct.price || 0).toFixed(2)}</Text>
                      <Text style={styles.meta}>
                        Stock Value: ৳{(Number(selectedProduct.price || 0) * quantity).toFixed(2)}
                      </Text>
                      <Text style={styles.meta}>Expiry Date: {formatDateSafe(selectedProduct.expiry_date)}</Text>
                    </View>
                  ) : null}

                  <View style={styles.headerRow}>
                    <Text style={styles.sectionTitle}>Recent Movements</Text>
                    <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh}>
                      <Text style={styles.refreshText}>{refreshing || loadingHistory ? 'Refreshing...' : 'Refresh'}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>{loadingHistory ? 'Loading movement history...' : 'No movement found.'}</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>{item.movement_type.toUpperCase()}</Text>
                <Text style={styles.cardMeta}>{formatDateTime(item.created_at)}</Text>
              </View>
              <Text style={styles.cardMeta}>Delta: {item.quantity_delta > 0 ? '+' : ''}{item.quantity_delta}</Text>
              <Text style={styles.cardMeta}>Before: {item.quantity_before} | After: {item.quantity_after}</Text>
              {item.note ? <Text style={styles.cardMeta}>Note: {item.note}</Text> : null}
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
  title: { fontSize: 26, fontWeight: '700', color: UI_COLORS.textPrimary },
  subtitle: { marginTop: 4, fontSize: 13, color: UI_COLORS.textSecondary, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', color: UI_COLORS.textPrimary },
  pickerWrap: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    backgroundColor: UI_COLORS.surface,
    overflow: 'hidden',
    marginTop: 6,
  },
  summaryCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    padding: 12,
    backgroundColor: UI_COLORS.surface,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  rowTitle: { fontSize: 16, fontWeight: '700', color: UI_COLORS.textPrimary },
  lowStockBadge: {
    fontSize: 10,
    color: UI_COLORS.textWarning,
    backgroundColor: UI_COLORS.surfaceWarning,
    borderWidth: 1,
    borderColor: UI_COLORS.borderWarning,
    borderRadius: 99,
    paddingHorizontal: 7,
    paddingVertical: 3,
    fontWeight: '700',
  },
  meta: { marginTop: 4, fontSize: 13, color: UI_COLORS.textSecondary },
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
  card: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    padding: 12,
    backgroundColor: UI_COLORS.surface,
    marginBottom: 10,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: UI_COLORS.textPrimary },
  cardMeta: { marginTop: 4, fontSize: 13, color: UI_COLORS.textSecondary },
  emptyText: { fontSize: 14, color: UI_COLORS.textMuted },
});
