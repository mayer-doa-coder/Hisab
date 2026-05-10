import { StyleSheet, Text, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';

const formatDateTime = (value) => {
  if (!value) {
    return 'N/A';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Invalid date';
  }

  return parsed.toISOString().replace('T', ' ').slice(0, 16);
};

export default function CustomerLedgerTimeline({ entries }) {
  return (
    <View style={styles.timelineWrap}>
      {(entries || []).map((item, index) => {
        const isCredit = item.event_type === 'credit';
        const signedAmount = `${isCredit ? '+' : '-'}৳${Math.abs(Number(item.amount_change || 0)).toFixed(2)}`;

        return (
          <View key={`ledger-${item.entry_id}-${item.event_type}-${index}`} style={styles.rowWrap}>
            <View style={[styles.dot, isCredit ? styles.dotBaki : styles.dotPayment]} />
            <View style={styles.card}>
              <View style={styles.rowTop}>
                <Text style={styles.rowTitle}>{isCredit ? 'CREDIT ADDED' : 'PAYMENT RECEIVED'}</Text>
                <Text style={[styles.amount, isCredit ? styles.amountBaki : styles.amountPayment]}>{signedAmount}</Text>
              </View>
              <Text style={styles.meta}>Date: {formatDateTime(item.event_at)}</Text>
              {item.note ? <Text style={styles.meta}>Note: {item.note}</Text> : null}
              <Text style={styles.runningDue}>Running Due: ৳{Number(item.running_due || 0).toFixed(2)}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  timelineWrap: {
    marginTop: 6,
    gap: 10,
  },
  rowWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 99,
    marginTop: 14,
  },
  dotBaki: {
    backgroundColor: UI_COLORS.textWarning,
  },
  dotPayment: {
    backgroundColor: UI_COLORS.textSuccess,
  },
  card: {
    flex: 1,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    backgroundColor: UI_COLORS.surface,
    padding: 12,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  rowTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: UI_COLORS.textSecondary,
  },
  amount: {
    fontSize: 13,
    fontWeight: '800',
  },
  amountBaki: {
    color: UI_COLORS.textWarning,
  },
  amountPayment: {
    color: UI_COLORS.textSuccess,
  },
  meta: {
    marginTop: 4,
    fontSize: 12,
    color: UI_COLORS.textSecondary,
  },
  runningDue: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '700',
    color: UI_COLORS.primary,
  },
});

