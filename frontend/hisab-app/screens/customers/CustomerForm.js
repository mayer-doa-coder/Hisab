import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';

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
    <View>
      <View style={styles.formGroup}>
        <Text style={styles.label}>Customer Name *</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Rahim"
          style={styles.input}
          autoCapitalize="words"
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Phone</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="e.g. 01XXXXXXXXX"
          style={styles.input}
          keyboardType="phone-pad"
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Address</Text>
        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder="Optional"
          style={styles.input}
        />
      </View>

      <TouchableOpacity style={[styles.button, saving && styles.buttonDisabled]} onPress={onSave} disabled={saving}>
        <Text style={styles.buttonText}>{saving ? 'Saving...' : editingCustomerId ? 'Update Customer' : 'Save Customer'}</Text>
      </TouchableOpacity>

      {editingCustomerId ? (
        <TouchableOpacity style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryButtonText}>Cancel Edit</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  formGroup: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600', color: UI_COLORS.textPrimary },
  input: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: UI_COLORS.textPrimary,
    backgroundColor: UI_COLORS.surface,
  },
  button: {
    marginTop: 8,
    backgroundColor: UI_COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryButton: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: UI_COLORS.surface,
  },
  secondaryButtonText: {
    color: UI_COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
});
