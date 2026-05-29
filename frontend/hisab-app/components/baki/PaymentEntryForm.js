import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import CustomerChipSelector from '../../components/customers/CustomerChipSelector';

import { AppButton, AppCard, AppInput } from '../../components/ui';
import { UI_COLORS } from '../../constants/ui-theme';
import { SPACING } from '../../theme/spacing';
import { TYPOGRAPHY } from '../../theme/typography';

const PAYMENT_METHODS = [
  { label: 'নগদ', value: 'cash' },
  { label: 'বিকাশ', value: 'bkash' },
  { label: 'নগাদ', value: 'nagad' },
  { label: 'ব্যাংক', value: 'bank' },
];

export default function PaymentEntryForm({
  customers,
  customerId,
  setCustomerId,
  paymentAmount,
  setPaymentAmount,
  paymentNote,
  setPaymentNote,
  paymentMethod,
  setPaymentMethod,
  currentDue,
  onSave,
  saving,
  refreshing,
  onAddNew,
}) {
  const [showMore, setShowMore] = useState(false);

  return (
    <AppCard style={styles.formWrap}>
      <Text style={styles.formTitle}>পেমেন্ট নিন</Text>

      {/* ── Essential fields ─────────────────────────── */}
      <Text style={styles.label}>কাস্টমার *</Text>
      <CustomerChipSelector customers={customers} selectedId={customerId} onSelect={setCustomerId} onAddNew={onAddNew} />

      {customerId ? (
        <View style={styles.dueHintCard}>
          <Text style={styles.dueHintText}>বর্তমান বাকি: ৳{Number(currentDue || 0).toFixed(2)}</Text>
        </View>
      ) : null}

      <Text style={styles.label}>পরিমাণ *</Text>
      <AppInput
        value={paymentAmount}
        onChangeText={setPaymentAmount}
        placeholder="টাকার পরিমাণ লিখুন"
        style={styles.input}
        keyboardType="decimal-pad"
      />

      <Text style={styles.label}>পেমেন্ট পদ্ধতি</Text>
      <View style={styles.methodChips}>
        {PAYMENT_METHODS.map((m) => (
          <TouchableOpacity
            key={m.value}
            style={[styles.methodChip, paymentMethod === m.value && styles.methodChipActive]}
            activeOpacity={0.78}
            onPress={() => setPaymentMethod(m.value)}
          >
            <Text style={[styles.methodChipText, paymentMethod === m.value && styles.methodChipTextActive]}>
              {m.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Advanced toggle ──────────────────────────── */}
      <TouchableOpacity
        style={styles.moreToggle}
        onPress={() => setShowMore((v) => !v)}
        activeOpacity={0.75}
      >
        <MaterialIcons
          name={showMore ? 'expand-less' : 'expand-more'}
          size={18}
          color={UI_COLORS.primary}
        />
        <Text style={styles.moreToggleText}>
          {showMore ? 'কম দেখুন' : 'আরো অপশন'}
        </Text>
      </TouchableOpacity>

      {/* ── Advanced fields ──────────────────────────── */}
      {showMore && (
        <View style={styles.morePanel}>
          <Text style={styles.label}>নোট</Text>
          <AppInput
            value={paymentNote}
            onChangeText={setPaymentNote}
            placeholder="ঐচ্ছিক"
            style={styles.input}
          />
        </View>
      )}

      <AppButton
        title={saving ? 'সেভ হচ্ছে...' : 'পেমেন্ট নিন'}
        onPress={onSave}
        disabled={saving || refreshing || !customerId}
        style={styles.button}
      />
    </AppCard>
  );
}

const styles = StyleSheet.create({
  formWrap: {
    borderRadius: 12,
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  formTitle: { ...TYPOGRAPHY.subheading, fontWeight: '700', color: UI_COLORS.textPrimary },
  label: { ...TYPOGRAPHY.body, fontWeight: '600', color: UI_COLORS.textPrimary },
  input: {},
  button: { marginTop: SPACING.sm },

  moreToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  moreToggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: UI_COLORS.primary,
  },
  morePanel: {
    gap: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: UI_COLORS.borderSoft,
    paddingTop: SPACING.sm,
  },

  /* due hint */
  dueHintCard: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 8,
    backgroundColor: UI_COLORS.surfaceSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  dueHintText: { ...TYPOGRAPHY.small, color: UI_COLORS.primary, fontWeight: '700' },

  /* payment method chips */
  methodChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  methodChip: {
    flex: 1,
    minWidth: 64,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.surface,
  },
  methodChipActive: {
    backgroundColor: UI_COLORS.primary,
    borderColor: UI_COLORS.primary,
  },
  methodChipText: { fontSize: 14, fontWeight: '700', color: UI_COLORS.textSecondary },
  methodChipTextActive: { color: UI_COLORS.textOnPrimary },

  /* search */
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: UI_COLORS.surface,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: UI_COLORS.textPrimary,
    paddingVertical: 0,
  },
});
