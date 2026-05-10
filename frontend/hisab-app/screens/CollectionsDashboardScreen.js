import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UI_COLORS } from '../constants/ui-theme';
import { useAppData } from '../context/AppDataContext';

const money = (value) => `৳${Number(value || 0).toFixed(2)}`;

export default function CollectionsDashboardScreen() {
  const { getCollectionsDashboardData, refreshing, refreshAll } = useAppData();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadDashboard = useCallback(async () => {
  try {
    setLoading(true);
    const next = await getCollectionsDashboardData();
    setDashboard(next || null);
  } catch (error) {
    Alert.alert(
      'লোড ব্যর্থ',
      error?.message || 'কালেকশন ড্যাশবোর্ড লোড করা যায়নি।'
    );
  } finally {
    setLoading(false);
  }
}, [getCollectionsDashboardData]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const topCustomers = useMemo(() => {
    const rows = Array.isArray(dashboard?.customers) ? dashboard.customers : [];
    return rows.slice(0, 8);
  }, [dashboard]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>সংগ্রহ ড্যাশবোর্ড</Text>
            <Text style={styles.subtitle}>মেয়াদোত্তীর্ণ বাকি, বয়স ভিত্তিক বিশ্লেষণ।</Text>
          </View>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={async () => {
              await refreshAll();
              await loadDashboard();
            }}
          >
            <Text style={styles.refreshText}>{loading || refreshing ? 'লোড হচ্ছে...' : 'রিফ্রেশ'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.grid}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>বকেয়া</Text>
            <Text style={styles.cardValue}>{money(dashboard?.total_outstanding)}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>মেয়াদোত্তীর্ণ</Text>
            <Text style={styles.cardValue}>{money(dashboard?.total_overdue)}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>সংগ্রহের হার</Text>
            <Text style={styles.cardValue}>{Number(dashboard?.collection_rate || 0).toFixed(2)}%</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>মুলতুবি প্রতিশ্রুতি</Text>
            <Text style={styles.cardValue}>{Number(dashboard?.pending_promises?.count || 0)}</Text>
          </View>
        </View>

        <View style={styles.cardBlock}>
          <Text style={styles.sectionTitle}>বয়স ভিত্তিক বাকি</Text>
          {['0_30', '31_60', '61_90', '90_plus'].map((key) => (
            <View key={key} style={styles.row}>
              <Text style={styles.rowLabel}>{key.replace('_', '-')} days</Text>
              <Text style={styles.rowValue}>{money(dashboard?.aging_buckets?.[key])}</Text>
            </View>
          ))}
        </View>

        <View style={styles.cardBlock}>
          <Text style={styles.sectionTitle}>সেগমেন্ট স্ন্যাপশট</Text>
          {['low', 'medium', 'high'].map((segment) => (
            <View key={segment} style={styles.row}>
              <Text style={styles.rowLabel}>{segment.toUpperCase()}</Text>
              <Text style={styles.rowValue}>
                {Number(dashboard?.segment_summary?.[segment]?.customers || 0)} cust | {money(dashboard?.segment_summary?.[segment]?.outstanding)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.cardBlock}>
          <Text style={styles.sectionTitle}>সর্বোচ্চ বাকি কাস্টমার</Text>
          {topCustomers.length === 0 ? (
            <Text style={styles.empty}>এখনো কোনো কাস্টমার ডেটা নেই।</Text>
          ) : (
            topCustomers.map((row) => (
              <View key={`top-customer-${row.customer_id}`} style={styles.row}>
                <Text style={styles.rowLabel}>{row.name}</Text>
                <Text style={styles.rowValue}>{money(row.current_balance)}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: UI_COLORS.background },
  container: { padding: 16, gap: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 26, fontWeight: '700', color: UI_COLORS.textPrimary },
  subtitle: { marginTop: 4, fontSize: 13, color: UI_COLORS.textSecondary },
  refreshButton: {
    backgroundColor: UI_COLORS.surfaceSubtle,
    borderColor: UI_COLORS.borderSoft,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  refreshText: { color: UI_COLORS.primary, fontSize: 12, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    width: '48%',
    backgroundColor: UI_COLORS.surface,
    borderColor: UI_COLORS.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  cardTitle: { color: UI_COLORS.textSecondary, fontSize: 12 },
  cardValue: { color: UI_COLORS.textPrimary, fontSize: 18, fontWeight: '700', marginTop: 3 },
  cardBlock: {
    backgroundColor: UI_COLORS.surface,
    borderColor: UI_COLORS.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  sectionTitle: { color: UI_COLORS.textPrimary, fontSize: 16, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.borderSoft,
    paddingBottom: 6,
  },
  rowLabel: { color: UI_COLORS.textSecondary, fontSize: 13 },
  rowValue: { color: UI_COLORS.textPrimary, fontSize: 13, fontWeight: '600' },
  empty: { color: UI_COLORS.textMuted, fontSize: 13 },
});
