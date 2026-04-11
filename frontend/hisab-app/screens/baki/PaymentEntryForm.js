import { Picker } from '@react-native-picker/picker';
import { StyleSheet, Text, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';
import { AppButton, AppCard, AppInput } from '../../components/ui';
import { SPACING } from '../../theme/spacing';
import { TYPOGRAPHY } from '../../theme/typography';

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
    <AppCard style={styles.formWrap}>
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
      <AppInput
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
      <AppInput
        value={paymentNote}
        onChangeText={setPaymentNote}
        placeholder="Optional note"
        style={styles.input}
      />

      <AppButton
        title={saving ? 'Saving...' : 'Save Payment'}
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
    borderColor: UI_COLORS.border,
    borderRadius: 8,
    backgroundColor: UI_COLORS.surfaceSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  dueHintText: {
    ...TYPOGRAPHY.small,
    color: UI_COLORS.primary,
    fontWeight: '700',
  },
  button: {
    marginTop: SPACING.sm,
  },
});
