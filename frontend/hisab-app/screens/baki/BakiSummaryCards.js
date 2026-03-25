import { StyleSheet, Text, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';

export default function BakiSummaryCards({ totalRows, totalDue, creditCount, paymentCount }) {
  return (
    <View style={styles.summaryRow}>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Customers</Text>
        <Text style={styles.summaryValue}>{totalRows}</Text>
      </View>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Due Total</Text>
        <Text style={styles.summaryValue}>৳{Number(totalDue || 0).toFixed(2)}</Text>
      </View>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Credit / Payment Txn</Text>
        <Text style={styles.summaryValue}>{creditCount} / {paymentCount}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  summaryCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    backgroundColor: UI_COLORS.surface,
    padding: 10,
  },
  summaryLabel: { fontSize: 12, color: UI_COLORS.textMuted },
  summaryValue: { marginTop: 4, fontSize: 14, fontWeight: '700', color: UI_COLORS.textPrimary },
});
