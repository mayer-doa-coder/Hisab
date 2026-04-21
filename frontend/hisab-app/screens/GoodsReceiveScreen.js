import { Picker } from '@react-native-picker/picker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton, AppCard, AppInput } from '../components/ui';
import { UI_COLORS } from '../constants/ui-theme';
import { useAppData } from '../context/AppDataContext';

const formatMoney = (value) => `৳${Number(value || 0).toFixed(2)}`;

export default function GoodsReceiveScreen() {
  const {
    getOpenPurchaseOrders,
    getPurchaseOrderDetails,
    receivePurchaseItems,
    validatePurchaseMovementConsistency,
    refreshAll,
    refreshing,
  } = useAppData();

  const [openOrders, setOpenOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [orderDetails, setOrderDetails] = useState(null);
  const [receiveMap, setReceiveMap] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [consistency, setConsistency] = useState(null);

  const loadOpenOrders = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getOpenPurchaseOrders({ limit: 150 });
      setOpenOrders(rows);
      if (rows.length && !selectedOrderId) {
        setSelectedOrderId(String(rows[0].id));
      }
    } finally {
      setLoading(false);
    }
  }, [getOpenPurchaseOrders, selectedOrderId]);

  const loadConsistency = useCallback(async () => {
    const result = await validatePurchaseMovementConsistency({});
    setConsistency(result);
  }, [validatePurchaseMovementConsistency]);

  useEffect(() => {
    loadOpenOrders();
    loadConsistency();
  }, [loadConsistency, loadOpenOrders]);

  const loadOrderDetails = useCallback(async () => {
    const orderId = Number(selectedOrderId);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      setOrderDetails(null);
      return;
    }

    const details = await getPurchaseOrderDetails({ purchaseOrderId: orderId });
    setOrderDetails(details);
    setReceiveMap({});
  }, [getPurchaseOrderDetails, selectedOrderId]);

  useEffect(() => {
    loadOrderDetails();
  }, [loadOrderDetails]);

  const pendingItems = useMemo(
    () => (orderDetails?.items || []).filter((item) => Number(item.pending_qty || 0) > 0),
    [orderDetails]
  );

  const handleReceive = async () => {
    const orderId = Number(selectedOrderId);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      Alert.alert('Required', 'Select a purchase order first.');
      return;
    }

    const payload = pendingItems
      .map((item) => ({
        purchaseItemId: Number(item.id),
        quantity: Number(receiveMap[String(item.id)] || 0),
      }))
      .filter((item) => Number.isInteger(item.quantity) && item.quantity > 0);

    if (!payload.length) {
      Alert.alert('No Quantity', 'Enter quantity for at least one pending item.');
      return;
    }

    if (submitting) {
      return;
    }

    try {
      setSubmitting(true);
      await receivePurchaseItems({
        purchaseOrderId: orderId,
        items: payload,
      });

      await refreshAll();
      await loadOpenOrders();
      await loadOrderDetails();
      await loadConsistency();

      Alert.alert('Received', 'Stock updated and movement entries were recorded automatically.');
    } catch (error) {
      Alert.alert('Receive Failed', error?.message || 'Unable to receive goods.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={pendingItems}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.container}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>Goods Receiving</Text>
            <Text style={styles.subtitle}>Receive purchase items and auto-post stock-in movements.</Text>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>Open Orders</Text>
              <View style={styles.pickerWrap}>
                <Picker selectedValue={selectedOrderId} onValueChange={(value) => setSelectedOrderId(String(value))}>
                  {openOrders.map((order) => (
                    <Picker.Item
                      key={`receive-order-${order.id}`}
                      label={`${order.purchase_code} | ${order.supplier_name} | Due ${formatMoney(order.due_amount)}`}
                      value={String(order.id)}
                    />
                  ))}
                </Picker>
              </View>
              <View style={styles.buttonRow}>
                <AppButton
                  title={submitting ? 'Posting...' : 'Receive Selected Qty'}
                  onPress={handleReceive}
                  disabled={submitting || !pendingItems.length}
                  style={styles.buttonFlex}
                />
                <AppButton
                  title={refreshing || loading ? 'Refreshing...' : 'Refresh'}
                  variant="secondary"
                  style={styles.buttonFlex}
                  onPress={async () => {
                    await refreshAll();
                    await loadOpenOrders();
                    await loadOrderDetails();
                    await loadConsistency();
                  }}
                />
              </View>
            </AppCard>

            {orderDetails ? (
              <AppCard style={styles.card}>
                <Text style={styles.sectionTitle}>{orderDetails.purchase_code}</Text>
                <Text style={styles.metaText}>{orderDetails.supplier_name}</Text>
                <Text style={styles.metaText}>Status: {String(orderDetails.status || '').toUpperCase()}</Text>
                <Text style={styles.metaText}>
                  Total: {formatMoney(orderDetails.total_amount)} | Due: {formatMoney(orderDetails.due_amount)}
                </Text>
              </AppCard>
            ) : null}

            {consistency ? (
              <AppCard style={styles.card}>
                <Text style={styles.sectionTitle}>Integrity Check</Text>
                <Text style={styles.metaText}>Purchase Received Qty: {consistency.purchase_received_quantity}</Text>
                <Text style={styles.metaText}>Movement Purchase IN Qty: {consistency.movement_purchase_in_quantity}</Text>
                <Text style={styles.metaText}>
                  Status: {consistency.is_consistent ? 'CONSISTENT' : `MISMATCH (${consistency.difference})`}
                </Text>
              </AppCard>
            ) : null}

            <Text style={styles.sectionTitle}>Pending Items</Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>{loading ? 'Loading...' : 'No pending receive items for selected order.'}</Text>
        }
        renderItem={({ item }) => (
          <AppCard style={styles.rowCard}>
            <Text style={styles.rowTitle}>{item.product_name}</Text>
            <Text style={styles.rowMeta}>
              Ordered: {item.ordered_qty} | Received: {item.received_qty} | Pending: {item.pending_qty}
            </Text>
            <AppInput
              value={String(receiveMap[String(item.id)] || '')}
              onChangeText={(value) => setReceiveMap((prev) => ({ ...prev, [String(item.id)]: value }))}
              keyboardType="number-pad"
              placeholder="Receive quantity"
            />
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
  rowCard: { gap: 8 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: UI_COLORS.textPrimary },
  rowMeta: { fontSize: 13, color: UI_COLORS.textMuted },
  emptyText: { fontSize: 14, color: UI_COLORS.textMuted },
});
