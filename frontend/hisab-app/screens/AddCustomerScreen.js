import { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { UI_COLORS } from '../constants/ui-theme';
import { useAppData } from '../context/AppDataContext';

export default function AddCustomerScreen() {
  const { customers, addCustomer, refreshAll, refreshing } = useAppData();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const handleAddCustomer = async () => {
    if (saving) {
      return;
    }

    try {
      setSaving(true);
      const saved = await addCustomer({ name, phone, address });
      console.log('[DB] customer saved:', saved);

      setName('');
      setPhone('');
      setAddress('');
      await refreshAll();

      Alert.alert('Success', 'Customer saved successfully.');
    } catch (error) {
      console.error('[DB] customer save failed:', error);
      Alert.alert('Save Failed', error?.message || 'Unable to save customer.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <FlatList
          data={customers}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View>
              <Text style={styles.title}>Add Customer</Text>
              <Text style={styles.subtitle}>Create customer and view outstanding due.</Text>

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

              <TouchableOpacity
                style={[styles.button, saving && styles.buttonDisabled]}
                onPress={handleAddCustomer}
                disabled={saving}
              >
                <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Save Customer'}</Text>
              </TouchableOpacity>

              <View style={styles.headerRow}>
                <Text style={styles.sectionTitle}>Customer List</Text>
                <TouchableOpacity style={styles.refreshButton} onPress={refreshAll}>
                  <Text style={styles.refreshText}>{refreshing ? 'Refreshing...' : 'Refresh'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          }
          ListEmptyComponent={<Text style={styles.emptyText}>No customers yet.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.customerName}>{item.name}</Text>
              <Text style={styles.meta}>Phone: {item.phone || 'N/A'}</Text>
              <Text style={styles.meta}>Address: {item.address || 'N/A'}</Text>
              <Text style={styles.due}>Total Due: ৳{Number(item.total_due || 0).toFixed(2)}</Text>
            </View>
          )}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: UI_COLORS.background },
  flex: { flex: 1 },
  container: { padding: 20, gap: 12 },
  title: { fontSize: 28, fontWeight: '700', color: UI_COLORS.textPrimary },
  subtitle: { fontSize: 14, color: UI_COLORS.textSecondary, marginBottom: 8 },
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
  headerRow: {
    marginTop: 16,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: UI_COLORS.textPrimary },
  refreshButton: {
    backgroundColor: '#E7EEFF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  refreshText: { color: UI_COLORS.primary, fontSize: 12, fontWeight: '600' },
  emptyText: { fontSize: 14, color: UI_COLORS.textMuted },
  card: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    padding: 12,
    backgroundColor: UI_COLORS.surface,
    marginBottom: 10,
  },
  customerName: { fontSize: 16, fontWeight: '700', color: UI_COLORS.textPrimary },
  meta: { marginTop: 3, fontSize: 13, color: UI_COLORS.textSecondary },
  due: { marginTop: 6, fontSize: 14, fontWeight: '700', color: UI_COLORS.danger },
});
