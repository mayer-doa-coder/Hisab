import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton, AppCard, AppInput } from '../components/ui';
import { UI_COLORS } from '../constants/ui-theme';
import { useAppData } from '../context/AppDataContext';

const formatMoney = (value) => `৳${Number(value || 0).toFixed(2)}`;

export default function DayCloseScreen() {
  const {
    getDayCloseSnapshot,
    closeBusinessDay,
    getDayCloseReports,
    refreshAll,
    refreshing,
  } = useAppData();

  const [businessDate, setBusinessDate] = useState(new Date().toISOString().slice(0, 10));
  const [cashOnHand, setCashOnHand] = useState('');
  const [note, setNote] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextSnapshot, nextHistory] = await Promise.all([
        getDayCloseSnapshot({ businessDate }),
        getDayCloseReports({ limit: 40 }),
      ]);

      setSnapshot(nextSnapshot || null);
      setHistory(nextHistory || []);
    } finally {
      setLoading(false);
    }
  }, [businessDate, getDayCloseReports, getDayCloseSnapshot]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCloseDay = async () => {
    if (!businessDate.trim()) {
      Alert.alert('প্রয়োজনীয়', 'ব্যবসার তারিখ দিন (বছর-মাস-দিন)।');
      return;
    }

    if (closing) {
      return;
    }

    try {
      setClosing(true);
      await closeBusinessDay({
        businessDate,
        cashOnHand: cashOnHand.trim() ? Number(cashOnHand) : null,
        note: note.trim() || null,
      });

      setCashOnHand('');
      setNote('');
      await refreshAll();
      await load();
      Alert.alert('সম্পন্ন', `${businessDate} দিন সফলভাবে বন্ধ হয়েছে।`);
    } catch (error) {
      Alert.alert('দিন বন্ধ ব্যর্থ', error?.message || 'Unable to close the business day.');
    } finally {
      setClosing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={history}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.container}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>দিন বন্ধ</Text>
            <Text style={styles.subtitle}>দৈনিক নগদ অবস্থান চূড়ান্ত করুন।</Text>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>বন্ধ ফর্ম</Text>
              <AppInput
                value={businessDate}
                onChangeText={setBusinessDate}
                placeholder="ব্যবসার তারিখ (বছর-মাস-দিন)"
              />
              <AppInput
                value={cashOnHand}
                onChangeText={setCashOnHand}
                keyboardType="decimal-pad"
                placeholder="হাতে নগদ (ঐচ্ছিক)"
              />
              <AppInput value={note} onChangeText={setNote} placeholder="বন্ধের নোট (ঐচ্ছিক)" />

              <View style={styles.buttonRow}>
                <AppButton
                  title={closing ? 'বন্ধ হচ্ছে...' : 'দিন বন্ধ করুন'}
                  onPress={handleCloseDay}
                  disabled={closing}
                  style={styles.buttonFlex}
                />
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

            {snapshot ? (
              <AppCard style={styles.card}>
                <Text style={styles.sectionTitle}>দিনের সারসংক্ষেপ ({snapshot.business_date})</Text>
                <Text style={styles.meta}>খোলা: {formatMoney(snapshot.opening_balance)}</Text>
                <Text style={styles.meta}>আয়: {formatMoney(snapshot.total_in)}</Text>
                <Text style={styles.meta}>ব্যয়: {formatMoney(snapshot.total_out)}</Text>
                <Text style={styles.meta}>প্রত্যাশিত বন্ধ: {formatMoney(snapshot.closing_balance)}</Text>
                {snapshot.existing_close ? (
                  <Text style={styles.meta}>
                    বন্ধ নগদ: {formatMoney(snapshot.existing_close.cash_on_hand)} | পার্থক্য: {formatMoney(snapshot.existing_close.variance)}
                  </Text>
                ) : null}
              </AppCard>
            ) : null}

            <Text style={styles.sectionTitle}>সাম্প্রতিক দিন বন্ধ</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.emptyText}>{loading ? 'লোড হচ্ছে...' : 'এখনো কোনো দিন বন্ধ রেকর্ড নেই।'}</Text>}
        renderItem={({ item }) => (
          <AppCard style={styles.rowCard}>
            <Text style={styles.rowTitle}>{item.business_date}</Text>
            <Text style={styles.meta}>খোলা: {formatMoney(item.opening_balance)} | বন্ধ: {formatMoney(item.closing_balance)}</Text>
            <Text style={styles.meta}>নগদ: {formatMoney(item.cash_on_hand)} | পার্থক্য: {formatMoney(item.variance)}</Text>
            <Text style={styles.meta}>অবস্থা: {item.status.toUpperCase()}</Text>
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
  buttonRow: { flexDirection: 'row', gap: 10 },
  buttonFlex: { flex: 1 },
  rowCard: { gap: 4 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: UI_COLORS.textPrimary },
  meta: { fontSize: 13, color: UI_COLORS.textSecondary },
  emptyText: { fontSize: 14, color: UI_COLORS.textMuted },
});
