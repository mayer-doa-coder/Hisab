import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';

const isCodeExpired = (expiresAt) => {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
};

export default function BakiListItem({ item, onStartPayment, onShowPaymentCode }) {
  const dueAmount = Math.max(0, Number(item.due_amount || 0));
  const hasDue = dueAmount > 0;
  const paymentCode = item.latest_payment_code || null;
  const codeExpired = isCodeExpired(item.latest_payment_code_expires_at);
  const hasActiveCode = paymentCode && !codeExpired;

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

      {/* Payment code display */}
      {hasDue && paymentCode ? (
        <View style={[styles.codeRow, codeExpired && styles.codeRowExpired]}>
          <View style={styles.codeInfo}>
            <MaterialIcons
              name={codeExpired ? 'timer-off' : 'lock'}
              size={14}
              color={codeExpired ? UI_COLORS.textDanger : UI_COLORS.primary}
            />
            <Text style={styles.codeLabel}>পেমেন্ট কোড:</Text>
            <Text style={[styles.codeValue, codeExpired && styles.codeValueExpired]}>
              {paymentCode}
            </Text>
            {codeExpired && <Text style={styles.expiredTag}>মেয়াদ শেষ</Text>}
          </View>
        </View>
      ) : null}

      {/* Action buttons */}
      <View style={styles.actionRow}>
        {hasDue && paymentCode ? (
          <TouchableOpacity
            style={[styles.codeBtn, codeExpired && styles.codeBtnExpired]}
            onPress={() => onShowPaymentCode(item)}
            activeOpacity={0.82}
          >
            <MaterialIcons
              name="qr-code"
              size={16}
              color={codeExpired ? UI_COLORS.textMuted : UI_COLORS.primary}
            />
            <Text style={[styles.codeBtnText, codeExpired && styles.codeBtnTextExpired]}>
              কাস্টমারকে কোড দেখান
            </Text>
          </TouchableOpacity>
        ) : null}

        {hasDue && (
          <TouchableOpacity
            style={[styles.payBtn, hasActiveCode && styles.payBtnWithCode]}
            onPress={() => onStartPayment(item)}
            activeOpacity={0.82}
          >
            <Text style={styles.payBtnText}>জমা নিন</Text>
          </TouchableOpacity>
        )}
      </View>
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
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF4FF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: UI_COLORS.primary,
  },
  codeRowExpired: {
    backgroundColor: UI_COLORS.surfaceDanger,
    borderColor: UI_COLORS.borderDanger,
  },
  codeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    flexWrap: 'wrap',
  },
  codeLabel: {
    fontSize: 12,
    color: UI_COLORS.textSecondary,
    fontWeight: '600',
  },
  codeValue: {
    fontSize: 16,
    fontWeight: '900',
    color: UI_COLORS.primary,
    letterSpacing: 3,
  },
  codeValueExpired: {
    color: UI_COLORS.textDanger,
  },
  expiredTag: {
    fontSize: 10,
    color: UI_COLORS.textDanger,
    fontWeight: '700',
    backgroundColor: UI_COLORS.surfaceDanger,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  codeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: UI_COLORS.primary,
    borderRadius: 10,
    paddingVertical: 10,
  },
  codeBtnExpired: {
    borderColor: UI_COLORS.border,
  },
  codeBtnText: {
    color: UI_COLORS.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  codeBtnTextExpired: {
    color: UI_COLORS.textMuted,
  },
  payBtn: {
    flex: 1,
    backgroundColor: UI_COLORS.success,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  payBtnWithCode: {
    flex: 0.6,
  },
  payBtnText: { color: UI_COLORS.textOnPrimary, fontSize: 14, fontWeight: '700' },
});
