import { Picker } from '@react-native-picker/picker';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';

const PAYMENT_METHODS = [
  { label: 'Cash', value: 'cash' },
  { label: 'bKash', value: 'bkash' },
  { label: 'Nagad', value: 'nagad' },
  { label: 'Bank', value: 'bank' },
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
}) {
  return (
    <View style={styles.formWrap}>
      <Text style={styles.formTitle}>Record Repayment</Text>

      <Text style={styles.label}>Customer *</Text>
      <View style={styles.pickerContainer}>
        <Picker selectedValue={customerId} onValueChange={setCustomerId} style={styles.picker}>
          <Picker.Item label="Choose customer" value="" />
          {customers.map((customer) => (
            <Picker.Item
              key={`payment-customer-${customer.id}`}
              label={`${customer.name}${customer.phone ? ` (${customer.phone})` : ''}`}
              value={String(customer.id)}
            />
          ))}
        </Picker>
      </View>

      <View style={styles.dueHintCard}>
        <Text style={styles.dueHintText}>Current Due: ৳{Number(currentDue || 0).toFixed(2)}</Text>
      </View>

      <Text style={styles.label}>Paid Amount *</Text>
      <TextInput
        value={paymentAmount}
        onChangeText={setPaymentAmount}
        placeholder="Enter paid amount"
        style={styles.input}
        keyboardType="decimal-pad"
      />

      <Text style={styles.label}>Payment Method</Text>
      <View style={styles.pickerContainer}>
        <Picker selectedValue={paymentMethod} onValueChange={setPaymentMethod} style={styles.picker}>
          {PAYMENT_METHODS.map((method) => (
            <Picker.Item key={method.value} label={method.label} value={method.value} />
          ))}
        </Picker>
      </View>

      <Text style={styles.label}>Note</Text>
      <TextInput
        value={paymentNote}
        onChangeText={setPaymentNote}
        placeholder="Optional note"
        style={styles.input}
      />

      <TouchableOpacity
        style={[styles.button, (saving || refreshing) && styles.buttonDisabled]}
        onPress={onSave}
        disabled={saving || refreshing || !customerId}
      >
        <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Save Payment'}</Text>
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
  dueHintCard: {
    borderWidth: 1,
    borderColor: '#C7D7FF',
    borderRadius: 8,
    backgroundColor: '#EEF3FF',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dueHintText: {
    color: UI_COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  button: {
    marginTop: 8,
    backgroundColor: '#166534',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});