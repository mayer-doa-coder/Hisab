import { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { UI_COLORS } from '../constants/ui-theme';
import { useAppData } from '../context/AppDataContext';
import CustomerForm from './customers/CustomerForm';
import CustomerListItem from './customers/CustomerListItem';

export default function CustomerListScreen() {
  const { customers, addCustomer, updateCustomer, deleteCustomer, refreshAll, refreshing } = useAppData();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState(null);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const resetForm = () => {
    setName('');
    setPhone('');
    setAddress('');
    setEditingCustomerId(null);
  };

  const handleSaveCustomer = async () => {
    if (saving) {
      return;
    }

    try {
      setSaving(true);
      if (editingCustomerId) {
        const updated = await updateCustomer({ id: editingCustomerId, name, phone, address });
        console.log('[DB] customer updated:', updated);
        resetForm();
        Alert.alert('Success', 'Customer updated successfully.');
      } else {
        const saved = await addCustomer({ name, phone, address });
        console.log('[DB] customer saved:', saved);
        resetForm();
        Alert.alert('Success', 'Customer saved successfully.');
      }
    } catch (error) {
      console.error('[DB] customer save failed:', error);
      Alert.alert('Save Failed', error?.message || 'Unable to save customer data.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (customer) => {
    setEditingCustomerId(Number(customer.id));
    setName(String(customer.name || ''));
    setPhone(String(customer.phone || ''));
    setAddress(String(customer.address || ''));
  };

  const handleDelete = (customer) => {
    Alert.alert('Delete Customer', `Delete ${customer.name}? This will also remove related baki entries.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCustomer(customer.id);
            if (Number(editingCustomerId) === Number(customer.id)) {
              resetForm();
            }
            Alert.alert('Deleted', 'Customer deleted successfully.');
          } catch (error) {
            Alert.alert('Delete Failed', error?.message || 'Unable to delete customer.');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <FlatList
          data={customers}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View>
              <Text style={styles.title}>Customer Manager</Text>
              <Text style={styles.subtitle}>Create, update, and delete customers.</Text>

              <CustomerForm
                editingCustomerId={editingCustomerId}
                name={name}
                phone={phone}
                address={address}
                setName={setName}
                setPhone={setPhone}
                setAddress={setAddress}
                onSave={handleSaveCustomer}
                onCancel={resetForm}
                saving={saving}
              />

              <View style={styles.headerRow}>
                <Text style={styles.sectionTitle}>Customer List</Text>
                <TouchableOpacity style={styles.refreshButton} onPress={refreshAll}>
                  <Text style={styles.refreshText}>{refreshing ? 'Refreshing...' : 'Refresh'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          }
          ListEmptyComponent={<Text style={styles.emptyText}>No customers yet.</Text>}
          renderItem={({ item }) => <CustomerListItem item={item} onEdit={handleEdit} onDelete={handleDelete} />}
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
});
