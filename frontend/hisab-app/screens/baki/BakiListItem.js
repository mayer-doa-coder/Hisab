import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';

export default function BakiListItem({ item, onStartPayment }) {
  const dueAmount = Math.max(0, Number(item.due_amount || 0));
  const hasDue = dueAmount > 0;

  return (
    <View style={styles.card}>
      <View style={styles.cardTopRow}>
        <Text style={styles.rowTitle}>{item.customer_name}</Text>
        <Text style={[styles.statusBadge, hasDue ? styles.unpaidBadge : styles.paidBadge]}>
          {hasDue ? 'Due' : 'Clear'}
        </Text>
      </View>

      <Text style={styles.meta}>Current Due: ৳{dueAmount.toFixed(2)}</Text>
      <Text style={styles.meta}>Credits: {Number(item.credit_count || 0)}</Text>
      <Text style={styles.meta}>Payments: {Number(item.payment_count || 0)}</Text>
      <Text style={styles.date}>Last Activity: {item.last_activity_at || 'N/A'}</Text>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.paidButton, !hasDue && styles.disabledButton]}
          onPress={() => onStartPayment(item)}
          disabled={!hasDue}
        >
          <Text style={styles.paidButtonText}>{hasDue ? 'Record Payment' : 'No Payment Needed'}</Text>
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
  disabledButton: { opacity: 0.5 },
});
