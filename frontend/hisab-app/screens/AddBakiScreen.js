import { useCallback, useEffect, useMemo, useState } from 'react';
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

import { addBaki, createTables, fetchBakiWithCustomer, fetchCustomers } from '../database/db';

const STATUS_OPTIONS = ['unpaid', 'partial', 'paid'];

export default function AddBakiScreen() {
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('unpaid');
  const [bakiRows, setBakiRows] = useState([]);
  const [saving, setSaving] = useState(false);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId) || null,
    [customers, selectedCustomerId]
  );

  const loadCustomers = useCallback(async () => {
    try {
      const rows = await fetchCustomers();
      setCustomers(rows);
      if (!selectedCustomerId && rows.length > 0) {
        setSelectedCustomerId(rows[0].id);
      }
      console.log('[DB] customers for baki:', rows);
    } catch (error) {
      console.error('[DB] customers load failed:', error);
    }
  }, [selectedCustomerId]);

  const loadBakiHistory = useCallback(async (customerId = selectedCustomerId) => {
    try {
      const rows = await fetchBakiWithCustomer({ customerId: customerId || null });
      setBakiRows(rows);
      console.log('[DB] baki history fetched:', rows);
    } catch (error) {
      console.error('[DB] baki history load failed:', error);
    }
  }, [selectedCustomerId]);

  useEffect(() => {
    const init = async () => {
      try {
        await createTables();
        await loadCustomers();
      } catch (error) {
        console.error('[DB] baki init failed:', error);
      }
    };

    init();
  }, [loadCustomers]);

  useEffect(() => {
    loadBakiHistory(selectedCustomerId);
  }, [selectedCustomerId, loadBakiHistory]);

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
      await loadCustomers();
      await loadBakiHistory(selectedCustomerId);

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
          data={bakiRows}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View>
              <Text style={styles.title}>Add Baki</Text>
              <Text style={styles.subtitle}>Select customer, add due amount, and view history.</Text>

              <Text style={styles.label}>Select Customer *</Text>
              <View style={styles.customerListWrap}>
                {customers.map((customer) => {
                  const selected = selectedCustomerId === customer.id;
                  return (
                    <TouchableOpacity
                      key={customer.id}
                      style={[styles.customerChip, selected && styles.customerChipSelected]}
                      onPress={() => setSelectedCustomerId(customer.id)}
                    >
                      <Text style={[styles.customerChipText, selected && styles.customerChipTextSelected]}>
                        {customer.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
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
                style={[styles.button, saving && styles.buttonDisabled]}
                onPress={handleSaveBaki}
                disabled={saving || !selectedCustomerId}
              >
                <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Save Baki'}</Text>
              </TouchableOpacity>

              <View style={styles.headerRow}>
                <Text style={styles.sectionTitle}>Baki History</Text>
                <TouchableOpacity style={styles.refreshButton} onPress={() => loadBakiHistory(selectedCustomerId)}>
                  <Text style={styles.refreshText}>Refresh</Text>
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
  safeArea: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  container: { padding: 20, gap: 12 },
  title: { fontSize: 28, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 14, color: '#4b5563', marginBottom: 8 },
  formGroup: { gap: 6, marginTop: 10 },
  label: { fontSize: 14, fontWeight: '600', color: '#111827' },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#fff',
  },
  customerListWrap: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  customerChip: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  customerChipSelected: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  customerChipText: { color: '#1f2937', fontWeight: '600' },
  customerChipTextSelected: { color: '#fff' },
  selectedMeta: { marginTop: 8, fontSize: 13, color: '#4b5563' },
  statusWrap: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  statusChip: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusChipSelected: { backgroundColor: '#111827', borderColor: '#111827' },
  statusChipText: { color: '#111827', fontSize: 13, fontWeight: '600' },
  statusChipTextSelected: { color: '#fff' },
  button: {
    marginTop: 12,
    backgroundColor: '#2563eb',
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
  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  refreshButton: {
    backgroundColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  refreshText: { color: '#111827', fontSize: 12, fontWeight: '600' },
  emptyText: { fontSize: 14, color: '#6b7280' },
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#fff',
    marginBottom: 10,
  },
  rowTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  meta: { marginTop: 3, fontSize: 13, color: '#4b5563' },
  date: { marginTop: 6, fontSize: 12, color: '#6b7280' },
});
