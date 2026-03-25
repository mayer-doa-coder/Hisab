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
import { DATE_RANGE_OPTIONS, DATE_RANGE_TYPES, getRangeBounds } from '../services/analytics/dateRangeUtils';
import BakiEntryForm from './baki/BakiEntryForm';
import BakiFilters from './baki/BakiFilters';
import BakiKpiDashboard from './baki/BakiKpiDashboard';
import BakiListItem from './baki/BakiListItem';
import BakiSummaryCards from './baki/BakiSummaryCards';
import PaymentEntryForm from './baki/PaymentEntryForm';

export default function BakiListScreen() {
  const { customers, bakiRows, addBaki, addBakiPayment, getBakiKpiSummary, refreshAll, refreshing } = useAppData();

  const [selectedCustomerId, setSelectedCustomerId] = useState('all');
  const [dueFilter, setDueFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [creditCustomerId, setCreditCustomerId] = useState('');
  const [creditAmount, setCreditAmount] = useState('');
  const [creditNote, setCreditNote] = useState('');

  const [paymentCustomerId, setPaymentCustomerId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');

  const [savingCredit, setSavingCredit] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [kpiRange, setKpiRange] = useState(DATE_RANGE_TYPES.TODAY);
  const [loadingKpis, setLoadingKpis] = useState(false);
  const [kpis, setKpis] = useState({
    totalCredit: 0,
    totalPayments: 0,
    netBalanceChange: 0,
    numberOfTransactions: 0,
    averageDailyCredit: 0,
    averagePayment: 0,
    topCustomerName: null,
    topCustomerCredit: 0,
    collectionRate: 0,
    activeCustomers: 0,
  });

  const loadKpis = useCallback(async () => {
    const bounds = getRangeBounds(kpiRange, new Date());

    try {
      setLoadingKpis(true);
      const summary = await getBakiKpiSummary({
        startDateIso: bounds.startDateIso,
        endDateIso: bounds.endDateIso,
        rangeDays: bounds.rangeDays,
      });

      setKpis({
        totalCredit: Number(summary?.total_credit || 0),
        totalPayments: Number(summary?.total_payments_received || 0),
        netBalanceChange: Number(summary?.net_balance_change || 0),
        numberOfTransactions: Number(summary?.number_of_transactions || 0),
        averageDailyCredit: Number(summary?.average_daily_credit || 0),
        averagePayment: Number(summary?.average_payment || 0),
        topCustomerName: summary?.top_customer_name || null,
        topCustomerCredit: Number(summary?.top_customer_credit || 0),
        collectionRate: Number(summary?.collection_rate || 0),
        activeCustomers: Number(summary?.active_customers || 0),
      });
    } catch (error) {
      Alert.alert('KPI Load Failed', error?.message || 'Unable to load KPI summary.');
    } finally {
      setLoadingKpis(false);
    }
  }, [getBakiKpiSummary, kpiRange]);

  useEffect(() => {
    loadKpis();
  }, [loadKpis, bakiRows]);

  const dueByCustomerId = useMemo(() => {
    const map = new Map();
    for (const row of bakiRows) {
      map.set(Number(row.customer_id), Math.max(0, Number(row.due_amount || 0)));
    }
    return map;
  }, [bakiRows]);

  const currentPaymentDue = dueByCustomerId.get(Number(paymentCustomerId)) || 0;

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return bakiRows.filter((row) => {
      const matchCustomer = selectedCustomerId === 'all' || Number(row.customer_id) === Number(selectedCustomerId);
      const dueAmount = Math.max(0, Number(row.due_amount || 0));
      const matchDueFilter =
        dueFilter === 'all' ||
        (dueFilter === 'with-due' && dueAmount > 0) ||
        (dueFilter === 'no-due' && dueAmount <= 0);
      const matchQuery =
        !query ||
        String(row.customer_name || '').toLowerCase().includes(query) ||
        String(row.customer_phone || '').toLowerCase().includes(query);

      return matchCustomer && matchDueFilter && matchQuery;
    });
  }, [bakiRows, dueFilter, search, selectedCustomerId]);

  const summary = useMemo(() => {
    const totalDue = filteredRows.reduce((sum, row) => sum + Number(row.due_amount || 0), 0);
    const creditCount = filteredRows.reduce((sum, row) => sum + Number(row.credit_count || 0), 0);
    const paymentCount = filteredRows.reduce((sum, row) => sum + Number(row.payment_count || 0), 0);

    return {
      totalDue,
      creditCount,
      paymentCount,
      totalRows: filteredRows.length,
    };
  }, [filteredRows]);

  const handleAddCredit = async () => {
    if (savingCredit) {
      return;
    }

    try {
      setSavingCredit(true);
      await addBaki({
        customerId: Number(creditCustomerId),
        amount: Number(creditAmount),
        note: creditNote,
      });

      setCreditAmount('');
      setCreditNote('');
      Alert.alert('Success', 'Credit added successfully.');
    } catch (error) {
      Alert.alert('Save Failed', error?.message || 'Unable to add credit entry.');
    } finally {
      setSavingCredit(false);
    }
  };

  const handleSavePayment = async () => {
    if (savingPayment) {
      return;
    }

    const requestedAmount = Number(paymentAmount);

    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid payment amount greater than 0.');
      return;
    }

    if (currentPaymentDue <= 0) {
      Alert.alert('No Due', 'No existing credit found for this customer. Payment is not allowed.');
      return;
    }

    if (requestedAmount - currentPaymentDue > 0.000001) {
      Alert.alert('Overpayment Blocked', `Payment cannot exceed due (৳${currentPaymentDue.toFixed(2)}).`);
      return;
    }

    Alert.alert('Confirm Payment', `Record payment of ৳${requestedAmount.toFixed(2)}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          try {
            setSavingPayment(true);
            await addBakiPayment({
              customerId: Number(paymentCustomerId),
              amount: requestedAmount,
              note: paymentNote,
              paymentMethod,
            });

            setPaymentAmount('');
            setPaymentNote('');
            Alert.alert('Success', 'Payment recorded successfully.');
          } catch (error) {
            Alert.alert('Payment Failed', error?.message || 'Unable to record payment.');
          } finally {
            setSavingPayment(false);
          }
        },
      },
    ]);
  };

  const handleStartPayment = (row) => {
    setPaymentCustomerId(String(row.customer_id));
    setPaymentAmount('');
    setPaymentNote('');
    setPaymentMethod('cash');
  };

  const handleQuickRefresh = async () => {
    try {
      await refreshAll();
    } catch (error) {
      Alert.alert('Refresh Failed', error?.message || 'Unable to refresh baki data.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <FlatList
          data={filteredRows}
          keyExtractor={(item, index) => String(item.id ?? item.customer_id ?? `baki-${index}`)}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View>
              <Text style={styles.title}>Baki List</Text>
              <Text style={styles.subtitle}>Ledger-based credit + repayment flow with live due tracking.</Text>

              <BakiKpiDashboard
                rangeOptions={DATE_RANGE_OPTIONS}
                selectedRange={kpiRange}
                onSelectRange={setKpiRange}
                loading={loadingKpis}
                kpis={kpis}
              />

              <BakiSummaryCards
                totalRows={summary.totalRows}
                totalDue={summary.totalDue}
                creditCount={summary.creditCount}
                paymentCount={summary.paymentCount}
              />

              <BakiEntryForm
                customers={customers}
                customerId={creditCustomerId}
                setCustomerId={setCreditCustomerId}
                amount={creditAmount}
                setAmount={setCreditAmount}
                note={creditNote}
                setNote={setCreditNote}
                onSave={handleAddCredit}
                saving={savingCredit}
                refreshing={refreshing}
              />

              <PaymentEntryForm
                customers={customers}
                customerId={paymentCustomerId}
                setCustomerId={setPaymentCustomerId}
                paymentAmount={paymentAmount}
                setPaymentAmount={setPaymentAmount}
                paymentNote={paymentNote}
                setPaymentNote={setPaymentNote}
                paymentMethod={paymentMethod}
                setPaymentMethod={setPaymentMethod}
                currentDue={currentPaymentDue}
                onSave={handleSavePayment}
                saving={savingPayment}
                refreshing={refreshing}
              />

              <BakiFilters
                search={search}
                setSearch={setSearch}
                selectedCustomerId={selectedCustomerId}
                setSelectedCustomerId={setSelectedCustomerId}
                dueFilter={dueFilter}
                setDueFilter={setDueFilter}
                customers={customers}
              />

              <View style={styles.headerRow}>
                <Text style={styles.sectionTitle}>Customer Due Overview</Text>
                <TouchableOpacity style={styles.refreshButton} onPress={handleQuickRefresh}>
                  <Text style={styles.refreshText}>{refreshing ? 'Refreshing...' : 'Refresh'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          }
          ListEmptyComponent={<Text style={styles.emptyText}>No baki overview found.</Text>}
          renderItem={({ item }) => <BakiListItem item={item} onStartPayment={handleStartPayment} />}
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
  headerRow: {
    marginTop: 16,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: { fontSize: 19, fontWeight: '700', color: UI_COLORS.textPrimary },
  refreshButton: {
    backgroundColor: '#E7EEFF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  refreshText: { color: UI_COLORS.primary, fontSize: 12, fontWeight: '600' },
  emptyText: { fontSize: 14, color: UI_COLORS.textMuted },
});
