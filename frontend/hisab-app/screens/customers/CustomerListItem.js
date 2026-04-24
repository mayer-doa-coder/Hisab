import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';
import CustomerRiskBadge from './CustomerRiskBadge';

export default function CustomerListItem({ item, onEdit, onDelete }) {
  const totalDue = Number.isFinite(Number(item.total_due)) ? Math.max(0, Number(item.total_due)) : 0;
  const hasDue = totalDue > 0;
  const trustScore = Number.isFinite(Number(item.trust_score)) ? Number(item.trust_score) : null;
  const riskScore = Number.isFinite(Number(item.risk_score)) ? Number(item.risk_score) : null;

  return (
    <TouchableOpacity style={styles.card} onPress={() => onEdit(item)} activeOpacity={0.85}>
      <View style={styles.topRow}>
        <Text style={styles.customerName}>{item.name}</Text>
        <View style={styles.badgeStack}>
          <CustomerRiskBadge riskLevel={item.risk_level} compact />
          <Text style={[styles.badge, hasDue ? styles.badgeDue : styles.badgeNoDue]}>
            {hasDue ? 'বাকি আছে' : 'বাকি নেই'}
          </Text>
        </View>
      </View>
      <Text style={styles.meta}>ফোন: {item.phone || 'N/A'}</Text>
      {item.address ? <Text style={styles.meta}>ঠিকানা: {item.address}</Text> : null}
      <Text style={[styles.due, !hasDue && styles.dueClear]}>মোট বাকি: ৳{totalDue.toFixed(2)}</Text>
      <Text style={styles.meta}>লেনদেন: {Number(item.number_of_transactions || 0)} | দেরি: {Number(item.number_of_late_payments || 0)}</Text>
      {(trustScore !== null || riskScore !== null) ? (
        <Text style={styles.meta}>
          বিশ্বাস: {trustScore !== null ? `${trustScore}/100` : 'N/A'} | ঝুঁকি: {riskScore !== null ? `${riskScore}/100` : 'N/A'}
        </Text>
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
    borderRadius: 10,
    padding: 14,
    backgroundColor: UI_COLORS.surface,
    marginBottom: 10,
    gap: 4,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
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
  meta: { fontSize: 13, color: UI_COLORS.textSecondary },
  due: { fontSize: 15, fontWeight: '700', color: UI_COLORS.danger, marginTop: 2 },
  dueClear: { color: UI_COLORS.textSuccess },
  actionRow: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8,
  },
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
  editButtonText: {
    color: UI_COLORS.primary,
    fontSize: 13,
    fontWeight: '700',
  },
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
  deleteButtonText: {
    color: UI_COLORS.danger,
    fontSize: 13,
    fontWeight: '700',
  },
});
