import { StyleSheet, Text, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';
import { AppButton, AppCard, AppInput } from '../../components/ui';
import { SPACING } from '../../theme/spacing';
import { TYPOGRAPHY } from '../../theme/typography';

export default function CustomerForm({
  editingCustomerId,
  name,
  phone,
  address,
  setName,
  setPhone,
  setAddress,
  onSave,
  onCancel,
  saving,
}) {
  return (
    <AppCard style={styles.formWrap}>
      <View style={styles.formGroup}>
        <Text style={styles.label}>Customer Name *</Text>
        <AppInput
          value={name}
          onChangeText={setName}
          placeholder="Enter customer name"
          style={styles.input}
          autoCapitalize="words"
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Phone</Text>
        <AppInput
          value={phone}
          onChangeText={setPhone}
          placeholder="Enter phone number"
          style={styles.input}
          keyboardType="phone-pad"
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Address</Text>
        <AppInput
          value={address}
          onChangeText={setAddress}
          placeholder="Optional"
          style={styles.input}
        />
      </View>

      <AppButton
        style={styles.button}
        title={saving ? 'Saving...' : editingCustomerId ? 'Update Customer' : 'Save Customer'}
        onPress={onSave}
        disabled={saving}
      />

      {editingCustomerId ? (
        <AppButton title="Cancel Edit" onPress={onCancel} variant="secondary" />
      ) : null}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  formWrap: { gap: SPACING.sm },
  formGroup: { gap: SPACING.xs },
  label: { ...TYPOGRAPHY.body, fontWeight: '600', color: UI_COLORS.textPrimary },
  input: {},
  button: {
    marginTop: SPACING.sm,
  },
});
