import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';

const DUE_FILTERS = [
  { label: 'সব', value: 'all' },
  { label: 'বাকি আছে', value: 'with-due' },
  { label: 'বাকি নেই', value: 'no-due' },
];

export default function BakiFilters({
  search,
  setSearch,
  selectedCustomerId,
  setSelectedCustomerId,
  dueFilter,
  setDueFilter,
  customers,
}) {
  const topCustomers = useMemo(
    () =>
      [...customers]
        .sort((a, b) => Number(b.total_due || 0) - Number(a.total_due || 0))
        .slice(0, 6),
    [customers],
  );

  return (
    <View style={styles.filterWrap}>
      {/* Text search */}
      <View style={styles.searchRow}>
        <MaterialIcons name="search" size={18} color={UI_COLORS.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="নাম বা নোট দিয়ে খুঁজুন..."
          placeholderTextColor={UI_COLORS.textMuted}
          style={styles.searchInput}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={16} color={UI_COLORS.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Customer chips */}
      <Text style={styles.sectionLabel}>কাস্টমার</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <TouchableOpacity
          style={[styles.chip, selectedCustomerId === 'all' && styles.chipActive]}
          activeOpacity={0.78}
          onPress={() => setSelectedCustomerId('all')}
        >
          <Text style={[styles.chipText, selectedCustomerId === 'all' && styles.chipTextActive]}>সব</Text>
        </TouchableOpacity>
        {topCustomers.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={[styles.chip, String(c.id) === String(selectedCustomerId) && styles.chipActive]}
            activeOpacity={0.78}
            onPress={() => setSelectedCustomerId(String(c.id))}
          >
            <Text
              style={[styles.chipText, String(c.id) === String(selectedCustomerId) && styles.chipTextActive]}
              numberOfLines={1}
            >
              {c.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Due status chips */}
      <Text style={styles.sectionLabel}>বাকির অবস্থা</Text>
      <View style={styles.dueChipRow}>
        {DUE_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[styles.dueChip, dueFilter === f.value && styles.dueChipActive]}
            activeOpacity={0.78}
            onPress={() => setDueFilter(f.value)}
          >
            <Text style={[styles.dueChipText, dueFilter === f.value && styles.dueChipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
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
  chip: {
    borderRadius: 99,
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
    backgroundColor: UI_COLORS.surfaceSubtle,
    paddingHorizontal: 14,
    paddingVertical: 9,
    maxWidth: 140,
    minHeight: 38,
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: UI_COLORS.primary,
    borderColor: UI_COLORS.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: UI_COLORS.textSecondary,
  },
  chipTextActive: {
    color: UI_COLORS.textOnPrimary,
  },
  dueChipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dueChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
    backgroundColor: UI_COLORS.surfaceSubtle,
    minHeight: 40,
    justifyContent: 'center',
  },
  dueChipActive: {
    backgroundColor: UI_COLORS.primary,
    borderColor: UI_COLORS.primary,
  },
  dueChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: UI_COLORS.textSecondary,
  },
  dueChipTextActive: {
    color: UI_COLORS.textOnPrimary,
  },
});
