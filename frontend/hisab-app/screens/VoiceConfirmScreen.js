import { StyleSheet, Text, View } from 'react-native';

import VoiceStepScreen from '../components/voice/VoiceStepScreen';
import { AppButton, AppCard } from '../components/ui';
import { UI_COLORS } from '../constants/ui-theme';

const INTENT_LABELS = {
  baki:    'বাকি রেকর্ড',
  joma:    'জমা',
  becha:   'বিক্রি',
  kinbo:   'কেনা',
  balance: 'হিসাব দেখা',
};

const HIGH_RISK_AMOUNT = 50000;

const Row = ({ label, value, highlight }) => (
  <View style={styles.row}>
    <Text style={styles.rowKey}>{label}</Text>
    <Text style={[styles.rowValue, highlight && styles.rowValueHighlight]}>{value || '-'}</Text>
  </View>
);

export default function VoiceConfirmScreen({
  summary,
  feedback,
  onConfirm,
  onCancel,
  onBack,
}) {
  const intentLabel = INTENT_LABELS[String(summary?.intent || '')] || summary?.intent || '-';
  const amount      = Number(summary?.amount || 0);
  const isHighRisk  = amount >= HIGH_RISK_AMOUNT;

  const amountDisplay = amount > 0
    ? `৳${amount.toLocaleString('bn-BD')}`
    : '-';

  return (
    <VoiceStepScreen
      stepLabel="Step 6/6"
      promptBn="নিশ্চিত করুন"
      promptEn="Confirm this action"
      feedback={feedback}
    >
      <AppCard style={styles.summaryCard}>
        <Row label="কাজ"     value={intentLabel} />
        <Row label="নাম"     value={summary?.name} />
        <Row label="পরিমাণ"  value={amountDisplay} highlight={isHighRisk} />
        {summary?.date ? <Row label="তারিখ" value={summary.date} /> : null}
      </AppCard>

      {isHighRisk ? (
        <View style={styles.riskBadge}>
          <Text style={styles.riskBadgeText}>⚠ বড় লেনদেন — নিশ্চিত হওয়ার আগে যাচাই করুন</Text>
        </View>
      ) : null}

      <View style={styles.buttonRow}>
        <AppButton
          title={isHighRisk ? `নিশ্চিত · ${amountDisplay}` : 'হ্যাঁ, নিশ্চিত'}
          onPress={onConfirm}
          style={[styles.confirmButton, isHighRisk && styles.confirmButtonHighRisk]}
        />
      </View>

      <View style={styles.buttonRow}>
        <AppButton
          variant="secondary"
          title="না, বাতিল"
          onPress={onCancel}
          style={styles.secondaryButton}
        />
        <AppButton
          variant="secondary"
          title="পিছে যান"
          onPress={onBack}
          style={styles.secondaryButton}
        />
      </View>
    </VoiceStepScreen>
  );
}

const styles = StyleSheet.create({
  summaryCard: {
    gap: 10,
    backgroundColor: UI_COLORS.surfaceSoft,
    borderColor: UI_COLORS.borderSoft,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.borderSoft,
  },
  rowKey: {
    fontSize: 13,
    fontWeight: '700',
    color: UI_COLORS.textSecondary,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  rowValueHighlight: {
    color: UI_COLORS.textDanger,
    fontSize: 16,
  },
  riskBadge: {
    backgroundColor: UI_COLORS.surfaceDanger,
    borderColor: UI_COLORS.borderDanger,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  riskBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: UI_COLORS.textDanger,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  confirmButton: {
    flex: 1,
    minHeight: 52,
  },
  confirmButtonHighRisk: {
    backgroundColor: UI_COLORS.danger,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
  },
});
