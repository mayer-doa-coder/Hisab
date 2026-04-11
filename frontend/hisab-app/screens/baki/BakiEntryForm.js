import { Picker } from '@react-native-picker/picker';
import { StyleSheet, Text, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';
import { AppButton, AppCard, AppInput } from '../../components/ui';
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
}) {
  return (
    <AppCard style={styles.formWrap}>
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
      <AppInput
        value={amount}
        onChangeText={setAmount}
        placeholder="Enter credit amount"
        style={styles.input}
        keyboardType="decimal-pad"
      />

      <Text style={styles.label}>Note</Text>
      <AppInput
        value={note}
        onChangeText={setNote}
        placeholder="Optional note"
        style={styles.input}
      />

      <AppButton
        title={saving ? 'Saving...' : 'Add Credit'}
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
  button: {
    marginTop: SPACING.sm,
  },
});
