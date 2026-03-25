import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';

export default function ProductForm({
  editingId,
  name,
  quantity,
  price,
  setName,
  setQuantity,
  setPrice,
  onSave,
  onCancel,
  saving,
  refreshing,
}) {
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
