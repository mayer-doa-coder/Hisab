import { StyleSheet, Text, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';

export default function ProductSummaryCards({ totalItems, totalQuantity, stockValue }) {
  return (
    <View style={styles.summaryRow}>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>পণ্য</Text>
        <Text style={styles.summaryValue}>{totalItems}</Text>
      </View>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>মোট পরিমাণ</Text>
        <Text style={styles.summaryValue}>{totalQuantity}</Text>
      </View>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>স্টক মূল্য</Text>
        <Text style={styles.summaryValue}>৳{Number(stockValue || 0).toFixed(2)}</Text>
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

