import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { AppButton, AppCard, AppInput } from '../../components/ui';
import { UI_COLORS } from '../../constants/ui-theme';
import { SPACING } from '../../theme/spacing';
import { TYPOGRAPHY } from '../../theme/typography';

export default function CustomerForm({
  editingCustomerId,
  name,
  phone,
  address,
  creditLimit,
  dueTermsDays,
  setName,
  setPhone,
  setAddress,
  setCreditLimit,
  setDueTermsDays,
  onSave,
  onCancel,
  saving,
}) {
  const [showMore, setShowMore] = useState(false);

  return (
    <AppCard style={styles.formWrap}>
      {/* ── Essential fields ─────────────────────────── */}
      <View style={styles.formGroup}>
        <Text style={styles.label}>নাম *</Text>
        <AppInput
          value={name}
          onChangeText={setName}
          placeholder="কাস্টমারের নাম লিখুন"
          autoCapitalize="words"
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>ফোন নম্বর</Text>
        <AppInput
          value={phone}
          onChangeText={setPhone}
          placeholder="০১XXXXXXXXX"
          keyboardType="phone-pad"
        />
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
          <View style={styles.formGroup}>
            <Text style={styles.label}>ঠিকানা</Text>
            <AppInput
              value={address}
              onChangeText={setAddress}
              placeholder="ঐচ্ছিক"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>সর্বোচ্চ বাকির সীমা</Text>
            <AppInput
              value={creditLimit}
              onChangeText={setCreditLimit}
              placeholder="০.০০"
              keyboardType="decimal-pad"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>কত দিনে বাকি শোধ?</Text>
            <AppInput
              value={dueTermsDays}
              onChangeText={setDueTermsDays}
              placeholder="৩০"
              keyboardType="number-pad"
            />
          </View>
        </View>
      )}

      <AppButton
        style={styles.button}
        title={saving ? 'সেভ হচ্ছে...' : editingCustomerId ? 'আপডেট করুন' : 'কাস্টমার যোগ করুন'}
        onPress={onSave}
        disabled={saving}
      />

      {editingCustomerId ? (
        <AppButton title="বাতিল করুন" onPress={onCancel} variant="secondary" />
      ) : null}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  formWrap: { gap: SPACING.sm },
  formGroup: { gap: SPACING.xs },
  label: { ...TYPOGRAPHY.body, fontWeight: '600', color: UI_COLORS.textPrimary },

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

  button: { marginTop: SPACING.xs },
});
