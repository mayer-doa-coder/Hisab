import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';

export default function CustomerListItem({ item, onEdit, onDelete }) {
  return (
    <View style={styles.card}>
      <Text style={styles.customerName}>{item.name}</Text>
      <Text style={styles.meta}>Phone: {item.phone || 'N/A'}</Text>
      <Text style={styles.meta}>Address: {item.address || 'N/A'}</Text>
      <Text style={styles.due}>Total Due: ৳{Number(item.total_due || 0).toFixed(2)}</Text>
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
  customerName: { fontSize: 16, fontWeight: '700', color: UI_COLORS.textPrimary },
  meta: { marginTop: 3, fontSize: 13, color: UI_COLORS.textSecondary },
  due: { marginTop: 6, fontSize: 14, fontWeight: '700', color: UI_COLORS.danger },
  actionRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    backgroundColor: '#E7EEFF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  editButtonText: {
    color: UI_COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  deleteButton: {
    backgroundColor: '#FDECEC',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deleteButtonText: {
    color: UI_COLORS.danger,
    fontSize: 12,
    fontWeight: '700',
  },
});
