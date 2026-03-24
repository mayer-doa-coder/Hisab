import { useEffect, useMemo, useState } from 'react';
import { Picker } from '@react-native-picker/picker';
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

const STATUS_OPTIONS = ['unpaid', 'partial', 'paid'];

export default function AddBakiScreen() {
  const { customers, bakiRows, addBaki, refreshAll, refreshing } = useAppData();
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('unpaid');
  const [saving, setSaving] = useState(false);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => Number(customer.id) === Number(selectedCustomerId)) || null,
    [customers, selectedCustomerId]
  );

  const filteredBakiRows = useMemo(() => {
    if (!selectedCustomerId) {
      return bakiRows;
    }

    return bakiRows.filter((row) => Number(row.customer_id) === Number(selectedCustomerId));
  }, [bakiRows, selectedCustomerId]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (!selectedCustomerId && customers.length > 0) {
      setSelectedCustomerId(Number(customers[0].id));
    }
  }, [customers, selectedCustomerId]);

  const handleSaveBaki = async () => {
    if (saving) {
      return;
    }

    try {
      setSaving(true);
      const saved = await addBaki({
        customerId: selectedCustomerId,
        amount: Number(amount),
        note,
        status,
      });
      console.log('[DB] baki saved:', saved);

      setAmount('');
      setNote('');
      setStatus('unpaid');
      await refreshAll();

      Alert.alert('Success', 'Baki saved successfully.');
    } catch (error) {
      console.error('[DB] baki save failed:', error);
      Alert.alert('Save Failed', error?.message || 'Unable to save baki entry.');
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
          data={filteredBakiRows}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View>
              <Text style={styles.title}>Add Baki</Text>
              <Text style={styles.subtitle}>Select customer, add due amount, and view history.</Text>

              <Text style={styles.label}>Select Customer *</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={selectedCustomerId ?? ''}
                  onValueChange={(itemValue) => {
                    if (itemValue === '') {
                      setSelectedCustomerId(null);
                      return;
                    }
                    setSelectedCustomerId(Number(itemValue));
                  }}
                  style={styles.picker}
                >
                  <Picker.Item label="Choose a customer" value="" />
                  {customers.map((customer) => (
                    <Picker.Item
                      key={customer.id}
                      label={`${customer.name}${customer.phone ? ` (${customer.phone})` : ''}`}
                      value={Number(customer.id)}
                    />
                  ))}
                </Picker>
              </View>

              {selectedCustomer ? (
                <Text style={styles.selectedMeta}>
                  Selected: {selectedCustomer.name} • Due: ৳{Number(selectedCustomer.total_due || 0).toFixed(2)}
                </Text>
              ) : (
                <Text style={styles.selectedMeta}>No customer available. Add customer first.</Text>
              )}

              <View style={styles.formGroup}>
                <Text style={styles.label}>Amount *</Text>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="e.g. 500"
                  style={styles.input}
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Status</Text>
                <View style={styles.statusWrap}>
                  {STATUS_OPTIONS.map((option) => {
                    const selected = status === option;
                    return (
                      <TouchableOpacity
                        key={option}
                        style={[styles.statusChip, selected && styles.statusChipSelected]}
                        onPress={() => setStatus(option)}
                      >
                        <Text style={[styles.statusChipText, selected && styles.statusChipTextSelected]}>
                          {option}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Note</Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Optional note"
                  style={styles.input}
                />
              </View>

              <TouchableOpacity
                  style={[styles.button, (saving || refreshing) && styles.buttonDisabled]}
                onPress={handleSaveBaki}
                  disabled={saving || refreshing || !selectedCustomerId}
              >
                <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Save Baki'}</Text>
              </TouchableOpacity>

              <View style={styles.headerRow}>
                <Text style={styles.sectionTitle}>Baki History</Text>
                  <TouchableOpacity style={styles.refreshButton} onPress={refreshAll}>
                    <Text style={styles.refreshText}>{refreshing ? 'Refreshing...' : 'Refresh'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          }
          ListEmptyComponent={<Text style={styles.emptyText}>No baki history yet.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.rowTitle}>{item.customer_name}</Text>
              <Text style={styles.meta}>Status: {item.status}</Text>
              <Text style={styles.meta}>Amount: ৳{Number(item.amount).toFixed(2)}</Text>
              <Text style={styles.meta}>Due: ৳{Number(item.due_amount).toFixed(2)}</Text>
              <Text style={styles.meta}>Note: {item.note || 'N/A'}</Text>
              <Text style={styles.date}>{item.created_at}</Text>
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
  formGroup: { gap: 6, marginTop: 10 },
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
  pickerContainer: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    backgroundColor: UI_COLORS.surface,
    overflow: 'hidden',
  },
  picker: {
    height: 52,
    color: UI_COLORS.textPrimary,
  },
  selectedMeta: { marginTop: 8, fontSize: 13, color: UI_COLORS.textSecondary },
  statusWrap: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  statusChip: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusChipSelected: { backgroundColor: UI_COLORS.textPrimary, borderColor: UI_COLORS.textPrimary },
  statusChipText: { color: UI_COLORS.textPrimary, fontSize: 13, fontWeight: '600' },
  statusChipTextSelected: { color: UI_COLORS.surface },
  button: {
    marginTop: 12,
    backgroundColor: UI_COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
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
  rowTitle: { fontSize: 16, fontWeight: '700', color: UI_COLORS.textPrimary },
  meta: { marginTop: 3, fontSize: 13, color: UI_COLORS.textSecondary },
  date: { marginTop: 6, fontSize: 12, color: UI_COLORS.textMuted },
});
