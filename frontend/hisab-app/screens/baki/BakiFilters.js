import { Picker } from '@react-native-picker/picker';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';

export default function BakiFilters({
  search,
  setSearch,
  selectedCustomerId,
  setSelectedCustomerId,
  statusFilter,
  setStatusFilter,
  customers,
  statusOptions,
}) {
  return (
    <View style={styles.filterWrap}>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search by customer or note"
        style={styles.input}
      />

      <View style={styles.formRow}>
        <View style={styles.col}>
          <Text style={styles.label}>Filter by Customer</Text>
          <View style={styles.pickerContainer}>
            <Picker selectedValue={selectedCustomerId} onValueChange={setSelectedCustomerId} style={styles.picker}>
              <Picker.Item label="All customers" value="all" />
              {customers.map((customer) => (
                <Picker.Item key={customer.id} label={customer.name} value={String(customer.id)} />
              ))}
            </Picker>
          </View>
        </View>

        <View style={styles.col}>
          <Text style={styles.label}>Filter by Status</Text>
          <View style={styles.pickerContainer}>
            <Picker selectedValue={statusFilter} onValueChange={setStatusFilter} style={styles.picker}>
              <Picker.Item label="All status" value="all" />
              {statusOptions.map((option) => (
                <Picker.Item key={option} label={option} value={option} />
              ))}
            </Picker>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  filterWrap: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 12,
    backgroundColor: UI_COLORS.surface,
    padding: 12,
    gap: 8,
  },
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
  pickerContainer: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    backgroundColor: UI_COLORS.surface,
    overflow: 'hidden',
  },
  picker: {
    height: 50,
    color: UI_COLORS.textPrimary,
  },
});
