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

const PURCHASE_STATUS_OPTIONS = [
  { label: 'All Status', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Partial', value: 'partial' },
  { label: 'Received', value: 'received' },
  { label: 'Cancelled', value: 'cancelled' },
];

export default function PurchaseHistoryScreen() {
  const {
    getPurchaseHistory,
    listSuppliers,
    recordSupplierPayment,
    getSupplierPayables,
    validatePurchaseMovementConsistency,
    refreshAll,
    refreshing,
  } = useAppData();

  const [suppliers, setSuppliers] = useState([]);
  const [rows, setRows] = useState([]);
  const [payables, setPayables] = useState([]);
  const [payableSummary, setPayableSummary] = useState({ outstanding_due: 0, supplier_name: null });
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [paymentSupplierId, setPaymentSupplierId] = useState('');
  const [paymentPurchaseOrderId, setPaymentPurchaseOrderId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentNote, setPaymentNote] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);
  const [consistency, setConsistency] = useState(null);

  const loadSuppliers = useCallback(async () => {
    const nextSuppliers = await listSuppliers({ limit: 300 });
    setSuppliers(nextSuppliers);

    if (!supplierFilter && nextSuppliers.length) {
      setSupplierFilter('');
    }

    if (!paymentSupplierId && nextSuppliers.length) {
      setPaymentSupplierId(String(nextSuppliers[0].id));
    }
  }, [listSuppliers, paymentSupplierId, supplierFilter]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const supplierIdValue = Number(supplierFilter);
      const nextRows = await getPurchaseHistory({
        limit: 150,
        supplierId: Number.isInteger(supplierIdValue) && supplierIdValue > 0 ? supplierIdValue : null,
        status: statusFilter || null,
        searchText,
      });
      setRows(nextRows);
    } finally {
      setLoading(false);
    }
  }, [getPurchaseHistory, searchText, statusFilter, supplierFilter]);

  const loadPayables = useCallback(async () => {
    const supplierIdValue = Number(paymentSupplierId);
    const result = await getSupplierPayables({
      supplierId: Number.isInteger(supplierIdValue) && supplierIdValue > 0 ? supplierIdValue : null,
      limit: 80,
    });
    setPayables(Array.isArray(result?.rows) ? result.rows : []);
    setPayableSummary(result?.summary || { outstanding_due: 0, supplier_name: null });
  }, [getSupplierPayables, paymentSupplierId]);

  const loadConsistency = useCallback(async () => {
    const result = await validatePurchaseMovementConsistency({});
    setConsistency(result);
  }, [validatePurchaseMovementConsistency]);

  useEffect(() => {
    loadSuppliers();
    loadRows();
    loadPayables();
    loadConsistency();
  }, [loadConsistency, loadPayables, loadRows, loadSuppliers]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    loadPayables();
  }, [loadPayables]);

  const purchaseRowsForPaymentSupplier = useMemo(() => {
    const supplierIdValue = Number(paymentSupplierId);
    if (!Number.isInteger(supplierIdValue) || supplierIdValue <= 0) {
      return [];
    }

    return rows.filter((row) => Number(row.supplier_id) === supplierIdValue && Number(row.due_amount || 0) > 0);
  }, [paymentSupplierId, rows]);

  const totalDueInView = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.due_amount || 0), 0),
    [rows]
  );

  const handlePostPayment = async () => {
    const supplierIdValue = Number(paymentSupplierId);
    const amountValue = Number(paymentAmount);
    const purchaseOrderIdValue = Number(paymentPurchaseOrderId);

    if (!Number.isInteger(supplierIdValue) || supplierIdValue <= 0) {
      Alert.alert('Required', 'Select supplier for payment.');
      return;
    }

    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      Alert.alert('Required', 'Valid payment amount is required.');
      return;
    }

    if (savingPayment) {
      return;
    }

    try {
      setSavingPayment(true);
      await recordSupplierPayment({
        supplierId: supplierIdValue,
        amount: amountValue,
        purchaseOrderId: Number.isInteger(purchaseOrderIdValue) && purchaseOrderIdValue > 0 ? purchaseOrderIdValue : null,
        paymentMethod,
        note: paymentNote || null,
      });

      setPaymentAmount('');
      setPaymentNote('');
      setPaymentPurchaseOrderId('');

      await refreshAll();
      await loadSuppliers();
      await loadRows();
      await loadPayables();
      await loadConsistency();

      Alert.alert('Payment Saved', 'Supplier due updated successfully.');
    } catch (error) {
      Alert.alert('Payment Failed', error?.message || 'Unable to record supplier payment.');
    } finally {
      setSavingPayment(false);
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
            <Text style={styles.title}>Purchase History</Text>
            <Text style={styles.subtitle}>Filter purchases and record supplier payments against dues.</Text>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>Filters</Text>
              <AppInput value={searchText} onChangeText={setSearchText} placeholder="Search code, note, supplier" />

              <Text style={styles.label}>Status</Text>
              <View style={styles.pickerWrap}>
                <Picker selectedValue={statusFilter} onValueChange={(value) => setStatusFilter(String(value))}>
                  {PURCHASE_STATUS_OPTIONS.map((option) => (
                    <Picker.Item key={`purchase-status-${option.value || 'all'}`} label={option.label} value={option.value} />
                  ))}
                </Picker>
              </View>

              <Text style={styles.label}>Supplier</Text>
              <View style={styles.pickerWrap}>
                <Picker selectedValue={supplierFilter} onValueChange={(value) => setSupplierFilter(String(value))}>
                  <Picker.Item label="All Suppliers" value="" />
                  {suppliers.map((supplier) => (
                    <Picker.Item key={`history-supplier-${supplier.id}`} label={supplier.name} value={String(supplier.id)} />
                  ))}
                </Picker>
              </View>

              <View style={styles.buttonRow}>
                <AppButton title={loading ? 'Loading...' : 'Apply Filters'} onPress={loadRows} style={styles.buttonFlex} />
                <AppButton
                  title={refreshing ? 'Refreshing...' : 'Refresh'}
                  variant="secondary"
                  style={styles.buttonFlex}
                  onPress={async () => {
                    await refreshAll();
                    await loadSuppliers();
                    await loadRows();
                    await loadPayables();
                    await loadConsistency();
                  }}
                />
              </View>

              <Text style={styles.summaryText}>Rows: {rows.length} | Due in view: {formatMoney(totalDueInView)}</Text>
            </AppCard>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>Post Supplier Payment</Text>
              <Text style={styles.summaryText}>
                Current Supplier Due: {formatMoney(payableSummary?.outstanding_due || 0)}
              </Text>

              <Text style={styles.label}>Supplier</Text>
              <View style={styles.pickerWrap}>
                <Picker selectedValue={paymentSupplierId} onValueChange={(value) => setPaymentSupplierId(String(value))}>
                  {suppliers.map((supplier) => (
                    <Picker.Item
                      key={`payment-supplier-${supplier.id}`}
                      label={`${supplier.name} | Due ${formatMoney(supplier.due_amount)}`}
                      value={String(supplier.id)}
                    />
                  ))}
                </Picker>
              </View>

              <Text style={styles.label}>Purchase Order (Optional)</Text>
              <View style={styles.pickerWrap}>
                <Picker selectedValue={paymentPurchaseOrderId} onValueChange={(value) => setPaymentPurchaseOrderId(String(value))}>
                  <Picker.Item label="Apply to supplier due only" value="" />
                  {purchaseRowsForPaymentSupplier.map((row) => (
                    <Picker.Item
                      key={`payment-order-${row.id}`}
                      label={`${row.purchase_code} | Due ${formatMoney(row.due_amount)}`}
                      value={String(row.id)}
                    />
                  ))}
                </Picker>
              </View>

              <View style={styles.rowInputs}>
                <AppInput
                  style={styles.inputFlex}
                  value={paymentAmount}
                  onChangeText={setPaymentAmount}
                  keyboardType="decimal-pad"
                  placeholder="Amount"
                />
                <View style={[styles.pickerWrap, styles.inputFlex]}>
                  <Picker selectedValue={paymentMethod} onValueChange={(value) => setPaymentMethod(String(value))}>
                    <Picker.Item label="CASH" value="CASH" />
                    <Picker.Item label="BKASH" value="BKASH" />
                    <Picker.Item label="NAGAD" value="NAGAD" />
                    <Picker.Item label="BANK" value="BANK" />
                    <Picker.Item label="CARD" value="CARD" />
                  </Picker>
                </View>
              </View>

              <AppInput value={paymentNote} onChangeText={setPaymentNote} placeholder="Note (optional)" />

              <AppButton
                title={savingPayment ? 'Posting...' : 'Post Payment'}
                onPress={handlePostPayment}
                disabled={savingPayment}
              />
            </AppCard>

            {consistency ? (
              <AppCard style={styles.card}>
                <Text style={styles.sectionTitle}>Integrity Check</Text>
                <Text style={styles.summaryText}>Purchase Received Qty: {consistency.purchase_received_quantity}</Text>
                <Text style={styles.summaryText}>Movement Purchase IN Qty: {consistency.movement_purchase_in_quantity}</Text>
                <Text style={styles.summaryText}>
                  Status: {consistency.is_consistent ? 'CONSISTENT' : `MISMATCH (${consistency.difference})`}
                </Text>
              </AppCard>
            ) : null}

            <Text style={styles.sectionTitle}>Purchase Rows</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.emptyText}>{loading ? 'Loading...' : 'No purchase rows found.'}</Text>}
        renderItem={({ item }) => (
          <AppCard style={styles.rowCard}>
            <View style={styles.rowHeader}>
              <Text style={styles.rowCode}>{item.purchase_code}</Text>
              <Text style={styles.rowStatus}>{item.status.toUpperCase()}</Text>
            </View>
            <Text style={styles.rowMeta}>{item.supplier_name}</Text>
            <Text style={styles.rowMeta}>Ordered: {item.ordered_qty_total} | Received: {item.received_qty_total}</Text>
            <Text style={styles.rowMeta}>
              Total: {formatMoney(item.total_amount)} | Paid: {formatMoney(item.paid_amount)} | Due: {formatMoney(item.due_amount)}
            </Text>
          </AppCard>
        )}
        ListFooterComponent={
          payables.length ? (
            <View style={styles.footerWrap}>
              <Text style={styles.sectionTitle}>Recent Supplier Payables</Text>
              {payables.slice(0, 20).map((row) => (
                <AppCard key={`payable-row-${row.id}`} style={styles.payableCard}>
                  <Text style={styles.rowMeta}>
                    {row.supplier_name} | {row.entry_type.toUpperCase()} | {formatMoney(row.amount)}
                  </Text>
                  <Text style={styles.rowMeta}>
                    Running Due: {formatMoney(row.running_due)} {row.purchase_code ? `| ${row.purchase_code}` : ''}
                  </Text>
                </AppCard>
              ))}
            </View>
          ) : null
        }
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
  summaryText: { fontSize: 13, color: UI_COLORS.textSecondary },
  rowInputs: { flexDirection: 'row', gap: 10 },
  inputFlex: { flex: 1 },
  emptyText: { fontSize: 14, color: UI_COLORS.textMuted },
  rowCard: { gap: 4 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowCode: { fontSize: 15, fontWeight: '700', color: UI_COLORS.textPrimary },
  rowStatus: { fontSize: 12, color: UI_COLORS.primary, fontWeight: '700' },
  rowMeta: { fontSize: 13, color: UI_COLORS.textSecondary },
  footerWrap: { marginTop: 10, gap: 8 },
  payableCard: { gap: 4 },
});
