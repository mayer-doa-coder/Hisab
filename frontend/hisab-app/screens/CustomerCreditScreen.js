import { Picker } from '@react-native-picker/picker';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UI_COLORS } from '../constants/ui-theme';
import { useAppData } from '../context/AppDataContext';

export default function CustomerCreditScreen() {
  const {
    customers,
    addBaki,
    addBakiPayment,
    getCustomerLedger,
    scheduleCustomerReminder,
    createCustomerPromise,
    getCustomerPromises,
  } = useAppData();

  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [dueDays, setDueDays] = useState('30');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [ledgerRows, setLedgerRows] = useState([]);
  const [promises, setPromises] = useState([]);

  const selectedCustomer = useMemo(
    () => customers.find((row) => Number(row.id) === Number(customerId)) || null,
    [customers, customerId]
  );

  useEffect(() => {
    if (!customers.length) {
      setCustomerId('');
      return;
    }

    if (!customerId || !customers.some((row) => Number(row.id) === Number(customerId))) {
      setCustomerId(String(customers[0].id));
    }
  }, [customers, customerId]);

  useEffect(() => {
    const run = async () => {
      if (!customerId) {
        setLedgerRows([]);
        setPromises([]);
        return;
      }

      try {
        const [ledger, promiseRows] = await Promise.all([
          getCustomerLedger(Number(customerId)),
          getCustomerPromises({ customerId: Number(customerId), status: 'pending', limit: 20 }),
        ]);
        setLedgerRows(Array.isArray(ledger) ? ledger : []);
        setPromises(Array.isArray(promiseRows) ? promiseRows : []);
      } catch (error) {
        Alert.alert('Load Failed', error?.message || 'Unable to load customer credit data.');
      }
    };

    run();
  }, [customerId, getCustomerLedger, getCustomerPromises]);

  const currentDue = useMemo(
    () => Math.max(0, Number(selectedCustomer?.total_due || selectedCustomer?.current_balance || 0)),
    [selectedCustomer]
  );

  const handleAddCredit = async () => {
    try {
      const numericAmount = Number(amount);
      if (!customerId || !Number.isFinite(numericAmount) || numericAmount <= 0) {
        throw new Error('Select a customer and enter a valid credit amount.');
      }

      await addBaki({
        customerId: Number(customerId),
        amount: numericAmount,
        note,
        dueTermsDays: Number(dueDays) > 0 ? Number(dueDays) : 30,
      });

      setAmount('');
      setNote('');
      Alert.alert('Success', 'Credit entry added.');
    } catch (error) {
      Alert.alert('Credit Failed', error?.message || 'Unable to add credit.');
    }
  };

  const handleAddPayment = async () => {
    try {
      const numericAmount = Number(paymentAmount);
      if (!customerId || !Number.isFinite(numericAmount) || numericAmount <= 0) {
        throw new Error('Select a customer and enter a valid payment amount.');
      }

      await addBakiPayment({
        customerId: Number(customerId),
        amount: numericAmount,
        note: paymentNote,
        paymentMethod: 'cash',
      });

      setPaymentAmount('');
      setPaymentNote('');
      Alert.alert('Success', 'Payment recorded.');
    } catch (error) {
      Alert.alert('Payment Failed', error?.message || 'Unable to record payment.');
    }
  };

  const handleQuickReminder = async () => {
    try {
      if (!customerId) {
        throw new Error('Select a customer first.');
      }

      await scheduleCustomerReminder({
        customerId: Number(customerId),
        channel: 'whatsapp',
        message: `Friendly reminder: your current due is ৳${currentDue.toFixed(2)}.`,
      });

      Alert.alert('Reminder Scheduled', 'Reminder added to collections queue.');
    } catch (error) {
      Alert.alert('Reminder Failed', error?.message || 'Unable to schedule reminder.');
    }
  };

  const handleQuickPromise = async () => {
    try {
      if (!customerId || currentDue <= 0) {
        throw new Error('No due available for a payment promise.');
      }

      const promiseDate = new Date();
      promiseDate.setDate(promiseDate.getDate() + 3);

      await createCustomerPromise({
        customerId: Number(customerId),
        promisedAmount: Math.min(currentDue, 500),
        promiseDate: promiseDate.toISOString(),
        note: 'Quick promise from credit screen',
      });

      Alert.alert('Promise Added', 'Payment promise created successfully.');
    } catch (error) {
      Alert.alert('Promise Failed', error?.message || 'Unable to create payment promise.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>Customer Credit</Text>
          <Text style={styles.subtitle}>Credit limits, due terms, reminders, and promises in one place.</Text>

          {customers.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.label}>Customer</Text>
              <View style={styles.pickerWrap}>
                <Picker selectedValue={customerId} onValueChange={(value) => setCustomerId(String(value))}>
                  {customers.map((row) => (
                    <Picker.Item
                      key={`credit-customer-${row.id}`}
                      value={String(row.id)}
                      label={`${row.name} (${row.phone || 'No phone'})`}
                    />
                  ))}
                </Picker>
              </View>

              <Text style={styles.meta}>Current Due: ৳{currentDue.toFixed(2)}</Text>
              <Text style={styles.meta}>Credit Limit: ৳{Number(selectedCustomer?.credit_limit || 0).toFixed(2)}</Text>
              <Text style={styles.meta}>Risk Level: {String(selectedCustomer?.risk_level || 'low')}</Text>
            </View>
          ) : (
            <Text style={styles.empty}>No customers available.</Text>
          )}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Add Credit</Text>
            <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="Amount" />
            <TextInput style={styles.input} value={dueDays} onChangeText={setDueDays} keyboardType="number-pad" placeholder="Due terms (days)" />
            <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="Note" />
            <TouchableOpacity style={styles.button} onPress={handleAddCredit}>
              <Text style={styles.buttonText}>Save Credit</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Record Payment</Text>
            <TextInput style={styles.input} value={paymentAmount} onChangeText={setPaymentAmount} keyboardType="decimal-pad" placeholder="Payment amount" />
            <TextInput style={styles.input} value={paymentNote} onChangeText={setPaymentNote} placeholder="Payment note" />
            <TouchableOpacity style={styles.buttonSecondary} onPress={handleAddPayment}>
              <Text style={styles.buttonTextSecondary}>Save Payment</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.cardRow}>
            <TouchableOpacity style={styles.pillButton} onPress={handleQuickReminder}>
              <Text style={styles.pillText}>Send Reminder</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.pillButton} onPress={handleQuickPromise}>
              <Text style={styles.pillText}>Create Promise</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Open Promises</Text>
            {promises.length === 0 ? (
              <Text style={styles.empty}>No pending promises.</Text>
            ) : (
              promises.map((row) => (
                <View key={`promise-${row.id}`} style={styles.listRow}>
                  <Text style={styles.listTitle}>৳{Number(row.promised_amount || 0).toFixed(2)}</Text>
                  <Text style={styles.listMeta}>{row.promise_date || 'No date'}</Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Recent Ledger</Text>
            {ledgerRows.length === 0 ? (
              <Text style={styles.empty}>No ledger records found.</Text>
            ) : (
              ledgerRows.slice(-12).map((row) => (
                <View key={`ledger-${row.entry_id || row.id}`} style={styles.listRow}>
                  <Text style={styles.listTitle}>{row.event_type || row.type}</Text>
                  <Text style={styles.listMeta}>৳{Number(Math.abs(row.amount_change || row.amount || 0)).toFixed(2)}</Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: UI_COLORS.background },
  flex: { flex: 1 },
  container: { padding: 16, gap: 12 },
  title: { fontSize: 26, fontWeight: '700', color: UI_COLORS.textPrimary },
  subtitle: { fontSize: 13, color: UI_COLORS.textSecondary },
  card: {
    backgroundColor: UI_COLORS.surface,
    borderColor: UI_COLORS.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  cardRow: { flexDirection: 'row', gap: 10 },
  pickerWrap: { borderWidth: 1, borderColor: UI_COLORS.border, borderRadius: 8, overflow: 'hidden' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: UI_COLORS.textPrimary },
  label: { fontSize: 13, fontWeight: '600', color: UI_COLORS.textPrimary },
  meta: { fontSize: 12, color: UI_COLORS.textSecondary },
  input: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: UI_COLORS.surfaceMuted,
    color: UI_COLORS.textPrimary,
  },
  button: {
    backgroundColor: UI_COLORS.primary,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonSecondary: {
    backgroundColor: UI_COLORS.surfaceSubtle,
    borderColor: UI_COLORS.borderSoft,
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: UI_COLORS.surface, fontWeight: '700' },
  buttonTextSecondary: { color: UI_COLORS.primary, fontWeight: '700' },
  pillButton: {
    flex: 1,
    backgroundColor: UI_COLORS.surfaceSubtle,
    borderColor: UI_COLORS.borderSoft,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  pillText: { color: UI_COLORS.primary, fontWeight: '700', fontSize: 12 },
  listRow: {
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
    borderRadius: 8,
    padding: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  listTitle: { color: UI_COLORS.textPrimary, fontWeight: '600' },
  listMeta: { color: UI_COLORS.textSecondary, fontSize: 12 },
  empty: { color: UI_COLORS.textMuted, fontSize: 13 },
});
