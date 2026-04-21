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
      Alert.alert('Required', 'Business date is required (YYYY-MM-DD).');
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
      Alert.alert('Closed', `Day ${businessDate} closed successfully.`);
    } catch (error) {
      Alert.alert('Day Close Failed', error?.message || 'Unable to close the business day.');
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
            <Text style={styles.title}>Day Close</Text>
            <Text style={styles.subtitle}>Finalize daily cash position and store reconciliation snapshot.</Text>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>Close Form</Text>
              <AppInput
                value={businessDate}
                onChangeText={setBusinessDate}
                placeholder="Business date (YYYY-MM-DD)"
              />
              <AppInput
                value={cashOnHand}
                onChangeText={setCashOnHand}
                keyboardType="decimal-pad"
                placeholder="Cash on hand (optional)"
              />
              <AppInput value={note} onChangeText={setNote} placeholder="Closing note (optional)" />

              <View style={styles.buttonRow}>
                <AppButton
                  title={closing ? 'Closing...' : 'Close Day'}
                  onPress={handleCloseDay}
                  disabled={closing}
                  style={styles.buttonFlex}
                />
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

            {snapshot ? (
              <AppCard style={styles.card}>
                <Text style={styles.sectionTitle}>Snapshot ({snapshot.business_date})</Text>
                <Text style={styles.meta}>Opening: {formatMoney(snapshot.opening_balance)}</Text>
                <Text style={styles.meta}>Inflow: {formatMoney(snapshot.total_in)}</Text>
                <Text style={styles.meta}>Outflow: {formatMoney(snapshot.total_out)}</Text>
                <Text style={styles.meta}>Expected Closing: {formatMoney(snapshot.closing_balance)}</Text>
                {snapshot.existing_close ? (
                  <Text style={styles.meta}>
                    Closed: {formatMoney(snapshot.existing_close.cash_on_hand)} | Variance: {formatMoney(snapshot.existing_close.variance)}
                  </Text>
                ) : null}
              </AppCard>
            ) : null}

            <Text style={styles.sectionTitle}>Recent Day Closes</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.emptyText}>{loading ? 'Loading...' : 'No day close records yet.'}</Text>}
        renderItem={({ item }) => (
          <AppCard style={styles.rowCard}>
            <Text style={styles.rowTitle}>{item.business_date}</Text>
            <Text style={styles.meta}>Opening: {formatMoney(item.opening_balance)} | Closing: {formatMoney(item.closing_balance)}</Text>
            <Text style={styles.meta}>Cash: {formatMoney(item.cash_on_hand)} | Variance: {formatMoney(item.variance)}</Text>
            <Text style={styles.meta}>Status: {item.status.toUpperCase()}</Text>
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
  buttonRow: { flexDirection: 'row', gap: 10 },
  buttonFlex: { flex: 1 },
  rowCard: { gap: 4 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: UI_COLORS.textPrimary },
  meta: { fontSize: 13, color: UI_COLORS.textSecondary },
  emptyText: { fontSize: 14, color: UI_COLORS.textMuted },
});
