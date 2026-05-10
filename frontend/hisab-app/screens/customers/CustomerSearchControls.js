import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';
import { CUSTOMER_DUE_FILTERS, CUSTOMER_SORT_OPTIONS } from '../../services/customers/customerSearchUtils';

const SORT_OPTIONS = [
  { label: 'নতুন', value: CUSTOMER_SORT_OPTIONS.RECENT },
  { label: 'নাম A-Z', value: CUSTOMER_SORT_OPTIONS.NAME_ASC },
  { label: 'নাম Z-A', value: CUSTOMER_SORT_OPTIONS.NAME_DESC },
  { label: 'বেশি বাকি', value: CUSTOMER_SORT_OPTIONS.DUE_DESC },
  { label: 'কম বাকি', value: CUSTOMER_SORT_OPTIONS.DUE_ASC },
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
  const isActive =
    Boolean(searchText.trim()) ||
    dueFilter !== CUSTOMER_DUE_FILTERS.ALL ||
    sortBy !== CUSTOMER_SORT_OPTIONS.RECENT;

  return (
    <View style={styles.wrap}>
      {/* Search */}
      <View style={styles.searchRow}>
        <MaterialIcons name="search" size={18} color={UI_COLORS.textMuted} />
        <TextInput
          value={searchText}
          onChangeText={setSearchText}
          placeholder="নাম বা ফোন দিয়ে খুঁজুন..."
          placeholderTextColor={UI_COLORS.textMuted}
          style={styles.searchInput}
        />
        {searchText ? (
          <TouchableOpacity onPress={() => setSearchText('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={16} color={UI_COLORS.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Sort chips */}
      <Text style={styles.sectionLabel}>সাজান</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {SORT_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.sortChip, sortBy === opt.value && styles.sortChipActive]}
            activeOpacity={0.78}
            onPress={() => setSortBy(opt.value)}
          >
            <Text style={[styles.sortChipText, sortBy === opt.value && styles.sortChipTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Reset */}
      {isActive && (
        <TouchableOpacity style={styles.clearButton} onPress={onClear}>
          <MaterialIcons name="refresh" size={14} color={UI_COLORS.textSecondary} />
          <Text style={styles.clearText}>রিসেট</Text>
        </TouchableOpacity>
      )}
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
    gap: 10,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: UI_COLORS.surface,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: UI_COLORS.textPrimary,
    paddingVertical: 0,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: UI_COLORS.textSecondary,
    marginBottom: -4,
  },
  chipRow: {
    gap: 8,
    paddingVertical: 2,
  },
  sortChip: {
    borderRadius: 99,
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
    backgroundColor: UI_COLORS.surfaceSubtle,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minHeight: 38,
    justifyContent: 'center',
  },
  sortChipActive: {
    backgroundColor: UI_COLORS.primary,
    borderColor: UI_COLORS.primary,
  },
  sortChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: UI_COLORS.textSecondary,
  },
  sortChipTextActive: {
    color: UI_COLORS.textOnPrimary,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: 10,
    backgroundColor: UI_COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minHeight: 38,
  },
  clearText: {
    fontSize: 12,
    fontWeight: '700',
    color: UI_COLORS.textSecondary,
  },
});
