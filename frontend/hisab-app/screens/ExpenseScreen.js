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

const PAYMENT_OPTIONS = [
  { value: 'CASH', label: 'নগদ' },
  { value: 'BKASH', label: 'বিকাশ' },
  { value: 'NAGAD', label: 'নগাদ' },
  { value: 'CARD', label: 'কার্ড' },
  { value: 'BANK', label: 'ব্যাংক' },
  { value: 'OTHER', label: 'অন্যান্য' },
];

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
      Alert.alert('প্রয়োজনীয়', 'খরচের শিরোনাম দিন।');
      return;
    }

    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      Alert.alert('প্রয়োজনীয়', 'সঠিক পরিমাণ লিখুন।');
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
      Alert.alert('সফল', 'খরচ সেভ হয়েছে।');
    } catch (error) {
      Alert.alert('ব্যর্থ', error?.message || 'খরচ সেভ করা যায়নি।');
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
            <Text style={styles.title}>খরচ ব্যবস্থাপনা</Text>
            <Text style={styles.subtitle}>খরচ যোগ করুন এবং স্বয়ংক্রিয়ভাবে নগদ জার্নালে পোস্ট হবে।</Text>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>নতুন খরচ</Text>
              <AppInput value={title} onChangeText={setTitle} placeholder="খরচের শিরোনাম" />
              <AppInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="পরিমাণ" />
              <AppInput
                value={expenseDate}
                onChangeText={setExpenseDate}
                placeholder="তারিখ (ঐচ্ছিক, যেমন: ২০২৬-০১-৩১)"
              />

              <Text style={styles.label}>বিভাগ</Text>
              <View style={styles.pickerWrap}>
                <Picker selectedValue={category} onValueChange={(value) => setCategory(String(value))}>
                  {CATEGORY_OPTIONS.map((option) => (
                    <Picker.Item key={`expense-category-${option}`} label={option} value={option} />
                  ))}
                </Picker>
              </View>

              <Text style={styles.label}>পেমেন্ট পদ্ধতি</Text>
              <View style={styles.pickerWrap}>
                <Picker selectedValue={paymentMethod} onValueChange={(value) => setPaymentMethod(String(value))}>
                  {PAYMENT_OPTIONS.map((option) => (
                    <Picker.Item key={`expense-method-${option}`} label={option} value={option} />
                  ))}
                </Picker>
              </View>

              <AppInput value={note} onChangeText={setNote} placeholder="নোট (ঐচ্ছিক)" />

              <View style={styles.buttonRow}>
                <AppButton title={saving ? 'সেভ হচ্ছে...' : 'খরচ সেভ করুন'} onPress={handleSave} disabled={saving} style={styles.buttonFlex} />
                <AppButton
                  title={refreshing ? 'রিফ্রেশ হচ্ছে...' : 'রিফ্রেশ'}
                  variant="secondary"
                  style={styles.buttonFlex}
                  onPress={async () => {
                    await refreshAll();
                    await load();
                  }}
                />
              </View>
            </AppCard>

            <Text style={styles.sectionTitle}>সাম্প্রতিক খরচ</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.emptyText}>{loading ? 'লোড হচ্ছে...' : 'কোনো খরচ নেই।'}</Text>}
        renderItem={({ item }) => (
          <AppCard style={styles.rowCard}>
            <View style={styles.rowHeader}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowAmount}>{formatMoney(item.amount)}</Text>
            </View>
            <Text style={styles.meta}>{(CATEGORY_OPTIONS.find(o => o.value === item.category) || {label: item.category}).label} | {(PAYMENT_OPTIONS.find(o => o.value === item.payment_method) || {label: item.payment_method || 'অজানা'}).label}</Text>
            <Text style={styles.meta}>{item.expense_date || 'অজানা'}</Text>
            <Text style={styles.meta}>{item.note || 'নোট নেই'}</Text>
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
