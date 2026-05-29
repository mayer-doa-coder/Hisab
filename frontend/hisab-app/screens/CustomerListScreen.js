import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
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
import CustomerForm from '../components/customers/CustomerForm';
import CustomerListItem from '../components/customers/CustomerListItem';
import CustomerSearchControls from '../components/customers/CustomerSearchControls';

export default function CustomerListScreen() {
  const { customers, addCustomer, updateCustomer, deleteCustomer, refreshAll, refreshing } = useAppData();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [creditLimit, setCreditLimit] = useState('0');
  const [dueTermsDays, setDueTermsDays] = useState('30');
  const [saving, setSaving] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState(null);
  const [fullCustomers, setFullCustomers] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [dueFilter, setDueFilter] = useState(CUSTOMER_DUE_FILTERS.ALL);
  const [sortBy, setSortBy] = useState(CUSTOMER_SORT_OPTIONS.RECENT);
  const [showForm, setShowForm] = useState(false);

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
    setCreditLimit('0');
    setDueTermsDays('30');
    setEditingCustomerId(null);
  };

  const handleCancel = () => {
    resetForm();
    setShowForm(false);
  };

  const handleSaveCustomer = async () => {
    if (saving) {
      return;
    }

    try {
      setSaving(true);
      const numericCreditLimit = Number(creditLimit || 0);
      const numericDueTermsDays = Number(dueTermsDays || 30);
      if (editingCustomerId) {
        const updated = await updateCustomer({
          id: editingCustomerId,
          name,
          phone,
          address,
          creditLimit: Number.isFinite(numericCreditLimit) && numericCreditLimit >= 0 ? numericCreditLimit : 0,
          dueTermsDays: Number.isInteger(numericDueTermsDays) && numericDueTermsDays > 0 ? numericDueTermsDays : 30,
        });
        console.log('[DB] customer updated:', updated);
        setShowForm(false);
        resetForm();
        Alert.alert('সফল', 'কাস্টমার আপডেট হয়েছে।');
      } else {
        const saved = await addCustomer({
          name,
          phone,
          address,
          creditLimit: Number.isFinite(numericCreditLimit) && numericCreditLimit >= 0 ? numericCreditLimit : 0,
          dueTermsDays: Number.isInteger(numericDueTermsDays) && numericDueTermsDays > 0 ? numericDueTermsDays : 30,
        });
        console.log('[DB] customer saved:', saved);
        setShowForm(false);
        resetForm();
        Alert.alert('সফল', 'কাস্টমার সেভ হয়েছে।');
      }
    } catch (error) {
      console.error('[DB] customer save failed:', error);
      Alert.alert('সেভ ব্যর্থ', error?.message || 'কাস্টমার সেভ হয়নি।');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (customer) => {
    setEditingCustomerId(Number(customer.id));
    setName(String(customer.name || ''));
    setPhone(String(customer.phone || ''));
    setAddress(String(customer.address || ''));
    setCreditLimit(String(customer.credit_limit ?? 0));
    setDueTermsDays(String(customer.due_terms_days ?? 30));
    setShowForm(true);
  };

  const handleDelete = (customer) => {
    Alert.alert('কাস্টমার মুছুন', `${customer.name} মুছে ফেলবেন? সংশ্লিষ্ট বাকির তথ্যও মুছে যাবে।`, [
      { text: 'বাতিল', style: 'cancel' },
      {
        text: 'মুছুন',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCustomer(customer.id);
            if (Number(editingCustomerId) === Number(customer.id)) {
              resetForm();
            }
            Alert.alert('মুছে ফেলা হয়েছে', 'কাস্টমার মুছে ফেলা হয়েছে।');
          } catch (error) {
            Alert.alert('মুছতে পারেনি', error?.message || 'কাস্টমার মুছে ফেলা যায়নি।');
          }
        },
      },
    ]);
  };

  const DUE_FILTER_CHIPS = [
    { label: `সব (${fullCustomers.length})`, value: CUSTOMER_DUE_FILTERS.ALL },
    { label: `বাকি আছে (${dueOnlyCount})`, value: CUSTOMER_DUE_FILTERS.DUE_ONLY },
    { label: `বাকি নেই (${noDueCount})`, value: CUSTOMER_DUE_FILTERS.NO_DUE },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>

      {/* Add / Edit modal */}
      <Modal
        visible={showForm}
        animationType="slide"
        transparent
        onRequestClose={handleCancel}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingCustomerId ? 'কাস্টমার সম্পাদনা' : 'নতুন কাস্টমার'}
              </Text>
              <TouchableOpacity onPress={handleCancel} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <MaterialIcons name="close" size={24} color={UI_COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <CustomerForm
                editingCustomerId={editingCustomerId}
                name={name}
                phone={phone}
                address={address}
                creditLimit={creditLimit}
                dueTermsDays={dueTermsDays}
                setName={setName}
                setPhone={setPhone}
                setAddress={setAddress}
                setCreditLimit={setCreditLimit}
                setDueTermsDays={setDueTermsDays}
                onSave={handleSaveCustomer}
                onCancel={handleCancel}
                saving={saving}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <FlatList
          data={displayedCustomers}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View>
              <Text style={styles.title}>কাস্টমার</Text>

              <CustomerSearchControls
                searchText={searchText}
                setSearchText={setSearchText}
                dueFilter={dueFilter}
                setDueFilter={setDueFilter}
                sortBy={sortBy}
                setSortBy={setSortBy}
                onClear={clearCustomerControls}
              />

              {/* Filter chips with live counts */}
              <View style={styles.chipRow}>
                {DUE_FILTER_CHIPS.map((chip) => (
                  <TouchableOpacity
                    key={chip.value}
                    style={[styles.chip, dueFilter === chip.value && styles.chipActive]}
                    onPress={() => setDueFilter(chip.value)}
                  >
                    <Text style={[styles.chipText, dueFilter === chip.value && styles.chipTextActive]}>
                      {chip.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.headerRow}>
                <Text style={styles.sectionTitle}>কাস্টমার তালিকা</Text>
                <TouchableOpacity style={styles.refreshButton} onPress={refreshAll}>
                  <Text style={styles.refreshText}>{refreshing ? 'রিফ্রেশ হচ্ছে...' : 'রিফ্রেশ'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {hasActiveCustomerControls ? 'কোনো কাস্টমার পাওয়া যায়নি।' : 'কোনো কাস্টমার নেই।'}
            </Text>
          }
          renderItem={({ item }) => <CustomerListItem item={item} onEdit={handleEdit} onDelete={handleDelete} />}
        />

        {/* FAB */}
        <TouchableOpacity
          style={styles.fab}
          activeOpacity={0.85}
          onPress={() => { resetForm(); setShowForm(true); }}
        >
          <MaterialIcons name="add" size={28} color={UI_COLORS.textOnPrimary} />
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: UI_COLORS.background },
  flex: { flex: 1 },
  container: { padding: 20, gap: 12, paddingBottom: 96 },
  title: { fontSize: 28, fontWeight: '700', color: UI_COLORS.textPrimary, marginBottom: 12 },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    marginBottom: 4,
  },
  chip: {
    borderRadius: 99,
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
    backgroundColor: UI_COLORS.surfaceSubtle,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipActive: {
    backgroundColor: UI_COLORS.primary,
    borderColor: UI_COLORS.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: UI_COLORS.primary,
  },
  chipTextActive: {
    color: UI_COLORS.textOnPrimary,
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
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minHeight: 38,
    justifyContent: 'center',
  },
  refreshText: { color: UI_COLORS.primary, fontSize: 13, fontWeight: '600' },
  emptyText: { fontSize: 14, color: UI_COLORS.textMuted },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: UI_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: UI_COLORS.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 32,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
});
