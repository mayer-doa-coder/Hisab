import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UI_COLORS } from '../constants/ui-theme';
import { useAppData } from '../context/AppDataContext';
import useDebouncedValue from '../hooks/use-debounced-value';
import {
  applyCustomerSearchFilterSort,
  CUSTOMER_DUE_FILTERS,
  CUSTOMER_SORT_OPTIONS,
} from '../services/customers/customerSearchUtils';
import CustomerForm from './customers/CustomerForm';
import CustomerListItem from './customers/CustomerListItem';
import CustomerSearchControls from './customers/CustomerSearchControls';

export default function CustomerListScreen() {
  const { customers, addCustomer, updateCustomer, deleteCustomer, refreshAll, refreshing } = useAppData();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState(null);
  const [fullCustomers, setFullCustomers] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [dueFilter, setDueFilter] = useState(CUSTOMER_DUE_FILTERS.ALL);
  const [sortBy, setSortBy] = useState(CUSTOMER_SORT_OPTIONS.RECENT);

  const debouncedSearchText = useDebouncedValue(searchText, 250);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    setFullCustomers(customers);
  }, [customers]);

  const displayedCustomers = useMemo(
    () =>
      applyCustomerSearchFilterSort(fullCustomers, {
        searchText: debouncedSearchText,
        dueFilter,
        sortBy,
      }),
    [fullCustomers, debouncedSearchText, dueFilter, sortBy]
  );

  const hasActiveCustomerControls =
    Boolean(searchText.trim()) ||
    dueFilter !== CUSTOMER_DUE_FILTERS.ALL ||
    sortBy !== CUSTOMER_SORT_OPTIONS.RECENT;

  const clearCustomerControls = () => {
    setSearchText('');
    setDueFilter(CUSTOMER_DUE_FILTERS.ALL);
    setSortBy(CUSTOMER_SORT_OPTIONS.RECENT);
  };

  const dueOnlyCount = fullCustomers.filter((customer) => Number(customer.total_due || 0) > 0).length;
  const noDueCount = fullCustomers.length - dueOnlyCount;

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
          data={displayedCustomers}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View>
              <Text style={styles.title}>Customer Manager</Text>
              <Text style={styles.subtitle}>Create, update, and quickly find customers by name, phone, or due.</Text>

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

              <CustomerSearchControls
                searchText={searchText}
                setSearchText={setSearchText}
                dueFilter={dueFilter}
                setDueFilter={setDueFilter}
                sortBy={sortBy}
                setSortBy={setSortBy}
                onClear={clearCustomerControls}
              />

              <View style={styles.statsWrap}>
                <Text style={styles.statBadge}>Total: {fullCustomers.length}</Text>
                <Text style={styles.statBadge}>Due {'>'} 0: {dueOnlyCount}</Text>
                <Text style={styles.statBadge}>No Due: {noDueCount}</Text>
              </View>

              <View style={styles.headerRow}>
                <Text style={styles.sectionTitle}>Customer List</Text>
                <TouchableOpacity style={styles.refreshButton} onPress={refreshAll}>
                  <Text style={styles.refreshText}>{refreshing ? 'Refreshing...' : 'Refresh'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {fullCustomers.length === 0
                ? 'No customers yet.'
                : hasActiveCustomerControls
                  ? 'No customer matched your search/filter.'
                  : 'No customers yet.'}
            </Text>
          }
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
  statsWrap: {
    marginTop: 8,
    marginBottom: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statBadge: {
    fontSize: 12,
    color: UI_COLORS.primary,
    backgroundColor: UI_COLORS.surfaceSubtle,
    borderColor: UI_COLORS.borderSoft,
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontWeight: '700',
  },
  headerRow: {
    marginTop: 16,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: UI_COLORS.textPrimary },
  refreshButton: {
    backgroundColor: UI_COLORS.surfaceSubtle,
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  refreshText: { color: UI_COLORS.primary, fontSize: 12, fontWeight: '600' },
  emptyText: { fontSize: 14, color: UI_COLORS.textMuted },
});

