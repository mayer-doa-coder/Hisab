import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton, AppCard, AppInput } from '../components/ui';
import { UI_COLORS } from '../constants/ui-theme';
import { useAppData } from '../context/AppDataContext';

const formatMoney = (value) => `৳${Number(value || 0).toFixed(2)}`;

export default function SupplierScreen() {
  const {
    listSuppliers,
    addSupplier,
    updateSupplier,
    deleteSupplier,
    refreshAll,
    refreshing,
  } = useAppData();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [editingId, setEditingId] = useState(null);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const nextRows = await listSuppliers({ searchText, limit: 300 });
      setRows(nextRows);
    } finally {
      setLoading(false);
    }
  }, [listSuppliers, searchText]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setPhone('');
    setAddress('');
  };

  const totalDue = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.due_amount || 0), 0),
    [rows]
  );

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('প্রয়োজনীয়', 'সরবরাহকারীর নাম দিন।');
      return;
    }

    if (saving) {
      return;
    }

    try {
      setSaving(true);
      if (editingId) {
        await updateSupplier({ id: editingId, name, phone, address });
      } else {
        await addSupplier({ name, phone, address });
      }

      await loadRows();
      resetForm();
      Alert.alert('সফল', 'সরবরাহকারী সেভ হয়েছে।');
    } catch (error) {
      Alert.alert('সেভ ব্যর্থ', error?.message || 'সরবরাহকারী সেভ করা যায়নি।');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (row) => {
    Alert.alert(
      'Delete Supplier',
      `${row.name} মুছে ফেলবেন? বাকি বা খোলা ক্রয় থাকলে মুছা যাবে না।`,
      [
        { text: 'বাতিল', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSupplier(row.id);
              await loadRows();
              if (Number(editingId) === Number(row.id)) {
                resetForm();
              }
            } catch (error) {
              Alert.alert('মুছতে ব্যর্থ', error?.message || 'সরবরাহকারী মুছে ফেলা যায়নি।');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={rows}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.container}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>সরবরাহকারী</Text>
            <Text style={styles.subtitle}>সরবরাহকারী যোগ ও পরিচালনা করুন।</Text>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>{editingId ? 'সরবরাহকারী সম্পাদনা' : 'নতুন সরবরাহকারী'}</Text>
              <AppInput value={name} onChangeText={setName} placeholder="সরবরাহকারীর নাম" />
              <AppInput value={phone} onChangeText={setPhone} placeholder="ফোন (ঐচ্ছিক)" keyboardType="phone-pad" />
              <AppInput value={address} onChangeText={setAddress} placeholder="ঠিকানা (ঐচ্ছিক)" />

              <View style={styles.buttonRow}>
                <AppButton
                  title={saving ? 'সেভ হচ্ছে...' : editingId ? 'আপডেট করুন' : 'যোগ করুন'}
                  onPress={handleSave}
                  disabled={saving}
                  style={styles.buttonFlex}
                />
                {editingId ? (
                  <AppButton title="বাতিল" onPress={resetForm} variant="secondary" style={styles.buttonFlex} />
                ) : null}
              </View>
            </AppCard>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>অনুসন্ধান</Text>
              <AppInput
                value={searchText}
                onChangeText={setSearchText}
                placeholder="নাম, ফোন বা ঠিকানা দিয়ে খুঁজুন"
              />
              <View style={styles.buttonRow}>
                <AppButton title={loading ? 'ফিল্টার হচ্ছে...' : 'প্রয়োগ করুন'} onPress={loadRows} style={styles.buttonFlex} />
                <AppButton
                  title={refreshing ? 'রিফ্রেশ হচ্ছে...' : 'সব রিফ্রেশ'}
                  variant="secondary"
                  style={styles.buttonFlex}
                  onPress={async () => {
                    await refreshAll();
                    await loadRows();
                  }}
                />
              </View>
              <Text style={styles.summaryText}>সরবরাহকারী: {rows.length} | মোট বাকি: {formatMoney(totalDue)}</Text>
            </AppCard>

            <Text style={styles.sectionTitle}>সরবরাহকারী তালিকা</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.emptyText}>কোনো সরবরাহকারী পাওয়া যায়নি।</Text>}
        renderItem={({ item }) => (
          <AppCard style={styles.rowCard}>
            <View style={styles.rowHeader}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.rowDue}>{formatMoney(item.due_amount)}</Text>
            </View>
            <Text style={styles.rowMeta}>{item.phone || 'ফোন নেই'}</Text>
            <Text style={styles.rowMeta}>{item.address || 'ঠিকানা নেই'}</Text>
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.smallButton, styles.secondaryButton]}
                onPress={() => {
                  setEditingId(Number(item.id));
                  setName(String(item.name || ''));
                  setPhone(String(item.phone || ''));
                  setAddress(String(item.address || ''));
                }}>
                <Text style={styles.secondaryButtonLabel}>সম্পাদনা</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.smallButton, styles.dangerButton]}
                onPress={() => handleDelete(item)}>
                <Text style={styles.dangerButtonLabel}>মুছুন</Text>
              </TouchableOpacity>
            </View>
          </AppCard>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: UI_COLORS.background },
  container: { padding: 18, gap: 12 },
  title: { fontSize: 28, fontWeight: '700', color: UI_COLORS.textPrimary },
  subtitle: { fontSize: 14, color: UI_COLORS.textSecondary, marginBottom: 4 },
  card: { marginTop: 10, gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: UI_COLORS.textPrimary },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  buttonFlex: { flex: 1 },
  summaryText: { fontSize: 13, color: UI_COLORS.textMuted, marginTop: 2 },
  emptyText: { color: UI_COLORS.textMuted, fontSize: 14, paddingVertical: 12 },
  rowCard: { gap: 6 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowTitle: { fontSize: 16, fontWeight: '700', color: UI_COLORS.textPrimary },
  rowDue: { fontSize: 15, fontWeight: '700', color: UI_COLORS.danger },
  rowMeta: { fontSize: 13, color: UI_COLORS.textMuted },
  smallButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: { borderColor: UI_COLORS.borderSoft, backgroundColor: UI_COLORS.surfaceSubtle },
  dangerButton: { borderColor: UI_COLORS.borderDanger, backgroundColor: UI_COLORS.surfaceDanger },
  secondaryButtonLabel: { color: UI_COLORS.primary, fontWeight: '700' },
  dangerButtonLabel: { color: UI_COLORS.textDanger, fontWeight: '700' },
});
