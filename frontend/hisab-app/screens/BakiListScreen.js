import { useMemo, useState } from 'react';
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
import BakiEntryForm from './baki/BakiEntryForm';
import BakiFilters from './baki/BakiFilters';
import BakiListItem from './baki/BakiListItem';
import BakiSummaryCards from './baki/BakiSummaryCards';

const STATUS_OPTIONS = ['unpaid', 'partial', 'paid'];

export default function BakiListScreen() {
  const { customers, bakiRows, addBaki, updateBakiStatus, deleteBaki, refreshAll, refreshing } = useAppData();

  const [selectedCustomerId, setSelectedCustomerId] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('unpaid');
  const [saving, setSaving] = useState(false);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return bakiRows.filter((row) => {
      const matchCustomer = selectedCustomerId === 'all' || Number(row.customer_id) === Number(selectedCustomerId);
      const matchStatus = statusFilter === 'all' || row.status === statusFilter;
      const matchQuery =
        !query ||
        String(row.customer_name || '').toLowerCase().includes(query) ||
        String(row.note || '').toLowerCase().includes(query);

      return matchCustomer && matchStatus && matchQuery;
    });
  }, [bakiRows, search, selectedCustomerId, statusFilter]);

  const summary = useMemo(() => {
    const totalDue = filteredRows.reduce((sum, row) => sum + Number(row.due_amount || 0), 0);
    const paidCount = filteredRows.filter((row) => row.status === 'paid').length;
    const unpaidCount = filteredRows.filter((row) => row.status !== 'paid').length;

    return {
      totalDue,
      paidCount,
      unpaidCount,
      totalRows: filteredRows.length,
    };
  }, [filteredRows]);

  const handleAddBaki = async () => {
    if (saving) {
      return;
    }

    try {
      setSaving(true);
      await addBaki({
        customerId: Number(customerId),
        amount: Number(amount),
        note,
        status,
      });

      setAmount('');
      setNote('');
      setStatus('unpaid');
      Alert.alert('Success', 'Baki entry added successfully.');
    } catch (error) {
      Alert.alert('Save Failed', error?.message || 'Unable to add baki entry.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (entry, nextStatus) => {
    try {
      await updateBakiStatus({ id: entry.id, status: nextStatus });
      Alert.alert('Success', `Baki status updated to ${nextStatus}.`);
    } catch (error) {
      Alert.alert('Update Failed', error?.message || 'Unable to update status.');
    }
  };

  const handleDelete = (entry) => {
    Alert.alert('Delete Baki', `Delete entry for ${entry.customer_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteBaki(entry.id);
            Alert.alert('Deleted', 'Baki entry deleted successfully.');
          } catch (error) {
            Alert.alert('Delete Failed', error?.message || 'Unable to delete baki entry.');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <FlatList
          data={filteredRows}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View>
              <Text style={styles.title}>Baki List</Text>
              <Text style={styles.subtitle}>Full baki tracking, status updates, and record control.</Text>

              <BakiSummaryCards
                totalRows={summary.totalRows}
                totalDue={summary.totalDue}
                paidCount={summary.paidCount}
                unpaidCount={summary.unpaidCount}
              />

              <BakiEntryForm
                customers={customers}
                customerId={customerId}
                setCustomerId={setCustomerId}
                amount={amount}
                setAmount={setAmount}
                status={status}
                setStatus={setStatus}
                note={note}
                setNote={setNote}
                statusOptions={STATUS_OPTIONS}
                onSave={handleAddBaki}
                saving={saving}
                refreshing={refreshing}
              />

              <BakiFilters
                search={search}
                setSearch={setSearch}
                selectedCustomerId={selectedCustomerId}
                setSelectedCustomerId={setSelectedCustomerId}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                customers={customers}
                statusOptions={STATUS_OPTIONS}
              />

              <View style={styles.headerRow}>
                <Text style={styles.sectionTitle}>Baki Records</Text>
                <TouchableOpacity style={styles.refreshButton} onPress={refreshAll}>
                  <Text style={styles.refreshText}>{refreshing ? 'Refreshing...' : 'Refresh'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          }
          ListEmptyComponent={<Text style={styles.emptyText}>No baki record found.</Text>}
          renderItem={({ item }) => <BakiListItem item={item} onUpdateStatus={handleUpdateStatus} onDelete={handleDelete} />}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: UI_COLORS.background },
  flex: { flex: 1 },
  container: { padding: 16, gap: 12 },
  title: { fontSize: 26, fontWeight: '700', color: UI_COLORS.textPrimary },
  subtitle: { marginTop: 4, fontSize: 13, color: UI_COLORS.textSecondary, marginBottom: 8 },
  headerRow: {
    marginTop: 16,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: { fontSize: 19, fontWeight: '700', color: UI_COLORS.textPrimary },
  refreshButton: {
    backgroundColor: '#E7EEFF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  refreshText: { color: UI_COLORS.primary, fontSize: 12, fontWeight: '600' },
  emptyText: { fontSize: 14, color: UI_COLORS.textMuted },
});
