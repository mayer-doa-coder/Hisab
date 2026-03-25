import { Picker } from '@react-native-picker/picker';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';
import { CUSTOMER_DUE_FILTERS, CUSTOMER_SORT_OPTIONS } from '../../services/customers/customerSearchUtils';

const SORT_ITEMS = [
  { label: 'Recent Added', value: CUSTOMER_SORT_OPTIONS.RECENT },
  { label: 'Name A-Z', value: CUSTOMER_SORT_OPTIONS.NAME_ASC },
  { label: 'Name Z-A', value: CUSTOMER_SORT_OPTIONS.NAME_DESC },
  { label: 'Due High-Low', value: CUSTOMER_SORT_OPTIONS.DUE_DESC },
  { label: 'Due Low-High', value: CUSTOMER_SORT_OPTIONS.DUE_ASC },
];

export default function CustomerSearchControls({
  searchText,
  setSearchText,
  dueFilter,
  setDueFilter,
  sortBy,
  setSortBy,
  onClear,
}) {
  return (
    <View style={styles.wrap}>
      <TextInput
        value={searchText}
        onChangeText={setSearchText}
        placeholder="Search by name or phone"
        style={styles.input}
      />

      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, dueFilter === CUSTOMER_DUE_FILTERS.ALL && styles.filterChipActive]}
          onPress={() => setDueFilter(CUSTOMER_DUE_FILTERS.ALL)}
        >
          <Text style={[styles.filterChipText, dueFilter === CUSTOMER_DUE_FILTERS.ALL && styles.filterChipTextActive]}>
            All Customers
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, dueFilter === CUSTOMER_DUE_FILTERS.DUE_ONLY && styles.filterChipActive]}
          onPress={() => setDueFilter(CUSTOMER_DUE_FILTERS.DUE_ONLY)}
        >
          <Text
            style={[
              styles.filterChipText,
              dueFilter === CUSTOMER_DUE_FILTERS.DUE_ONLY && styles.filterChipTextActive,
            ]}
          >
            Due {'>'} 0
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, dueFilter === CUSTOMER_DUE_FILTERS.NO_DUE && styles.filterChipActive]}
          onPress={() => setDueFilter(CUSTOMER_DUE_FILTERS.NO_DUE)}
        >
          <Text
            style={[
              styles.filterChipText,
              dueFilter === CUSTOMER_DUE_FILTERS.NO_DUE && styles.filterChipTextActive,
            ]}
          >
            No Due
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sortLabel}>Sort By</Text>
      <View style={styles.pickerWrap}>
        <Picker selectedValue={sortBy} onValueChange={(value) => setSortBy(String(value))}>
          {SORT_ITEMS.map((item) => (
            <Picker.Item key={item.value} label={item.label} value={item.value} />
          ))}
        </Picker>
      </View>

      <TouchableOpacity style={styles.clearButton} onPress={onClear}>
        <Text style={styles.clearText}>Clear Search / Filter / Sort</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: UI_COLORS.surface,
    gap: 8,
  },
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
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    borderRadius: 99,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  filterChipActive: {
    backgroundColor: '#E7EEFF',
  },
  filterChipText: {
    fontSize: 12,
    color: UI_COLORS.textSecondary,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: UI_COLORS.primary,
  },
  sortLabel: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: UI_COLORS.textSecondary,
  },
  pickerWrap: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    backgroundColor: UI_COLORS.surface,
    overflow: 'hidden',
  },
  clearButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  clearText: {
    fontSize: 12,
    fontWeight: '700',
    color: UI_COLORS.textSecondary,
  },
});
