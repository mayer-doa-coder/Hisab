import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';

export default function BakiListItem({ item, onUpdateStatus, onDelete }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTopRow}>
        <Text style={styles.rowTitle}>{item.customer_name}</Text>
        <Text
          style={[
            styles.statusBadge,
            item.status === 'paid' ? styles.paidBadge : item.status === 'partial' ? styles.partialBadge : styles.unpaidBadge,
          ]}
        >
          {item.status}
        </Text>
      </View>

      <Text style={styles.meta}>Amount: ৳{Number(item.amount).toFixed(2)}</Text>
      <Text style={styles.meta}>Paid: ৳{Number(item.paid_amount).toFixed(2)}</Text>
      <Text style={styles.meta}>Due: ৳{Number(item.due_amount).toFixed(2)}</Text>
      <Text style={styles.meta}>Note: {item.note || 'N/A'}</Text>
      <Text style={styles.date}>{item.created_at}</Text>

      <View style={styles.actionRow}>
        {item.status !== 'paid' ? (
          <TouchableOpacity style={styles.paidButton} onPress={() => onUpdateStatus(item, 'paid')}>
            <Text style={styles.paidButtonText}>Mark Paid</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.unpaidButton} onPress={() => onUpdateStatus(item, 'unpaid')}>
            <Text style={styles.unpaidButtonText}>Mark Unpaid</Text>
          </TouchableOpacity>
        )}

        {item.status !== 'partial' ? (
          <TouchableOpacity style={styles.partialButton} onPress={() => onUpdateStatus(item, 'partial')}>
            <Text style={styles.partialButtonText}>Mark Partial</Text>
          </TouchableOpacity>
        ) : null}

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
  statusBadge: {
    fontSize: 11,
    borderRadius: 99,
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontWeight: '700',
    overflow: 'hidden',
  },
  paidBadge: { backgroundColor: '#E8F8EF', color: '#166534' },
  partialBadge: { backgroundColor: '#FEF3C7', color: '#92400E' },
  unpaidBadge: { backgroundColor: '#FDECEC', color: UI_COLORS.danger },
  meta: { marginTop: 4, fontSize: 13, color: UI_COLORS.textSecondary },
  date: { marginTop: 5, fontSize: 12, color: UI_COLORS.textMuted },
  actionRow: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  paidButton: {
    backgroundColor: '#E8F8EF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  paidButtonText: { color: '#166534', fontSize: 12, fontWeight: '700' },
  unpaidButton: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  unpaidButtonText: { color: '#92400E', fontSize: 12, fontWeight: '700' },
  partialButton: {
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  partialButtonText: { color: '#B45309', fontSize: 12, fontWeight: '700' },
  deleteButton: {
    backgroundColor: '#FDECEC',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deleteButtonText: { color: UI_COLORS.danger, fontSize: 12, fontWeight: '700' },
});
