import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';

const formatDateSafe = (dateString) => {
  if (!dateString) return null;
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

export default function ProductListItem({ item, onEdit, onDelete }) {
  const quantity = Number(item.quantity || 0);
  const threshold = Number.isFinite(Number(item.low_stock_threshold))
    ? Math.max(0, Math.trunc(Number(item.low_stock_threshold)))
    : 5;
  const isLowStock = quantity <= threshold;
  const expiryLabel = formatDateSafe(item.expiry_date);

  return (
    <TouchableOpacity style={styles.card} onPress={() => onEdit(item)} activeOpacity={0.85}>
      <View style={styles.cardTopRow}>
        <Text style={styles.rowTitle}>{item.name}</Text>
        <View style={styles.badgeRow}>
          {isLowStock ? <Text style={styles.lowStockBadge}>কম স্টক</Text> : null}
          <Text style={styles.badge}>#{item.id}</Text>
        </View>
      </View>

      <View style={styles.metaGrid}>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>পরিমাণ</Text>
          <Text style={[styles.metaValue, isLowStock && styles.metaValueWarn]}>{quantity}</Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>দাম</Text>
          <Text style={styles.metaValue}>৳{Number(item.price).toFixed(2)}</Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>মোট মূল্য</Text>
          <Text style={styles.metaValue}>৳{(quantity * Number(item.price)).toFixed(2)}</Text>
        </View>
      </View>

      {expiryLabel ? (
        <Text style={styles.expiry}>মেয়াদ: {expiryLabel}</Text>
      ) : null}

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.editButton} onPress={() => onEdit(item)} activeOpacity={0.8}>
          <Text style={styles.editButtonText}>সম্পাদন</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteButton} onPress={() => onDelete(item)} activeOpacity={0.8}>
          <Text style={styles.deleteButtonText}>মুছুন</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 12,
    padding: 14,
    backgroundColor: UI_COLORS.surface,
    marginBottom: 10,
    gap: 8,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowTitle: { fontSize: 16, fontWeight: '700', color: UI_COLORS.textPrimary, flex: 1, marginRight: 8 },
  badge: {
    fontSize: 11,
    color: UI_COLORS.textMuted,
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaGrid: {
    flexDirection: 'row',
    gap: 0,
  },
  metaItem: {
    flex: 1,
    alignItems: 'center',
  },
  metaLabel: { fontSize: 11, color: UI_COLORS.textMuted, fontWeight: '600' },
  metaValue: { fontSize: 14, fontWeight: '700', color: UI_COLORS.textPrimary, marginTop: 2 },
  metaValueWarn: { color: UI_COLORS.textWarning },
  lowStockBadge: {
    fontSize: 10,
    color: UI_COLORS.textWarning,
    backgroundColor: UI_COLORS.surfaceWarning,
    borderWidth: 1,
    borderColor: UI_COLORS.borderWarning,
    borderRadius: 99,
    paddingHorizontal: 7,
    paddingVertical: 3,
    fontWeight: '700',
  },
  expiry: { fontSize: 12, color: UI_COLORS.textMuted },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  editButton: {
    flex: 1,
    backgroundColor: UI_COLORS.surfaceSubtle,
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    minHeight: 40,
    justifyContent: 'center',
  },
  editButtonText: { color: UI_COLORS.primary, fontSize: 13, fontWeight: '700' },
  deleteButton: {
    flex: 1,
    backgroundColor: UI_COLORS.surfaceDanger,
    borderWidth: 1,
    borderColor: UI_COLORS.borderDanger,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    minHeight: 40,
    justifyContent: 'center',
  },
  deleteButtonText: { color: UI_COLORS.danger, fontSize: 13, fontWeight: '700' },
});
