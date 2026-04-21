import { StyleSheet, Text, View } from 'react-native';

import { UI_COLORS } from '../constants/ui-theme';
import { AppCard, AppInput } from './ui';

const PAYMENT_METHOD_OPTIONS = ['CASH', 'BKASH', 'NAGAD', 'MIXED'];

const parseAmount = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function PaymentSelector({
  totalAmount = 0,
  paymentMode = 'CASH',
  onPaymentModeChange,
  splitPayments = { cash: '', bkash: '', nagad: '' },
  onSplitPaymentsChange,
}) {
  const total = Number(totalAmount || 0);
  const mixedTotal = parseAmount(splitPayments.cash) + parseAmount(splitPayments.bkash) + parseAmount(splitPayments.nagad);
  const due = Number((total - mixedTotal).toFixed(2));

  return (
    <AppCard style={styles.card}>
      <Text style={styles.heading}>Payment</Text>
      <View style={styles.methodRow}>
        {PAYMENT_METHOD_OPTIONS.map((method) => (
          <Text
            key={method}
            style={[styles.chip, paymentMode === method ? styles.chipActive : null]}
            onPress={() => onPaymentModeChange?.(method)}
          >
            {method}
          </Text>
        ))}
      </View>

      {paymentMode === 'MIXED' ? (
        <View style={styles.splitWrap}>
          <Text style={styles.label}>Cash</Text>
          <AppInput
            value={splitPayments.cash}
            onChangeText={(value) => onSplitPaymentsChange?.({ ...splitPayments, cash: value })}
            keyboardType="decimal-pad"
            placeholder="0"
          />

          <Text style={styles.label}>bKash</Text>
          <AppInput
            value={splitPayments.bkash}
            onChangeText={(value) => onSplitPaymentsChange?.({ ...splitPayments, bkash: value })}
            keyboardType="decimal-pad"
            placeholder="0"
          />

          <Text style={styles.label}>Nagad</Text>
          <AppInput
            value={splitPayments.nagad}
            onChangeText={(value) => onSplitPaymentsChange?.({ ...splitPayments, nagad: value })}
            keyboardType="decimal-pad"
            placeholder="0"
          />

          <Text style={[styles.dueText, Math.abs(due) > 0.009 ? styles.dueWarning : null]}>
            Remaining: ৳{due.toFixed(2)}
          </Text>
        </View>
      ) : null}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 8,
  },
  heading: {
    fontSize: 17,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  methodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.surface,
    color: UI_COLORS.textSecondary,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    fontSize: 12,
    fontWeight: '700',
  },
  chipActive: {
    borderColor: UI_COLORS.primary,
    backgroundColor: UI_COLORS.surfaceInfo,
    color: UI_COLORS.primary,
  },
  splitWrap: {
    gap: 6,
    marginTop: 4,
  },
  label: {
    fontSize: 12,
    color: UI_COLORS.textSecondary,
    fontWeight: '700',
  },
  dueText: {
    marginTop: 4,
    fontSize: 12,
    color: UI_COLORS.textSuccess,
    fontWeight: '700',
  },
  dueWarning: {
    color: UI_COLORS.textDanger,
  },
});
