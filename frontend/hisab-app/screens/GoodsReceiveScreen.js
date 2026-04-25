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
      Alert.alert('প্রয়োজনীয়', 'প্রথমে একটি ক্রয় আদেশ বেছে নিন।');
      return;
    }

    const payload = pendingItems
      .map((item) => ({
        purchaseItemId: Number(item.id),
        quantity: Number(receiveMap[String(item.id)] || 0),
      }))
      .filter((item) => Number.isInteger(item.quantity) && item.quantity > 0);

    if (!payload.length) {
      Alert.alert('পরিমাণ নেই', 'অন্তত একটি মুলতুবি আইটেমের পরিমাণ লিখুন।');
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

      Alert.alert('গৃহীত হয়েছে', 'স্টক আপডেট হয়েছে এবং মুভমেন্ট স্বয়ংক্রিয়ভাবে রেকর্ড হয়েছে।');
    } catch (error) {
      Alert.alert('গ্রহণ ব্যর্থ', error?.message || 'পণ্য গ্রহণ করা যায়নি।');
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
            <Text style={styles.title}>পণ্য গ্রহণ</Text>
            <Text style={styles.subtitle}>ক্রয় করা পণ্য গ্রহণ করুন এবং স্টক আপডেট হবে।</Text>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>খোলা আদেশ</Text>
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
                  title={submitting ? 'জমা হচ্ছে...' : 'নির্বাচিত পরিমাণ গ্রহণ করুন'}
                  onPress={handleReceive}
                  disabled={submitting || !pendingItems.length}
                  style={styles.buttonFlex}
                />
                <AppButton
                  title={refreshing || loading ? 'রিফ্রেশ হচ্ছে...' : 'রিফ্রেশ'}
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
                <Text style={styles.sectionTitle}>অখণ্ডতা যাচাই</Text>
                <Text style={styles.metaText}>Purchase Received Qty: {consistency.purchase_received_quantity}</Text>
                <Text style={styles.metaText}>Movement Purchase IN Qty: {consistency.movement_purchase_in_quantity}</Text>
                <Text style={styles.metaText}>
                  Status: {consistency.is_consistent ? 'CONSISTENT' : `MISMATCH (${consistency.difference})`}
                </Text>
              </AppCard>
            ) : null}

            <Text style={styles.sectionTitle}>মুলতুবি পণ্য</Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>{loading ? 'লোড হচ্ছে...' : 'নির্বাচিত অর্ডারে কোনো মুলতুবি আইটেম নেই।'}</Text>
        }
        renderItem={({ item }) => (
          <AppCard style={styles.rowCard}>
            <Text style={styles.rowTitle}>{item.product_name}</Text>
            <Text style={styles.rowMeta}>
              অর্ডার: {item.ordered_qty} | গৃহীত: {item.received_qty} | মুলতুবি: {item.pending_qty}
            </Text>
            <AppInput
              value={String(receiveMap[String(item.id)] || '')}
              onChangeText={(value) => setReceiveMap((prev) => ({ ...prev, [String(item.id)]: value }))}
              keyboardType="number-pad"
              placeholder="প্রাপ্ত পরিমাণ"
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
