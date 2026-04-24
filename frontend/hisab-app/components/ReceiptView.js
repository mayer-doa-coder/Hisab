import { StyleSheet, Text, View } from 'react-native';

import { UI_COLORS } from '../constants/ui-theme';
import { AppCard } from './ui';

const formatMoney = (value) => `৳${Number(value || 0).toFixed(2)}`;

const formatDateTime = (value) => {
  const parsed = new Date(value || '');
  if (Number.isNaN(parsed.getTime())) {
    return 'অজানা';
  }

  return parsed.toISOString().replace('T', ' ').slice(0, 16);
};

export default function ReceiptView({ receipt }) {
  if (!receipt) {
    return null;
  }

  return (
    <View style={styles.root}>
      <AppCard style={styles.card}>
        <Text style={styles.receiptId}>{receipt.receipt_id}</Text>
        <Text style={styles.meta}>সময়: {formatDateTime(receipt.timestamp)}</Text>
        <Text style={styles.meta}>কাস্টমার: {receipt.customer_name || 'ওয়াক-ইন'}</Text>
        <Text style={styles.meta}>পেমেন্ট পদ্ধতি: {receipt.payment_mode}</Text>
        <Text style={styles.meta}>স্ট্যাটাস: {String(receipt.status || '').toUpperCase()}</Text>
        {receipt.note ? <Text style={styles.meta}>নোট: {receipt.note}</Text> : null}
      </AppCard>

      <AppCard style={styles.card}>
        <Text style={styles.sectionTitle}>পণ্যসমূহ</Text>
        {(receipt.items || []).map((item) => (
          <View key={`receipt-item-${item.id}`} style={styles.lineRow}>
            <View style={styles.lineLeft}>
              <Text style={styles.lineName}>{item.product_name}</Text>
              <Text style={styles.lineMeta}>
                {item.quantity} x {formatMoney(item.unit_price)}
              </Text>
            </View>
            <Text style={styles.lineAmount}>{formatMoney(item.subtotal)}</Text>
          </View>
        ))}
      </AppCard>

      <AppCard style={styles.card}>
        <Text style={styles.sectionTitle}>পেমেন্টসমূহ</Text>
        {(receipt.payments || []).map((payment) => (
          <View key={`receipt-payment-${payment.id}`} style={styles.paymentRow}>
            <Text style={styles.lineMeta}>
              {payment.method} ({payment.status})
            </Text>
            <Text style={styles.lineAmount}>{formatMoney(payment.amount)}</Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>মোট</Text>
          <Text style={styles.totalAmount}>{formatMoney(receipt.total_amount)}</Text>
        </View>
      </AppCard>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 10,
  },
  card: {
    gap: 8,
  },
  receiptId: {
    fontSize: 18,
    fontWeight: '800',
    color: UI_COLORS.textPrimary,
  },
  meta: {
    fontSize: 12,
    color: UI_COLORS.textSecondary,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  lineLeft: {
    flex: 1,
  },
  lineName: {
    fontSize: 13,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  lineMeta: {
    fontSize: 12,
    color: UI_COLORS.textSecondary,
  },
  lineAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: UI_COLORS.primary,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  totalRow: {
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: UI_COLORS.borderSoft,
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: UI_COLORS.primary,
  },
});
