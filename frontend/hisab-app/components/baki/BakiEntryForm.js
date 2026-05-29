import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import CustomerChipSelector from '../../components/customers/CustomerChipSelector';
import { AppButton, AppCard, AppInput } from '../../components/ui';
import { UI_COLORS } from '../../constants/ui-theme';
import { SPACING } from '../../theme/spacing';
import { TYPOGRAPHY } from '../../theme/typography';

export default function BakiEntryForm({
  customers,
  customerId,
  setCustomerId,
  amount,
  setAmount,
  note,
  setNote,
  onSave,
  saving,
  refreshing,
  onAddNew,
}) {
  const [showMore, setShowMore] = useState(false);

  return (
    <AppCard style={styles.formWrap}>
      <Text style={styles.formTitle}>বাকি যোগ করুন</Text>

      {/* ── Essential fields ─────────────────────────── */}
      <Text style={styles.label}>কাস্টমার *</Text>
      <CustomerChipSelector customers={customers} selectedId={customerId} onSelect={setCustomerId} onAddNew={onAddNew} />

      <Text style={styles.label}>পরিমাণ *</Text>
      <AppInput
        value={amount}
        onChangeText={setAmount}
        placeholder="টাকার পরিমাণ লিখুন"
        style={styles.input}
        keyboardType="decimal-pad"
      />

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
            value={note}
            onChangeText={setNote}
            placeholder="ঐচ্ছিক"
            style={styles.input}
          />
        </View>
      )}

      <AppButton
        title={saving ? 'সেভ হচ্ছে...' : 'বাকি দিন'}
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
