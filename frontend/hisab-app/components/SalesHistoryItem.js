import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { UI_COLORS } from '../constants/ui-theme';

const formatMoney = (value) => `৳${Number(value || 0).toFixed(2)}`;

const formatDateTime = (value) => {
  const parsed = new Date(value || '');
  if (Number.isNaN(parsed.getTime())) {
    return 'অজানা';
  }

  return parsed.toISOString().replace('T', ' ').slice(0, 16);
};

export default function SalesHistoryItem({ item, onOpenReceipt, onReprint }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onOpenReceipt}>
      <View style={styles.rowBetween}>
        <Text style={styles.receipt}>{item.receipt_id}</Text>
        <Text style={styles.amount}>{formatMoney(item.total_amount)}</Text>
      </View>

      <Text style={styles.meta}>কাস্টমার: {item.customer_name || 'ওয়াক-ইন'}</Text>
      <Text style={styles.meta}>পেমেন্ট: {item.payment_mode}</Text>
      <Text style={styles.meta}>পণ্য: {Number(item.item_count || 0)}</Text>
      <Text style={styles.meta}>সময়: {formatDateTime(item.timestamp)}</Text>

      <TouchableOpacity style={styles.reprintButton} onPress={onReprint}>
        <MaterialIcons name="print" size={14} color={UI_COLORS.primary} />
        <Text style={styles.reprintText}>পুনরায় প্রিন্ট</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 12,
    backgroundColor: UI_COLORS.surface,
    padding: 12,
    gap: 4,
    marginBottom: 10,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  receipt: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  amount: {
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.primary,
  },
  meta: {
    fontSize: 12,
    color: UI_COLORS.textSecondary,
  },
  reprintButton: {
    marginTop: 4,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: UI_COLORS.borderInfo,
    backgroundColor: UI_COLORS.surfaceInfo,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reprintText: {
    color: UI_COLORS.primary,
    fontSize: 11,
    fontWeight: '700',
  },
});
