import { Picker } from '@react-native-picker/picker';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';

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
}) {
  return (
    <View style={styles.formWrap}>
      <Text style={styles.formTitle}>Add Credit</Text>

      <Text style={styles.label}>Customer *</Text>
      <View style={styles.pickerContainer}>
        <Picker selectedValue={customerId} onValueChange={setCustomerId} style={styles.picker}>
          <Picker.Item label="Choose customer" value="" />
          {customers.map((customer) => (
            <Picker.Item
              key={customer.id}
              label={`${customer.name}${customer.phone ? ` (${customer.phone})` : ''}`}
              value={String(customer.id)}
            />
          ))}
        </Picker>
      </View>

      <Text style={styles.label}>Credit Amount *</Text>
      <TextInput
        value={amount}
        onChangeText={setAmount}
        placeholder="Enter credit amount"
        style={styles.input}
        keyboardType="decimal-pad"
      />

      <Text style={styles.label}>Note</Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Optional note"
        style={styles.input}
      />

      <TouchableOpacity
        style={[styles.button, (saving || refreshing) && styles.buttonDisabled]}
        onPress={onSave}
        disabled={saving || refreshing || !customerId}
      >
        <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Add Credit'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  formWrap: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 12,
    backgroundColor: UI_COLORS.surface,
    padding: 12,
    gap: 8,
    marginBottom: 10,
  },
  formTitle: { fontSize: 16, fontWeight: '700', color: UI_COLORS.textPrimary },
  label: { fontSize: 13, fontWeight: '600', color: UI_COLORS.textPrimary },
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
  pickerContainer: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    backgroundColor: UI_COLORS.surface,
    overflow: 'hidden',
  },
  picker: {
    height: 50,
    color: UI_COLORS.textPrimary,
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
});
