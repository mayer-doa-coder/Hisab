import { Picker } from '@react-native-picker/picker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton, AppCard, AppInput } from '../components/ui';
import { UI_COLORS } from '../constants/ui-theme';
import { useAppData } from '../context/AppDataContext';

const formatMoney = (value) => `৳${Number(value || 0).toFixed(2)}`;

export default function PurchaseOrderScreen() {
  const {
    products,
    listSuppliers,
    createPurchaseOrder,
    getPurchaseHistory,
    refreshAll,
    refreshing,
  } = useAppData();

  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState('');
  const [productId, setProductId] = useState('');
  const [orderedQty, setOrderedQty] = useState('1');
  const [unitCost, setUnitCost] = useState('');
  const [orderNote, setOrderNote] = useState('');
  const [paidAmount, setPaidAmount] = useState('0');
  const [cartItems, setCartItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [historyRows, setHistoryRows] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!products.length) {
      setProductId('');
      return;
    }

    if (!productId || !products.some((item) => Number(item.id) === Number(productId))) {
      setProductId(String(products[0].id));
    }
  }, [productId, products]);

  const loadMeta = useCallback(async () => {
    const supplierRows = await listSuppliers({ limit: 300 });
    setSuppliers(supplierRows);
    if (!supplierId && supplierRows.length > 0) {
      setSupplierId(String(supplierRows[0].id));
    }
  }, [listSuppliers, supplierId]);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const rows = await getPurchaseHistory({ limit: 20 });
      setHistoryRows(rows);
    } finally {
      setLoadingHistory(false);
    }
  }, [getPurchaseHistory]);

  useEffect(() => {
    loadMeta();
    loadHistory();
  }, [loadHistory, loadMeta]);

  const orderTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0),
    [cartItems]
  );

  const handleAddItem = () => {
    const normalizedProductId = Number(productId);
    const normalizedQty = Number(orderedQty);
    const product = products.find((item) => Number(item.id) === normalizedProductId);

    if (!product) {
      Alert.alert('Select Product', 'Please select a product first.');
      return;
    }

    if (!Number.isInteger(normalizedQty) || normalizedQty <= 0) {
      Alert.alert('Invalid Quantity', 'Ordered quantity must be a positive integer.');
      return;
    }

    const effectiveUnitCost = unitCost === '' ? Number(product.price || 0) : Number(unitCost);
    if (!Number.isFinite(effectiveUnitCost) || effectiveUnitCost < 0) {
      Alert.alert('Invalid Cost', 'Unit cost must be a valid non-negative number.');
      return;
    }

    setCartItems((prev) => [
      ...prev,
      {
        key: `${product.id}-${Date.now()}-${Math.random()}`,
        product_id: Number(product.id),
        product_name: String(product.name || ''),
        ordered_qty: normalizedQty,
        unit_cost: Number(effectiveUnitCost.toFixed(2)),
        subtotal: Number((normalizedQty * effectiveUnitCost).toFixed(2)),
      },
    ]);

    setOrderedQty('1');
    setUnitCost('');
  };

  const handleRemoveItem = (key) => {
    setCartItems((prev) => prev.filter((item) => item.key !== key));
  };

  const handleCreateOrder = async () => {
    const normalizedSupplierId = Number(supplierId);
    if (!Number.isInteger(normalizedSupplierId) || normalizedSupplierId <= 0) {
      Alert.alert('Required', 'Supplier is required.');
      return;
    }

    if (!cartItems.length) {
      Alert.alert('Empty Order', 'Add at least one item to create a purchase order.');
      return;
    }

    if (saving) {
      return;
    }

    try {
      setSaving(true);
      const result = await createPurchaseOrder({
        supplierId: normalizedSupplierId,
        items: cartItems.map((item) => ({
          productId: Number(item.product_id),
          orderedQty: Number(item.ordered_qty),
          unitCost: Number(item.unit_cost),
        })),
        note: orderNote || null,
        paidAmount: Number(paidAmount || 0),
      });

      setCartItems([]);
      setOrderNote('');
      setPaidAmount('0');

      await refreshAll();
      await loadMeta();
      await loadHistory();

      Alert.alert('Purchase Order Created', `${result.purchase_code} | ${formatMoney(result.total_amount)}`);
    } catch (error) {
      Alert.alert('Create Failed', error?.message || 'Unable to create purchase order.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={historyRows}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.container}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>Purchase Orders</Text>
            <Text style={styles.subtitle}>Create orders quickly and track pending receiving at a glance.</Text>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>Create Order</Text>

              <Text style={styles.label}>Supplier</Text>
              <View style={styles.pickerWrap}>
                <Picker selectedValue={supplierId} onValueChange={(value) => setSupplierId(String(value))}>
                  {suppliers.map((item) => (
                    <Picker.Item
                      key={`po-supplier-${item.id}`}
                      label={`${item.name} | Due ${formatMoney(item.due_amount)}`}
                      value={String(item.id)}
                    />
                  ))}
                </Picker>
              </View>

              <Text style={styles.label}>Product</Text>
              <View style={styles.pickerWrap}>
                <Picker selectedValue={productId} onValueChange={(value) => setProductId(String(value))}>
                  {products.map((item) => (
                    <Picker.Item key={`po-product-${item.id}`} label={String(item.name || '')} value={String(item.id)} />
                  ))}
                </Picker>
              </View>

              <View style={styles.rowInputs}>
                <AppInput
                  style={styles.inputFlex}
                  value={orderedQty}
                  onChangeText={setOrderedQty}
                  keyboardType="number-pad"
                  placeholder="Qty"
                />
                <AppInput
                  style={styles.inputFlex}
                  value={unitCost}
                  onChangeText={setUnitCost}
                  keyboardType="decimal-pad"
                  placeholder="Unit cost"
                />
              </View>

              <AppButton title="Add Item" onPress={handleAddItem} variant="secondary" />

              {cartItems.map((item) => (
                <View key={item.key} style={styles.cartRow}>
                  <View style={styles.cartTextWrap}>
                    <Text style={styles.cartTitle}>{item.product_name}</Text>
                    <Text style={styles.cartMeta}>{item.ordered_qty} x {formatMoney(item.unit_cost)} = {formatMoney(item.subtotal)}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleRemoveItem(item.key)} style={styles.removeButton}>
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ))}

              <Text style={styles.totalText}>Order Total: {formatMoney(orderTotal)}</Text>

              <View style={styles.rowInputs}>
                <AppInput
                  style={styles.inputFlex}
                  value={paidAmount}
                  onChangeText={setPaidAmount}
                  keyboardType="decimal-pad"
                  placeholder="Initial paid amount"
                />
                <AppInput
                  style={styles.inputFlex}
                  value={orderNote}
                  onChangeText={setOrderNote}
                  placeholder="Note (optional)"
                />
              </View>

              <View style={styles.rowButtons}>
                <AppButton
                  title={saving ? 'Creating...' : 'Create Purchase Order'}
                  onPress={handleCreateOrder}
                  disabled={saving}
                  style={styles.buttonFlex}
                />
                <AppButton
                  title={refreshing ? 'Refreshing...' : 'Refresh'}
                  variant="secondary"
                  style={styles.buttonFlex}
                  onPress={async () => {
                    await refreshAll();
                    await loadMeta();
                    await loadHistory();
                  }}
                />
              </View>
            </AppCard>

            <Text style={styles.sectionTitle}>Recent Purchase Orders</Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>{loadingHistory ? 'Loading...' : 'No purchase orders yet.'}</Text>
        }
        renderItem={({ item }) => (
          <AppCard style={styles.historyCard}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyCode}>{item.purchase_code}</Text>
              <Text style={styles.historyStatus}>{item.status.toUpperCase()}</Text>
            </View>
            <Text style={styles.historyMeta}>{item.supplier_name}</Text>
            <Text style={styles.historyMeta}>Ordered: {item.ordered_qty_total} | Received: {item.received_qty_total}</Text>
            <Text style={styles.historyMeta}>
              Total: {formatMoney(item.total_amount)} | Paid: {formatMoney(item.paid_amount)} | Due: {formatMoney(item.due_amount)}
            </Text>
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
  card: { gap: 10, marginTop: 10 },
  sectionTitle: { fontSize: 19, fontWeight: '700', color: UI_COLORS.textPrimary, marginTop: 12 },
  label: { fontSize: 13, color: UI_COLORS.textMuted },
  pickerWrap: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    backgroundColor: UI_COLORS.surface,
    overflow: 'hidden',
  },
  rowInputs: { flexDirection: 'row', gap: 10 },
  inputFlex: { flex: 1 },
  cartRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cartTextWrap: { flex: 1, paddingRight: 8 },
  cartTitle: { fontSize: 14, fontWeight: '700', color: UI_COLORS.textPrimary },
  cartMeta: { fontSize: 12, color: UI_COLORS.textMuted },
  removeButton: {
    borderWidth: 1,
    borderColor: UI_COLORS.borderDanger,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: UI_COLORS.surfaceDanger,
  },
  removeText: { color: UI_COLORS.textDanger, fontWeight: '700', fontSize: 12 },
  totalText: { fontSize: 16, fontWeight: '700', color: UI_COLORS.textPrimary },
  rowButtons: { flexDirection: 'row', gap: 10 },
  buttonFlex: { flex: 1 },
  emptyText: { fontSize: 14, color: UI_COLORS.textMuted },
  historyCard: { gap: 4 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyCode: { fontSize: 15, fontWeight: '700', color: UI_COLORS.textPrimary },
  historyStatus: { fontSize: 12, color: UI_COLORS.primary, fontWeight: '700' },
  historyMeta: { fontSize: 13, color: UI_COLORS.textSecondary },
});
