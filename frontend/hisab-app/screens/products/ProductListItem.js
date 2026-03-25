import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';

export default function ProductListItem({ item, onEdit, onDelete }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTopRow}>
        <Text style={styles.rowTitle}>{item.name}</Text>
        <Text style={styles.badge}>ID {item.id}</Text>
      </View>
      <Text style={styles.meta}>Quantity: {item.quantity}</Text>
      <Text style={styles.meta}>Unit Price: ৳{Number(item.price).toFixed(2)}</Text>
      <Text style={styles.meta}>Value: ৳{(Number(item.quantity) * Number(item.price)).toFixed(2)}</Text>

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
  meta: { marginTop: 4, fontSize: 13, color: UI_COLORS.textSecondary },
  actionRow: { marginTop: 10, flexDirection: 'row', gap: 8 },
  editButton: {
    backgroundColor: '#E7EEFF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  editButtonText: { color: UI_COLORS.primary, fontSize: 12, fontWeight: '700' },
  deleteButton: {
    backgroundColor: '#FDECEC',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deleteButtonText: { color: UI_COLORS.danger, fontSize: 12, fontWeight: '700' },
});
