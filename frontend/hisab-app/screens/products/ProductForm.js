import DateTimePicker from '@react-native-community/datetimepicker';
import { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';

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
    <View style={styles.formWrap}>
      <Text style={styles.formTitle}>{editingId ? 'Update Product' : 'Add Product'}</Text>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Product Name *</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Rice"
          style={styles.input}
          autoCapitalize="words"
        />
      </View>

      <View style={styles.formRow}>
        {!editingId ? (
          <View style={styles.col}>
            <Text style={styles.label}>Quantity *</Text>
            <TextInput
              value={quantity}
              onChangeText={setQuantity}
              placeholder="e.g. 10"
              style={styles.input}
              keyboardType="numeric"
            />
          </View>
        ) : null}

        <View style={styles.col}>
          <Text style={styles.label}>Price *</Text>
          <TextInput
            value={price}
            onChangeText={setPrice}
            placeholder="e.g. 55"
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
        <TextInput
          value={lowStockThreshold}
          onChangeText={setLowStockThreshold}
          placeholder="e.g. 5"
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

      <TouchableOpacity
        style={[styles.button, (saving || refreshing) && styles.buttonDisabled]}
        onPress={onSave}
        disabled={saving || refreshing}
      >
        <Text style={styles.buttonText}>{saving ? 'Saving...' : editingId ? 'Update Product' : 'Save Product'}</Text>
      </TouchableOpacity>

      {editingId ? (
        <TouchableOpacity style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryButtonText}>Cancel Edit</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  formWrap: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: UI_COLORS.surface,
    gap: 8,
  },
  formTitle: { fontSize: 16, fontWeight: '700', color: UI_COLORS.textPrimary },
  formGroup: { gap: 6 },
  formRow: { flexDirection: 'row', gap: 10 },
  col: { flex: 1, gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: UI_COLORS.textPrimary },
  helpText: {
    marginTop: -2,
    fontSize: 12,
    color: UI_COLORS.textMuted,
  },
  input: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: UI_COLORS.textPrimary,
    backgroundColor: UI_COLORS.surface,
  },
  dateRow: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: UI_COLORS.surface,
    gap: 8,
  },
  dateValue: {
    color: UI_COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  dateActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dateButton: {
    backgroundColor: '#E7EEFF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  dateButtonText: {
    color: UI_COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  clearButton: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  clearButtonText: {
    color: UI_COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  button: {
    marginTop: 8,
    backgroundColor: UI_COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryButton: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: UI_COLORS.surface,
  },
  secondaryButtonText: { color: UI_COLORS.textPrimary, fontWeight: '700' },
});
