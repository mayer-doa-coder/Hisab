import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton, AppCard, AppInput } from '../components/ui';
import { UI_COLORS } from '../constants/ui-theme';
import { useAppData } from '../context/AppDataContext';

const formatMoney = (value) => `৳${Number(value || 0).toFixed(2)}`;

export default function ProfitReportScreen() {
  const {
    getProfitReport,
    getProductMarginReport,
    refreshAll,
    refreshing,
  } = useAppData();

  const [days, setDays] = useState('30');
  const [report, setReport] = useState(null);
  const [margins, setMargins] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const daysValue = Number(days);
    const normalizedDays = Number.isInteger(daysValue) && daysValue > 0 ? daysValue : 30;

    setLoading(true);
    try {
      const [nextReport, nextMargins] = await Promise.all([
        getProfitReport({ days: normalizedDays }),
        getProductMarginReport({ days: normalizedDays, limit: 40 }),
      ]);

      setReport(nextReport || null);
      setMargins(nextMargins || []);
    } finally {
      setLoading(false);
    }
  }, [days, getProductMarginReport, getProfitReport]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={report?.timeline || []}
        keyExtractor={(item) => `${item.date}`}
        contentContainerStyle={styles.container}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>লাভ রিপোর্ট</Text>
            <Text style={styles.subtitle}>আয়, খরচ, ব্যয় এবং পণ্যভিত্তিক মার্জিন।</Text>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>সময়কাল</Text>
              <AppInput value={days} onChangeText={setDays} keyboardType="number-pad" placeholder="দিন (যেমন: ৩০)" />
              <View style={styles.buttonRow}>
                <AppButton title={loading ? 'লোড হচ্ছে...' : 'Apply'} onPress={load} style={styles.buttonFlex} />
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

            {report?.summary ? (
              <AppCard style={styles.card}>
                <Text style={styles.sectionTitle}>সারসংক্ষেপ</Text>
                <Text style={styles.meta}>Revenue: {formatMoney(report.summary.revenue)}</Text>
                <Text style={styles.meta}>COGS: {formatMoney(report.summary.cogs)}</Text>
                <Text style={styles.meta}>Gross Profit: {formatMoney(report.summary.gross_profit)}</Text>
                <Text style={styles.meta}>Expenses: {formatMoney(report.summary.expenses)}</Text>
                <Text style={styles.meta}>Net Profit: {formatMoney(report.summary.net_profit)}</Text>
                <Text style={styles.meta}>Net Margin: {Number(report.summary.net_margin_pct || 0).toFixed(2)}%</Text>
              </AppCard>
            ) : null}

            <Text style={styles.sectionTitle}>দৈনিক ধারা</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.emptyText}>{loading ? 'লোড হচ্ছে...' : 'কোনো রিপোর্ট ডেটা নেই।'}</Text>}
        renderItem={({ item }) => (
          <AppCard style={styles.rowCard}>
            <Text style={styles.rowTitle}>{item.date}</Text>
            <Text style={styles.meta}>Revenue: {formatMoney(item.revenue)} | COGS: {formatMoney(item.cogs)}</Text>
            <Text style={styles.meta}>Expenses: {formatMoney(item.expenses)} | Net: {formatMoney(item.net_profit)}</Text>
          </AppCard>
        )}
        ListFooterComponent={
          margins.length ? (
            <View style={styles.footerWrap}>
              <Text style={styles.sectionTitle}>পণ্যভিত্তিক মার্জিন অবদান</Text>
              {margins.map((row) => (
                <AppCard key={`margin-row-${row.product_id}`} style={styles.rowCard}>
                  <Text style={styles.rowTitle}>{row.product_name}</Text>
                  <Text style={styles.meta}>Units: {row.units_sold} | Revenue: {formatMoney(row.revenue)}</Text>
                  <Text style={styles.meta}>Gross Profit: {formatMoney(row.gross_profit)} | Margin: {Number(row.margin_pct || 0).toFixed(2)}%</Text>
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
  buttonRow: { flexDirection: 'row', gap: 10 },
  buttonFlex: { flex: 1 },
  rowCard: { gap: 4 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: UI_COLORS.textPrimary },
  meta: { fontSize: 13, color: UI_COLORS.textSecondary },
  emptyText: { fontSize: 14, color: UI_COLORS.textMuted },
  footerWrap: { marginTop: 10, gap: 8 },
});
