import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';
import CustomerRiskBadge from './CustomerRiskBadge';

export default function CustomerListItem({ item, onEdit, onDelete }) {
  const totalDue = Number.isFinite(Number(item.total_due)) ? Math.max(0, Number(item.total_due)) : 0;
  const hasDue = totalDue > 0;

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.customerName}>{item.name}</Text>
        <View style={styles.badgeStack}>
          <CustomerRiskBadge riskLevel={item.risk_level} compact />
          <Text style={[styles.badge, hasDue ? styles.badgeDue : styles.badgeNoDue]}>
            {hasDue ? 'Due' : 'No Due'}
          </Text>
        </View>
      </View>
      <Text style={styles.meta}>Phone: {item.phone || 'N/A'}</Text>
      <Text style={styles.meta}>Address: {item.address || 'N/A'}</Text>
      <Text style={[styles.due, !hasDue && styles.dueClear]}>Total Due: ৳{totalDue.toFixed(2)}</Text>
      <Text style={styles.meta}>Transactions: {Number(item.number_of_transactions || 0)}</Text>
      <Text style={styles.meta}>Late Payments: {Number(item.number_of_late_payments || 0)}</Text>
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
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  badgeStack: {
    alignItems: 'flex-end',
    gap: 6,
  },
  customerName: { fontSize: 16, fontWeight: '700', color: UI_COLORS.textPrimary },
  badge: {
    fontSize: 10,
    fontWeight: '700',
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  badgeDue: {
    color: UI_COLORS.textWarning,
    backgroundColor: UI_COLORS.surfaceWarning,
  },
  badgeNoDue: {
    color: UI_COLORS.textSuccess,
    backgroundColor: UI_COLORS.surfaceSuccess,
  },
  meta: { marginTop: 3, fontSize: 13, color: UI_COLORS.textSecondary },
  due: { marginTop: 6, fontSize: 14, fontWeight: '700', color: UI_COLORS.danger },
  dueClear: { color: UI_COLORS.textSuccess },
  actionRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    backgroundColor: UI_COLORS.surfaceSubtle,
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
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
    backgroundColor: UI_COLORS.surfaceDanger,
    borderWidth: 1,
    borderColor: UI_COLORS.borderDanger,
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

