import { Picker } from '@react-native-picker/picker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import { UI_COLORS } from '../constants/ui-theme';
import { useAppData } from '../context/AppDataContext';
import SalesHistoryItem from '../components/SalesHistoryItem';
import { AppCard, AppInput } from '../components/ui';

const PAYMENT_FILTERS = ['ALL', 'CASH', 'BKASH', 'NAGAD', 'MIXED'];

const DATE_PRESETS = [
  { key: 'TODAY', label: 'Today', days: 0 },
  { key: 'LAST_7', label: '7 Days', days: 6 },
  { key: 'LAST_30', label: '30 Days', days: 29 },
  { key: 'ALL', label: 'All', days: null },
];

const buildDateWindow = (days) => {
  if (days === null || days === undefined) {
    return { fromDateIso: null, toDateIso: null };
  }

  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - Number(days));

  return {
    fromDateIso: from.toISOString(),
    toDateIso: to.toISOString(),
  };
};

export default function SalesHistoryScreen() {
  const navigation = useNavigation();
  const { products, customers, getSalesHistory } = useAppData();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [productId, setProductId] = useState('');
  const [paymentMode, setPaymentMode] = useState('ALL');
  const [datePreset, setDatePreset] = useState('LAST_7');

  const activeRange = useMemo(() => {
    const preset = DATE_PRESETS.find((item) => item.key === datePreset) || DATE_PRESETS[1];
    return buildDateWindow(preset.days);
  }, [datePreset]);

  const loadRows = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getSalesHistory({
        limit: 300,
        fromDateIso: activeRange.fromDateIso,
        toDateIso: activeRange.toDateIso,
        customerId: customerId ? Number(customerId) : null,
        productId: productId ? Number(productId) : null,
        paymentMode: paymentMode === 'ALL' ? null : paymentMode,
        searchText,
      });
      setRows(data);
    } finally {
      setLoading(false);
    }
  }, [activeRange.fromDateIso, activeRange.toDateIso, customerId, getSalesHistory, paymentMode, productId, searchText]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadRows();
    setRefreshing(false);
  }, [loadRows]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={rows}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={UI_COLORS.primary} />}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>Sales History</Text>
            <Text style={styles.subtitle}>Filter by date, customer, product, payment, or receipt id.</Text>

            <AppCard style={styles.filterCard}>
              <Text style={styles.label}>Search</Text>
              <AppInput value={searchText} onChangeText={setSearchText} placeholder="Receipt, customer, or note" />

              <Text style={styles.label}>Customer</Text>
              <View style={styles.pickerWrap}>
                <Picker selectedValue={customerId} onValueChange={(value) => setCustomerId(String(value))}>
                  <Picker.Item label="All Customers" value="" />
                  {customers.map((item) => (
                    <Picker.Item key={`sales-history-customer-${item.id}`} label={String(item.name || '')} value={String(item.id)} />
                  ))}
                </Picker>
              </View>

              <Text style={styles.label}>Product</Text>
              <View style={styles.pickerWrap}>
                <Picker selectedValue={productId} onValueChange={(value) => setProductId(String(value))}>
                  <Picker.Item label="All Products" value="" />
                  {products.map((item) => (
                    <Picker.Item key={`sales-history-product-${item.id}`} label={String(item.name || '')} value={String(item.id)} />
                  ))}
                </Picker>
              </View>

              <Text style={styles.label}>Payment</Text>
              <View style={styles.rowWrap}>
                {PAYMENT_FILTERS.map((method) => (
                  <TouchableOpacity
                    key={`payment-filter-${method}`}
                    style={[styles.filterChip, paymentMode === method ? styles.filterChipActive : null]}
                    onPress={() => setPaymentMode(method)}
                  >
                    <Text style={[styles.filterChipText, paymentMode === method ? styles.filterChipTextActive : null]}>{method}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Date Range</Text>
              <View style={styles.rowWrap}>
                {DATE_PRESETS.map((preset) => (
                  <TouchableOpacity
                    key={`date-preset-${preset.key}`}
                    style={[styles.filterChip, datePreset === preset.key ? styles.filterChipActive : null]}
                    onPress={() => setDatePreset(preset.key)}
                  >
                    <Text style={[styles.filterChipText, datePreset === preset.key ? styles.filterChipTextActive : null]}>
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.secondaryButton} onPress={loadRows}>
                  <Text style={styles.secondaryButtonText}>Apply Filters</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => {
                    setSearchText('');
                    setCustomerId('');
                    setProductId('');
                    setPaymentMode('ALL');
                    setDatePreset('LAST_7');
                  }}
                >
                  <Text style={styles.secondaryButtonText}>Reset</Text>
                </TouchableOpacity>
              </View>
            </AppCard>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color={UI_COLORS.primary} />
              <Text style={styles.emptyText}>Loading sales history...</Text>
            </View>
          ) : (
            <Text style={styles.emptyText}>No sales found for current filters.</Text>
          )
        }
        renderItem={({ item }) => (
          <SalesHistoryItem
            item={item}
            onOpenReceipt={() => navigation.navigate('Receipt', { saleId: item.id })}
            onReprint={() => navigation.navigate('Receipt', { saleId: item.id, autoShare: true })}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: UI_COLORS.background,
  },
  container: {
    padding: 14,
    paddingBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: UI_COLORS.textPrimary,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 10,
    fontSize: 13,
    color: UI_COLORS.textSecondary,
  },
  filterCard: {
    gap: 8,
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: UI_COLORS.textSecondary,
  },
  pickerWrap: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: UI_COLORS.surface,
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.surface,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  filterChipActive: {
    borderColor: UI_COLORS.primary,
    backgroundColor: UI_COLORS.surfaceInfo,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: UI_COLORS.textSecondary,
  },
  filterChipTextActive: {
    color: UI_COLORS.primary,
  },
  buttonRow: {
    marginTop: 4,
    flexDirection: 'row',
    gap: 8,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
    borderRadius: 10,
    backgroundColor: UI_COLORS.surfaceSubtle,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  secondaryButtonText: {
    color: UI_COLORS.primary,
    fontWeight: '700',
    fontSize: 12,
  },
  emptyState: {
    marginTop: 20,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    marginTop: 8,
    fontSize: 13,
    color: UI_COLORS.textMuted,
    textAlign: 'center',
  },
});
