import DateTimePicker from '@react-native-community/datetimepicker';
import { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';
import { AppButton, AppCard, AppInput } from '../../components/ui';
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

  const displayDate = useMemo(() => {
    if (!expiryDate) {
      return 'No expiry selected';
    }

    const parsed = new Date(expiryDate);
    if (Number.isNaN(parsed.getTime())) {
      return 'Invalid date';
    }

    return parsed.toISOString().slice(0, 10);
  }, [expiryDate]);

  const pickerValue = useMemo(() => {
    if (!expiryDate) {
      return new Date();
    }

    const parsed = new Date(expiryDate);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [expiryDate]);

  const handleDateChange = (_event, selectedDate) => {
    if (Platform.OS !== 'ios') {
      setShowDatePicker(false);
    }

    if (!selectedDate || Number.isNaN(selectedDate.getTime())) {
      return;
    }

    setExpiryDate(selectedDate.toISOString());
  };

  return (
    <AppCard style={styles.formWrap}>
      <Text style={styles.formTitle}>{editingId ? 'Update Product' : 'Add Product'}</Text>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Product Name *</Text>
        <AppInput
          value={name}
          onChangeText={setName}
          placeholder="Enter product name"
          style={styles.input}
          autoCapitalize="words"
        />
      </View>

      <View style={styles.formRow}>
        {!editingId ? (
          <View style={styles.col}>
            <Text style={styles.label}>Quantity *</Text>
            <AppInput
              value={quantity}
              onChangeText={setQuantity}
              placeholder="Enter quantity"
              style={styles.input}
              keyboardType="numeric"
            />
          </View>
        ) : null}

        <View style={styles.col}>
          <Text style={styles.label}>Price *</Text>
          <AppInput
            value={price}
            onChangeText={setPrice}
            placeholder="Enter price"
            style={styles.input}
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      {editingId ? (
        <Text style={styles.helpText}>Stock quantity is updated from the Movement tab only.</Text>
      ) : null}

      <View style={styles.formGroup}>
        <Text style={styles.label}>Low Stock Alert Threshold *</Text>
        <AppInput
          value={lowStockThreshold}
          onChangeText={setLowStockThreshold}
          placeholder="Enter low-stock threshold"
          style={styles.input}
          keyboardType="numeric"
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Expiry Date</Text>
        <View style={styles.dateRow}>
          <Text style={styles.dateValue}>{displayDate}</Text>
          <View style={styles.dateActionRow}>
            <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
              <Text style={styles.dateButtonText}>Pick Date</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.clearButton} onPress={() => setExpiryDate('')}>
              <Text style={styles.clearButtonText}>Clear</Text>
            </TouchableOpacity>
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

      <AppButton
        title={saving ? 'Saving...' : editingId ? 'Update Product' : 'Save Product'}
        onPress={onSave}
        disabled={saving || refreshing}
        style={styles.button}
      />

      {editingId ? (
        <AppButton title="Cancel Edit" onPress={onCancel} variant="secondary" />
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
  input: {},
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
  button: {
    marginTop: SPACING.sm,
  },
});

