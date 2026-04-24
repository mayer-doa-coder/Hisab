import { StyleSheet, Text, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';

const formatDailyRate = (value) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return '0';
  }

  return numeric.toFixed(2);
};

const formatDaysRemaining = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === null) {
    return 'N/A';
  }

  return numeric.toFixed(1);
};

export default function ProductReorderSuggestions({ suggestions }) {
  const actionable = (suggestions || []).filter((item) => item.shouldReorder);

  return (
    <View style={styles.wrap}>
      <View style={styles.badgeWrap}>
        <Text style={styles.badgeText}>{actionable.length} items need reorder</Text>
      </View>

      <Text style={styles.sectionHeading}>পুনরায় অর্ডারের পরামর্শ</Text>
      {actionable.length === 0 ? (
        <Text style={styles.emptyText}>No reorder action required right now.</Text>
      ) : (
        actionable.map((item) => (
          <View key={`reorder-${item.productId}`} style={styles.rowCard}>
            <View style={styles.rowTop}>
              <Text style={styles.rowTitle}>{item.productName}</Text>
              <Text style={styles.qtyBadge}>Order {item.suggestedOrderQuantity}</Text>
            </View>
            <Text style={styles.rowMeta}>Current Qty: {item.quantity}</Text>
            <Text style={styles.rowMeta}>Daily Sales: {formatDailyRate(item.dailySalesRate)} units/day</Text>
            <Text style={styles.rowMeta}>Days Remaining: {formatDaysRemaining(item.daysRemaining)}</Text>
            <Text style={styles.rowMeta}>Reorder Point: {item.reorderPoint}</Text>
            <Text style={styles.reason}>{item.reason}</Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: UI_COLORS.surface,
    gap: 8,
  },
  badgeWrap: {
    alignSelf: 'flex-start',
    backgroundColor: UI_COLORS.surfaceSubtle,
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: { color: UI_COLORS.primary, fontSize: 12, fontWeight: '700' },
  sectionHeading: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  emptyText: { color: UI_COLORS.textMuted, fontSize: 13 },
  rowCard: {
    borderWidth: 1,
    borderColor: UI_COLORS.borderInfo,
    borderRadius: 10,
    padding: 10,
    backgroundColor: UI_COLORS.surfaceInfo,
    gap: 2,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
    flex: 1,
  },
  qtyBadge: {
    fontSize: 11,
    color: UI_COLORS.primary,
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: UI_COLORS.surfaceSubtle,
    fontWeight: '700',
  },
  rowMeta: {
    marginTop: 2,
    fontSize: 12,
    color: UI_COLORS.textSecondary,
  },
  reason: {
    marginTop: 4,
    fontSize: 12,
    color: UI_COLORS.textPrimary,
    fontWeight: '600',
  },
});

