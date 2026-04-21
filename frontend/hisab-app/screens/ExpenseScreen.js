import { Picker } from '@react-native-picker/picker';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton, AppCard, AppInput } from '../components/ui';
import { UI_COLORS } from '../constants/ui-theme';
import { useAppData } from '../context/AppDataContext';

const formatMoney = (value) => `৳${Number(value || 0).toFixed(2)}`;

const CATEGORY_OPTIONS = [
  'GENERAL',
  'RENT',
  'SALARY',
  'UTILITIES',
  'TRANSPORT',
  'MARKETING',
  'MAINTENANCE',
  'OTHER',
];

const PAYMENT_OPTIONS = ['CASH', 'BKASH', 'NAGAD', 'CARD', 'BANK', 'OTHER'];

export default function ExpenseScreen() {
  const {
    createExpense,
    getExpenses,
    refreshAll,
    refreshing,
  } = useAppData();

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('GENERAL');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [note, setNote] = useState('');
  const [expenseDate, setExpenseDate] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const nextRows = await getExpenses({ limit: 200 });
      setRows(nextRows || []);
    } finally {
      setLoading(false);
    }
  }, [getExpenses]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    const amountValue = Number(amount);
    if (!title.trim()) {
      Alert.alert('Required', 'Expense title is required.');
      return;
    }

    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      Alert.alert('Required', 'Enter a valid expense amount.');
      return;
    }

    if (saving) {
      return;
    }

    try {
      setSaving(true);
      await createExpense({
        title: title.trim(),
        amount: amountValue,
        category,
        paymentMethod,
        note: note.trim() || null,
        expenseDate: expenseDate.trim() || null,
      });

      setTitle('');
      setAmount('');
      setCategory('GENERAL');
      setPaymentMethod('CASH');
      setNote('');
      setExpenseDate('');

      await refreshAll();
      await load();
      Alert.alert('Saved', 'Expense recorded successfully.');
    } catch (error) {
      Alert.alert('Failed', error?.message || 'Unable to save expense.');
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
            <Text style={styles.title}>Expense Manager</Text>
            <Text style={styles.subtitle}>Add expense entries and auto-post cash outflow journal.</Text>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>New Expense</Text>
              <AppInput value={title} onChangeText={setTitle} placeholder="Expense title" />
              <AppInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="Amount" />
              <AppInput
                value={expenseDate}
                onChangeText={setExpenseDate}
                placeholder="Expense date (optional ISO, e.g., 2026-01-31)"
              />

              <Text style={styles.label}>Category</Text>
              <View style={styles.pickerWrap}>
                <Picker selectedValue={category} onValueChange={(value) => setCategory(String(value))}>
                  {CATEGORY_OPTIONS.map((option) => (
                    <Picker.Item key={`expense-category-${option}`} label={option} value={option} />
                  ))}
                </Picker>
              </View>

              <Text style={styles.label}>Payment Method</Text>
              <View style={styles.pickerWrap}>
                <Picker selectedValue={paymentMethod} onValueChange={(value) => setPaymentMethod(String(value))}>
                  {PAYMENT_OPTIONS.map((option) => (
                    <Picker.Item key={`expense-method-${option}`} label={option} value={option} />
                  ))}
                </Picker>
              </View>

              <AppInput value={note} onChangeText={setNote} placeholder="Note (optional)" />

              <View style={styles.buttonRow}>
                <AppButton title={saving ? 'Saving...' : 'Save Expense'} onPress={handleSave} disabled={saving} style={styles.buttonFlex} />
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

            <Text style={styles.sectionTitle}>Recent Expenses</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.emptyText}>{loading ? 'Loading...' : 'No expenses recorded.'}</Text>}
        renderItem={({ item }) => (
          <AppCard style={styles.rowCard}>
            <View style={styles.rowHeader}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowAmount}>{formatMoney(item.amount)}</Text>
            </View>
            <Text style={styles.meta}>{item.category} | {item.payment_method || 'N/A'}</Text>
            <Text style={styles.meta}>{item.expense_date || 'N/A'}</Text>
            <Text style={styles.meta}>{item.note || 'No note'}</Text>
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
  rowCard: { gap: 4 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '700', color: UI_COLORS.textPrimary },
  rowAmount: { fontSize: 15, fontWeight: '700', color: UI_COLORS.textDanger },
  meta: { fontSize: 13, color: UI_COLORS.textSecondary },
  emptyText: { fontSize: 14, color: UI_COLORS.textMuted },
});
