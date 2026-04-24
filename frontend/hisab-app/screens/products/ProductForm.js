import DateTimePicker from '@react-native-community/datetimepicker';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { AppButton, AppCard, AppInput } from '../../components/ui';
import { UI_COLORS } from '../../constants/ui-theme';
import { SPACING } from '../../theme/spacing';
import { TYPOGRAPHY } from '../../theme/typography';

export default function ProductForm({
  editingId,
  name,
  quantity,
  price,
  lowStockThreshold,
  expiryDate,
  setName,
  setQuantity,
  setPrice,
  setLowStockThreshold,
  setExpiryDate,
  onSave,
  onCancel,
  saving,
  refreshing,
}) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const displayDate = useMemo(() => {
    if (!expiryDate) return 'মেয়াদ দেওয়া হয়নি';
    const parsed = new Date(expiryDate);
    if (Number.isNaN(parsed.getTime())) return 'ভুল তারিখ';
    return parsed.toISOString().slice(0, 10);
  }, [expiryDate]);

  const pickerValue = useMemo(() => {
    if (!expiryDate) return new Date();
    const parsed = new Date(expiryDate);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [expiryDate]);

  const handleDateChange = (_event, selectedDate) => {
    if (Platform.OS !== 'ios') setShowDatePicker(false);
    if (!selectedDate || Number.isNaN(selectedDate.getTime())) return;
    setExpiryDate(selectedDate.toISOString());
  };

  return (
    <AppCard style={styles.formWrap}>
      <Text style={styles.formTitle}>
        {editingId ? 'পণ্য আপডেট করুন' : 'পণ্য যোগ করুন'}
      </Text>

      {/* ── Essential fields ─────────────────────────── */}
      <View style={styles.formGroup}>
        <Text style={styles.label}>পণ্যের নাম *</Text>
        <AppInput
          value={name}
          onChangeText={setName}
          placeholder="পণ্যের নাম লিখুন"
          autoCapitalize="words"
        />
      </View>

      <View style={styles.formRow}>
        {!editingId ? (
          <View style={styles.col}>
            <Text style={styles.label}>পরিমাণ *</Text>
            <AppInput
              value={quantity}
              onChangeText={setQuantity}
              placeholder="০"
              keyboardType="numeric"
            />
          </View>
        ) : null}

        <View style={styles.col}>
          <Text style={styles.label}>দাম *</Text>
          <AppInput
            value={price}
            onChangeText={setPrice}
            placeholder="০.০০"
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      {editingId ? (
        <Text style={styles.helpText}>
          স্টক পরিমাণ শুধু মুভমেন্ট ট্যাব থেকে আপডেট হয়।
        </Text>
      ) : null}

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
            <Text style={styles.label}>কম স্টকের সতর্কতা</Text>
            <AppInput
              value={lowStockThreshold}
              onChangeText={setLowStockThreshold}
              placeholder="কত টির নিচে সতর্ক করবে?"
              keyboardType="numeric"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>মেয়াদ শেষের তারিখ</Text>
            <View style={styles.dateRow}>
              <Text style={styles.dateValue}>{displayDate}</Text>
              <View style={styles.dateActionRow}>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Text style={styles.dateButtonText}>তারিখ বেছে নিন</Text>
                </TouchableOpacity>
                {expiryDate ? (
                  <TouchableOpacity
                    style={styles.clearButton}
                    onPress={() => setExpiryDate('')}
                  >
                    <Text style={styles.clearButtonText}>মুছুন</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>

          {showDatePicker ? (
            <DateTimePicker
              value={pickerValue}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleDateChange}
            />
          ) : null}
        </View>
      )}

      <AppButton
        title={saving ? 'সেভ হচ্ছে...' : editingId ? 'আপডেট করুন' : 'পণ্য যোগ করুন'}
        onPress={onSave}
        disabled={saving || refreshing}
        style={styles.button}
      />

      {editingId ? (
        <AppButton title="বাতিল করুন" onPress={onCancel} variant="secondary" />
      ) : null}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  formWrap: {
    marginTop: SPACING.sm,
    borderRadius: 12,
    gap: SPACING.sm,
  },
  formTitle: { ...TYPOGRAPHY.subheading, fontWeight: '700', color: UI_COLORS.textPrimary },
  formGroup: { gap: SPACING.xs },
  formRow: { flexDirection: 'row', gap: SPACING.sm },
  col: { flex: 1, gap: SPACING.xs },
  label: { ...TYPOGRAPHY.body, fontWeight: '600', color: UI_COLORS.textPrimary },
  helpText: {
    marginTop: -SPACING.xs,
    ...TYPOGRAPHY.small,
    color: UI_COLORS.textMuted,
  },

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

  dateRow: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    padding: SPACING.sm,
    backgroundColor: UI_COLORS.surface,
    gap: SPACING.sm,
  },
  dateValue: {
    ...TYPOGRAPHY.body,
    color: UI_COLORS.textPrimary,
    fontWeight: '600',
  },
  dateActionRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  dateButton: {
    backgroundColor: UI_COLORS.surfaceSoft,
    borderRadius: 8,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  dateButtonText: {
    ...TYPOGRAPHY.small,
    color: UI_COLORS.primary,
    fontWeight: '700',
  },
  clearButton: {
    backgroundColor: UI_COLORS.surfaceSoft,
    borderRadius: 8,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  clearButtonText: {
    ...TYPOGRAPHY.small,
    color: UI_COLORS.textSecondary,
    fontWeight: '700',
  },

  button: { marginTop: SPACING.xs },
});
