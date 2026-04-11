import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';

const formatDateSafe = (dateString) => {
  if (!dateString) {
    return 'N/A';
  }

  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) {
    return 'Invalid date';
  }

  return parsed.toISOString().slice(0, 10);
};

export default function ProductListItem({ item, onEdit, onDelete }) {
  const quantity = Number(item.quantity || 0);
  const threshold = Number.isFinite(Number(item.low_stock_threshold))
    ? Math.max(0, Math.trunc(Number(item.low_stock_threshold)))
    : 5;
  const isLowStock = quantity <= threshold;

  return (
    <View style={styles.card}>
      <View style={styles.cardTopRow}>
        <Text style={styles.rowTitle}>{item.name}</Text>
        <View style={styles.badgeRow}>
          {isLowStock ? <Text style={styles.lowStockBadge}>Low Stock</Text> : null}
          <Text style={styles.badge}>ID {item.id}</Text>
        </View>
      </View>
      <Text style={styles.meta}>Quantity: {item.quantity}</Text>
      <Text style={styles.meta}>Low Stock Threshold: {threshold}</Text>
      <Text style={styles.meta}>Unit Price: ৳{Number(item.price).toFixed(2)}</Text>
      <Text style={styles.meta}>Value: ৳{(Number(item.quantity) * Number(item.price)).toFixed(2)}</Text>
      <Text style={styles.meta}>Expiry: {formatDateSafe(item.expiry_date)}</Text>

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.editButton} onPress={() => onEdit(item)}>
          <Text style={styles.editButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteButton} onPress={() => onDelete(item)}>
          <Text style={styles.deleteButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    padding: 12,
    backgroundColor: UI_COLORS.surface,
    marginBottom: 10,
  },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowTitle: { fontSize: 16, fontWeight: '700', color: UI_COLORS.textPrimary },
  badge: {
    fontSize: 11,
    color: UI_COLORS.textMuted,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  meta: { marginTop: 4, fontSize: 13, color: UI_COLORS.textSecondary },
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
  actionRow: { marginTop: 10, flexDirection: 'row', gap: 8 },
  editButton: {
    backgroundColor: UI_COLORS.surfaceSubtle,
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  editButtonText: { color: UI_COLORS.primary, fontSize: 12, fontWeight: '700' },
  deleteButton: {
    backgroundColor: UI_COLORS.surfaceDanger,
    borderWidth: 1,
    borderColor: UI_COLORS.borderDanger,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deleteButtonText: { color: UI_COLORS.danger, fontSize: 12, fontWeight: '700' },
});

