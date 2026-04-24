import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';

export default function CustomerChipSelector({ customers = [], selectedId, onSelect, onAddNew }) {
  const [search, setSearch] = useState('');

  const sorted = useMemo(
    () => [...customers].sort((a, b) => Number(b.total_due || 0) - Number(a.total_due || 0)),
    [customers],
  );

  const topFour = sorted.slice(0, 4);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return sorted
      .filter(
        (c) =>
          String(c.name || '').toLowerCase().includes(q) ||
          String(c.phone || '').includes(q),
      )
      .slice(0, 6);
  }, [sorted, search]);

  const selected = customers.find((c) => String(c.id) === String(selectedId));
  const noResults = search.trim() !== '' && results.length === 0;

  if (selected) {
    return (
      <TouchableOpacity style={styles.selectedChip} onPress={() => onSelect('')} activeOpacity={0.8}>
        <View style={styles.selectedChipInner}>
          <MaterialIcons name="person" size={16} color={UI_COLORS.primary} />
          <Text style={styles.selectedChipName} numberOfLines={1}>{selected.name}</Text>
          {Number(selected.total_due || 0) > 0 && (
            <Text style={styles.selectedChipDue}>৳{Number(selected.total_due).toFixed(0)}</Text>
          )}
        </View>
        <MaterialIcons name="close" size={16} color={UI_COLORS.textMuted} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.wrap}>
      {/* Top-4 chips + persistent add button */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {topFour.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={styles.chip}
            activeOpacity={0.78}
            onPress={() => { onSelect(String(c.id)); setSearch(''); }}
          >
            <Text style={styles.chipName} numberOfLines={1}>{c.name}</Text>
            {Number(c.total_due || 0) > 0 && (
              <Text style={styles.chipDue}>৳{Number(c.total_due).toFixed(0)}</Text>
            )}
          </TouchableOpacity>
        ))}

        {/* Always-visible add chip in the row */}
        {onAddNew ? (
          <TouchableOpacity style={styles.addChip} onPress={onAddNew} activeOpacity={0.78}>
            <MaterialIcons name="add" size={14} color={UI_COLORS.success} />
            <Text style={styles.addChipText}>নতুন কাস্টমার</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      {/* Search row */}
      <View style={styles.searchRow}>
        <MaterialIcons name="search" size={16} color={UI_COLORS.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="নাম বা ফোন দিয়ে খুঁজুন..."
          placeholderTextColor={UI_COLORS.textMuted}
          style={styles.searchInput}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={14} color={UI_COLORS.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Search results */}
      {results.length > 0 && (
        <View style={styles.resultList}>
          {results.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={styles.resultRow}
              activeOpacity={0.75}
              onPress={() => { onSelect(String(c.id)); setSearch(''); }}
            >
              <View style={styles.resultInfo}>
                <Text style={styles.resultName}>{c.name}</Text>
                {c.phone ? <Text style={styles.resultPhone}>{c.phone}</Text> : null}
              </View>
              {Number(c.total_due || 0) > 0 && (
                <Text style={styles.resultDue}>৳{Number(c.total_due).toFixed(0)}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* No results → prominent add button */}
      {noResults && onAddNew ? (
        <TouchableOpacity style={styles.addNewProminent} onPress={onAddNew} activeOpacity={0.82}>
          <MaterialIcons name="person-add" size={18} color={UI_COLORS.textOnPrimary} />
          <Text style={styles.addNewProminentText}>+ "{search.trim()}" নতুন কাস্টমার যোগ করুন</Text>
        </TouchableOpacity>
      ) : noResults ? (
        <Text style={styles.noResult}>কোনো কাস্টমার পাওয়া যায়নি।</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: UI_COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: UI_COLORS.surfaceSoft,
  },
  selectedChipInner: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  selectedChipName: { fontSize: 15, fontWeight: '700', color: UI_COLORS.textPrimary, flex: 1 },
  selectedChipDue: { fontSize: 12, color: UI_COLORS.textDanger, fontWeight: '700' },
  wrap: { gap: 8 },
  chipRow: { gap: 8, paddingVertical: 2 },
  chip: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: UI_COLORS.surface,
    alignItems: 'center',
    minWidth: 72,
    maxWidth: 130,
  },
  chipName: { fontSize: 13, fontWeight: '700', color: UI_COLORS.textPrimary, textAlign: 'center' },
  chipDue: { fontSize: 11, color: UI_COLORS.textDanger, marginTop: 2, fontWeight: '700' },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderColor: UI_COLORS.success,
    borderRadius: 10,
    borderStyle: 'dashed',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: UI_COLORS.surfaceSuccess,
    minWidth: 72,
  },
  addChipText: { fontSize: 12, fontWeight: '700', color: UI_COLORS.success },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: UI_COLORS.surface,
  },
  searchInput: { flex: 1, fontSize: 14, color: UI_COLORS.textPrimary, paddingVertical: 0 },
  resultList: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: UI_COLORS.surface,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.borderSoft,
  },
  resultInfo: { flex: 1, gap: 2 },
  resultName: { fontSize: 15, fontWeight: '600', color: UI_COLORS.textPrimary },
  resultPhone: { fontSize: 12, color: UI_COLORS.textMuted },
  resultDue: { fontSize: 13, color: UI_COLORS.textDanger, fontWeight: '700' },
  addNewProminent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: UI_COLORS.success,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  addNewProminentText: {
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.textOnPrimary,
    flexShrink: 1,
  },
  noResult: { fontSize: 13, color: UI_COLORS.textMuted, textAlign: 'center', paddingVertical: 10 },
});
