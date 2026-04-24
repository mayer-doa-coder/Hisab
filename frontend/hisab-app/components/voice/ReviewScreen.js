import { StyleSheet, Text, View } from 'react-native';

import { AppButton, AppCard } from '../ui';
import { UI_COLORS } from '../../constants/ui-theme';

const Row = ({ label, value }) => (
  <View style={styles.row}>
    <Text style={styles.key}>{label}</Text>
    <Text style={styles.value}>{value || '-'}</Text>
  </View>
);

export default function ReviewScreen({
  summary,
  onEditName,
  onEditAmount,
  onEditDate,
  onRetryVoice,
  onNext,
}) {
  return (
    <AppCard style={styles.card}>
      <Text style={styles.title}>সারসংক্ষেপ</Text>
      <Row label="কাজ" value={summary?.intent} />
      <Row label="নাম" value={summary?.name} />
      <Row label="পরিমাণ" value={summary?.amount ? `৳${summary.amount}` : '-'} />
      <Row label="তারিখ" value={summary?.date} />

      <View style={styles.actionRow}>
        <AppButton variant="secondary" title="নাম বদলান" onPress={onEditName} style={styles.smallButton} />
        <AppButton variant="secondary" title="পরিমাণ বদলান" onPress={onEditAmount} style={styles.smallButton} />
        <AppButton variant="secondary" title="তারিখ বদলান" onPress={onEditDate} style={styles.smallButton} />
      </View>
      <View style={styles.actionRow}>
        <AppButton variant="secondary" title="আবার বলুন" onPress={onRetryVoice} style={styles.smallButton} />
        <AppButton title="পরবর্তী" onPress={onNext} style={styles.smallButton} />
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
  },
  title: {
    fontSize: 18,
    color: UI_COLORS.textPrimary,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.borderSoft,
    paddingBottom: 7,
  },
  key: {
    fontSize: 13,
    fontWeight: '700',
    color: UI_COLORS.textSecondary,
  },
  value: {
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  smallButton: {
    minHeight: 44,
    paddingVertical: 10,
  },
});
