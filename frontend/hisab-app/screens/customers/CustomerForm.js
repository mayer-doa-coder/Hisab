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

      <View style={styles.formGroup}>
        <Text style={styles.label}>Credit Limit</Text>
        <AppInput
          value={creditLimit}
          onChangeText={setCreditLimit}
          placeholder="0.00"
          style={styles.input}
          keyboardType="decimal-pad"
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Due Terms (Days)</Text>
        <AppInput
          value={dueTermsDays}
          onChangeText={setDueTermsDays}
          placeholder="30"
          style={styles.input}
          keyboardType="number-pad"
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
