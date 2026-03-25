import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';

function KpiCard({ title, value, icon, tone = 'primary' }) {
  const toneStyles =
    tone === 'success'
      ? [styles.kpiCard, styles.successCard]
      : tone === 'warning'
        ? [styles.kpiCard, styles.warningCard]
        : tone === 'danger'
          ? [styles.kpiCard, styles.dangerCard]
          : [styles.kpiCard, styles.primaryCard];

  return (
    <View style={toneStyles}>
      <View style={styles.kpiTopRow}>
        <Text style={styles.kpiTitle}>{title}</Text>
        <MaterialIcons name={icon} size={16} color={UI_COLORS.textSecondary} />
      </View>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

export default function BakiKpiDashboard({
  rangeOptions,
  selectedRange,
  onSelectRange,
  loading,
  kpis,
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Performance Insights</Text>
        {loading ? <ActivityIndicator size="small" color={UI_COLORS.primary} /> : null}
      </View>

      <View style={styles.rangeRow}>
        {rangeOptions.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[styles.rangeChip, selectedRange === option.value && styles.rangeChipActive]}
            onPress={() => onSelectRange(option.value)}
          >
            <Text style={[styles.rangeChipText, selectedRange === option.value && styles.rangeChipTextActive]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.grid}>
        <KpiCard title="Total Credit" value={`৳${Number(kpis.totalCredit || 0).toFixed(2)}`} icon="add-card" tone="warning" />
        <KpiCard
          title="Total Payments"
          value={`৳${Number(kpis.totalPayments || 0).toFixed(2)}`}
          icon="payments"
          tone="success"
        />
        <KpiCard
          title="Net Balance Change"
          value={`৳${Number(kpis.netBalanceChange || 0).toFixed(2)}`}
          icon="account-balance-wallet"
          tone={Number(kpis.netBalanceChange || 0) >= 0 ? 'danger' : 'success'}
        />
        <KpiCard
          title="Transactions"
          value={String(Math.max(0, Number(kpis.numberOfTransactions || 0)))}
          icon="receipt-long"
          tone="primary"
        />
        <KpiCard
          title="Avg Daily Credit"
          value={`৳${Number(kpis.averageDailyCredit || 0).toFixed(2)}`}
          icon="calendar-month"
          tone="warning"
        />
        <KpiCard
          title="Avg Payment"
          value={`৳${Number(kpis.averagePayment || 0).toFixed(2)}`}
          icon="price-check"
          tone="success"
        />
        <KpiCard
          title="Top Customer"
          value={kpis.topCustomerName ? `${kpis.topCustomerName} (৳${Number(kpis.topCustomerCredit || 0).toFixed(2)})` : 'N/A'}
          icon="emoji-events"
          tone="primary"
        />
        <KpiCard
          title="Collection Rate"
          value={`${Number(kpis.collectionRate || 0).toFixed(1)}%`}
          icon="query-stats"
          tone="primary"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 10,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 12,
    backgroundColor: UI_COLORS.surface,
    padding: 12,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  rangeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  rangeChip: {
    borderRadius: 99,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  rangeChipActive: {
    backgroundColor: '#E7EEFF',
  },
  rangeChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: UI_COLORS.textSecondary,
  },
  rangeChipTextActive: {
    color: UI_COLORS.primary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  kpiCard: {
    width: '48.5%',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    minHeight: 76,
  },
  primaryCard: {
    borderColor: '#C7D7FF',
    backgroundColor: '#F5F8FF',
  },
  successCard: {
    borderColor: '#BBF7D0',
    backgroundColor: '#ECFDF3',
  },
  warningCard: {
    borderColor: '#FDE68A',
    backgroundColor: '#FEF9C3',
  },
  dangerCard: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  kpiTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  kpiTitle: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: UI_COLORS.textSecondary,
  },
  kpiValue: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '800',
    color: UI_COLORS.textPrimary,
  },
});
