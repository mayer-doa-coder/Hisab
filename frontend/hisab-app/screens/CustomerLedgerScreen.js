import { Picker } from '@react-native-picker/picker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UI_COLORS } from '../constants/ui-theme';
import { useAppData } from '../context/AppDataContext';
import CustomerLedgerTimeline from './customers/CustomerLedgerTimeline';
import CustomerRiskBadge from './customers/CustomerRiskBadge';
import {
  applyLedgerFilter,
  buildLedgerTimeline,
  getLedgerSummary,
  LEDGER_FILTERS,
  normalizeLedgerRows,
} from '../services/customers/customerLedgerUtils';

export default function CustomerLedgerScreen() {
  const { customers, getCustomerLedger } = useAppData();

  const [customerId, setCustomerId] = useState('');
  const [filterType, setFilterType] = useState(LEDGER_FILTERS.ALL);
  const [loading, setLoading] = useState(false);
  const [rawLedgerRows, setRawLedgerRows] = useState([]);

  useEffect(() => {
    if (!customers.length) {
      setCustomerId('');
      setRawLedgerRows([]);
      return;
    }

    if (!customerId || !customers.some((item) => Number(item.id) === Number(customerId))) {
      setCustomerId(String(customers[0].id));
    }
  }, [customers, customerId]);

  const loadLedger = useCallback(async (nextCustomerId) => {
    if (!nextCustomerId) {
      setRawLedgerRows([]);
      return;
    }

    try {
      setLoading(true);
      const rows = await getCustomerLedger(Number(nextCustomerId));
      setRawLedgerRows(normalizeLedgerRows(rows));
    } catch (error) {
      Alert.alert('Load Failed', error?.message || 'Unable to load customer ledger.');
    } finally {
      setLoading(false);
    }
  }, [getCustomerLedger]);

  useEffect(() => {
    loadLedger(customerId);
  }, [customerId, loadLedger]);

  const filteredRows = useMemo(() => applyLedgerFilter(rawLedgerRows, filterType), [rawLedgerRows, filterType]);
  const timelineRows = useMemo(() => buildLedgerTimeline(filteredRows), [filteredRows]);
  const summary = useMemo(() => getLedgerSummary(rawLedgerRows), [rawLedgerRows]);
  const selectedCustomer = useMemo(
    () => customers.find((item) => Number(item.id) === Number(customerId)) || null,
    [customers, customerId]
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>Customer Ledger</Text>
          <Text style={styles.subtitle}>Complete timeline of baki and payments with running due balance.</Text>

          {customers.length === 0 ? (
            <Text style={styles.emptyText}>No customers found.</Text>
          ) : (
            <>
              <Text style={styles.label}>Customer</Text>
              <View style={styles.pickerWrap}>
                <Picker selectedValue={customerId} onValueChange={(value) => setCustomerId(String(value))}>
                  {customers.map((customer) => (
                    <Picker.Item
                      key={`ledger-customer-${customer.id}`}
                      label={`${customer.name} (${customer.phone || 'No phone'})`}
                      value={String(customer.id)}
                    />
                  ))}
                </Picker>
              </View>

              <View style={styles.summaryRow}>
                <Text style={[styles.summaryBadge, styles.summaryBaki]}>Baki: ৳{summary.totalBaki.toFixed(2)}</Text>
                <Text style={[styles.summaryBadge, styles.summaryPayment]}>
                  Payments: ৳{summary.totalPayments.toFixed(2)}
                </Text>
                <Text style={[styles.summaryBadge, styles.summaryDue]}>Closing Due: ৳{summary.closingDue.toFixed(2)}</Text>
              </View>

              {selectedCustomer ? (
                <View style={styles.riskCard}>
                  <View style={styles.riskTopRow}>
                    <Text style={styles.riskTitle}>Trust / Risk Indicator</Text>
                    <CustomerRiskBadge riskLevel={selectedCustomer.risk_level} />
                  </View>
                  <Text style={styles.riskMeta}>Trust Score: {Number(selectedCustomer.trust_score || 0)}/100</Text>
                  <Text style={styles.riskMeta}>Risk Score: {Number(selectedCustomer.risk_score || 0)}/100</Text>
                  <Text style={styles.riskMeta}>
                    Avg Payment Delay: {selectedCustomer.average_payment_delay ?? 'N/A'} days
                  </Text>
                  {(selectedCustomer.risk_reasons || []).map((reason, index) => (
                    <Text key={`risk-reason-${index}`} style={styles.riskReason}>• {reason}</Text>
                  ))}
                </View>
              ) : null}

              <View style={styles.filterRow}>
                <TouchableOpacity
                  style={[styles.filterChip, filterType === LEDGER_FILTERS.ALL && styles.filterChipActive]}
                  onPress={() => setFilterType(LEDGER_FILTERS.ALL)}
                >
                  <Text style={[styles.filterText, filterType === LEDGER_FILTERS.ALL && styles.filterTextActive]}>All</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterChip, filterType === LEDGER_FILTERS.BAKI && styles.filterChipActive]}
                  onPress={() => setFilterType(LEDGER_FILTERS.BAKI)}
                >
                  <Text style={[styles.filterText, filterType === LEDGER_FILTERS.BAKI && styles.filterTextActive]}>
                    Only Baki
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterChip, filterType === LEDGER_FILTERS.PAYMENTS && styles.filterChipActive]}
                  onPress={() => setFilterType(LEDGER_FILTERS.PAYMENTS)}
                >
                  <Text style={[styles.filterText, filterType === LEDGER_FILTERS.PAYMENTS && styles.filterTextActive]}>
                    Only Payments
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.headerRow}>
                <Text style={styles.sectionTitle}>Timeline</Text>
                <TouchableOpacity style={styles.refreshButton} onPress={() => loadLedger(customerId)}>
                  <Text style={styles.refreshText}>{loading ? 'Loading...' : 'Reload'}</Text>
                </TouchableOpacity>
              </View>

              {timelineRows.length === 0 ? (
                <Text style={styles.emptyText}>{loading ? 'Loading ledger...' : 'No transactions for this filter.'}</Text>
              ) : (
                <CustomerLedgerTimeline entries={timelineRows} />
              )}
            </>
          )}
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
  subtitle: { marginTop: 4, fontSize: 13, color: UI_COLORS.textSecondary, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '700', color: UI_COLORS.textPrimary },
  pickerWrap: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    backgroundColor: UI_COLORS.surface,
    overflow: 'hidden',
    marginTop: 6,
  },
  summaryRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryBadge: {
    fontSize: 12,
    fontWeight: '700',
    borderRadius: 99,
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  summaryBaki: {
    backgroundColor: UI_COLORS.surfaceWarning,
    color: UI_COLORS.textWarning,
  },
  summaryPayment: {
    backgroundColor: UI_COLORS.surfaceSuccess,
    color: UI_COLORS.textSuccess,
  },
  summaryDue: {
    backgroundColor: UI_COLORS.surfaceInfo,
    color: UI_COLORS.primary,
  },
  riskCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    backgroundColor: UI_COLORS.surface,
    padding: 12,
    gap: 4,
  },
  riskTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  riskTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  riskMeta: {
    fontSize: 12,
    color: UI_COLORS.textSecondary,
  },
  riskReason: {
    marginTop: 1,
    fontSize: 12,
    color: UI_COLORS.textPrimary,
  },
  filterRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    borderRadius: 99,
    backgroundColor: UI_COLORS.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  filterChipActive: {
    backgroundColor: UI_COLORS.surfaceSubtle,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '700',
    color: UI_COLORS.textSecondary,
  },
  filterTextActive: {
    color: UI_COLORS.primary,
  },
  headerRow: {
    marginTop: 14,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: { fontSize: 19, fontWeight: '700', color: UI_COLORS.textPrimary },
  refreshButton: {
    backgroundColor: UI_COLORS.surfaceSubtle,
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  refreshText: { color: UI_COLORS.primary, fontSize: 12, fontWeight: '600' },
  emptyText: { fontSize: 14, color: UI_COLORS.textMuted },
});
