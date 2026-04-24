import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';

export default function BakiListItem({ item, onStartPayment }) {
  const dueAmount = Math.max(0, Number(item.due_amount || 0));
  const hasDue = dueAmount > 0;

  return (
    <View style={styles.card}>
      <View style={styles.cardTopRow}>
        <View style={styles.customerInfo}>
          <Text style={styles.rowTitle}>{item.customer_name}</Text>
          {item.customer_phone ? (
            <Text style={styles.rowPhone}>{item.customer_phone}</Text>
          ) : null}
        </View>
        <Text style={[styles.statusBadge, hasDue ? styles.unpaidBadge : styles.paidBadge]}>
          {hasDue ? 'বাকি আছে' : 'পরিষ্কার'}
        </Text>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>বর্তমান বাকি</Text>
          <Text style={[styles.metaValue, hasDue && styles.metaValueDanger]}>
            ৳{dueAmount.toFixed(2)}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>বাকি এন্ট্রি</Text>
          <Text style={styles.metaValue}>{Number(item.credit_count || 0)}</Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>পেমেন্ট</Text>
          <Text style={styles.metaValue}>{Number(item.payment_count || 0)}</Text>
        </View>
      </View>

      {item.last_activity_at ? (
        <Text style={styles.date}>শেষ লেনদেন: {item.last_activity_at}</Text>
      ) : null}

      {hasDue && (
        <TouchableOpacity style={styles.payBtn} onPress={() => onStartPayment(item)} activeOpacity={0.82}>
          <Text style={styles.payBtnText}>জমা নিন</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 12,
    padding: 14,
    backgroundColor: UI_COLORS.surface,
    gap: 8,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  customerInfo: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16, fontWeight: '700', color: UI_COLORS.textPrimary },
  rowPhone: { fontSize: 12, color: UI_COLORS.textMuted },
  statusBadge: {
    fontSize: 11,
    borderRadius: 99,
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontWeight: '700',
    overflow: 'hidden',
  },
  paidBadge: { backgroundColor: UI_COLORS.surfaceSuccess, color: UI_COLORS.textSuccess },
  unpaidBadge: { backgroundColor: UI_COLORS.surfaceDanger, color: UI_COLORS.textDanger },
  metaRow: {
    flexDirection: 'row',
    gap: 0,
  },
  metaItem: {
    flex: 1,
    alignItems: 'center',
  },
  metaLabel: { fontSize: 11, color: UI_COLORS.textMuted, fontWeight: '600' },
  metaValue: { fontSize: 15, fontWeight: '700', color: UI_COLORS.textPrimary, marginTop: 2 },
  metaValueDanger: { color: UI_COLORS.textDanger },
  date: { fontSize: 11, color: UI_COLORS.textMuted },
  payBtn: {
    backgroundColor: UI_COLORS.success,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 2,
  },
  payBtnText: { color: UI_COLORS.textOnPrimary, fontSize: 14, fontWeight: '700' },
});
