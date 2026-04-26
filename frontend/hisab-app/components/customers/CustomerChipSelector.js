import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';
import { useAppData } from '../../context/AppDataContext';
import { banglishMatch } from '../../utils/banglishSearch';

// ── Ranking helpers ──────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

const daysSince = (isoStr) => {
  if (!isoStr) return 999;
  const ms = Date.now() - new Date(isoStr).getTime();
  return Math.max(0, Math.floor(ms / DAY_MS));
};

// Score: recent activity wins, active baki is a strong signal
const scoreCustomer = (c) => {
  const due = Number(c.total_due || 0);
  const recencyDays = Math.min(daysSince(c.last_payment_date || c.updated_at), 365);
  const recencyScore = 1 - recencyDays / 365; // 0–1, higher = more recent
  const activeBonus = due > 0 ? 0.3 : 0;
  return recencyScore + activeBonus;
};

const useRankedCustomers = (customers) =>
  useMemo(() => {
    if (!customers?.length) return { recent: [], active: [] };

    const scored = customers
      .map((c) => ({ ...c, _score: scoreCustomer(c) }))
      .sort((a, b) => b._score - a._score);

    const recent = scored.slice(0, 5);
    const active = customers
      .filter((c) => Number(c.total_due || 0) > 0)
      .sort((a, b) => Number(b.total_due) - Number(a.total_due))
      .slice(0, 5);

    return { recent, active };
  }, [customers]);

// ── Sub-components ───────────────────────────────────────────────────────────

function CustomerChip({ customer, onPress, isActive }) {
  const due = Number(customer.total_due || 0);
  return (
    <TouchableOpacity
      style={[styles.chip, isActive && styles.chipActive]}
      activeOpacity={0.75}
      onPress={onPress}
    >
      <Text style={[styles.chipName, isActive && styles.chipNameActive]} numberOfLines={1}>
        {customer.name}
      </Text>
      {due > 0 && (
        <Text style={styles.chipDue}>৳{due.toFixed(0)}</Text>
      )}
    </TouchableOpacity>
  );
}

function ResultRow({ customer, onPress }) {
  const due = Number(customer.total_due || 0);
  return (
    <TouchableOpacity style={styles.resultRow} activeOpacity={0.75} onPress={onPress}>
      <View style={styles.resultAvatar}>
        <Text style={styles.resultAvatarText}>
          {String(customer.name || '?').charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.resultInfo}>
        <Text style={styles.resultName} numberOfLines={1}>{customer.name}</Text>
        {customer.phone ? (
          <Text style={styles.resultPhone}>{customer.phone}</Text>
        ) : null}
      </View>
      {due > 0 && (
        <View style={styles.resultDueBadge}>
          <Text style={styles.resultDue}>৳{due.toFixed(0)}</Text>
        </View>
      )}
      <MaterialIcons name="chevron-right" size={18} color={UI_COLORS.textMuted} />
    </TouchableOpacity>
  );
}

// ── Selected state pill ──────────────────────────────────────────────────────

function SelectedPill({ customer, onClear }) {
  const due = Number(customer.total_due || 0);
  return (
    <TouchableOpacity style={styles.selectedPill} onPress={onClear} activeOpacity={0.8}>
      <View style={styles.selectedPillAvatar}>
        <Text style={styles.selectedPillAvatarText}>
          {String(customer.name || '?').charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.selectedPillInfo}>
        <Text style={styles.selectedPillName} numberOfLines={1}>{customer.name}</Text>
        {due > 0 && (
          <Text style={styles.selectedPillDue}>বাকি ৳{due.toFixed(0)}</Text>
        )}
      </View>
      <View style={styles.selectedPillClear}>
        <MaterialIcons name="close" size={14} color={UI_COLORS.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

// ── Inline quick-add form ────────────────────────────────────────────────────

function InlineQuickAdd({ prefillName, onAdded, onDismiss }) {
  const { addCustomer } = useAppData();
  const [name, setName] = useState(prefillName || '');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('নাম দিন', 'কাস্টমারের নাম লিখুন।');
      return;
    }
    if (saving) return;
    try {
      setSaving(true);
      const saved = await addCustomer({
        name: trimmedName,
        phone: phone.trim(),
        address: '',
        creditLimit: 0,
        dueTermsDays: 30,
      });
      onAdded(String(saved.id));
    } catch (err) {
      Alert.alert('ব্যর্থ', err?.message || 'কাস্টমার যোগ করা যায়নি।');
    } finally {
      setSaving(false);
    }
  }, [addCustomer, name, onAdded, phone, saving]);

  return (
    <View style={styles.inlineAdd}>
      <View style={styles.inlineAddHeader}>
        <MaterialIcons name="person-add" size={16} color={UI_COLORS.success} />
        <Text style={styles.inlineAddTitle}>নতুন কাস্টমার যোগ করুন</Text>
        <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name="close" size={16} color={UI_COLORS.textMuted} />
        </TouchableOpacity>
      </View>
      <View style={styles.inlineAddRow}>
        <TextInput
          style={[styles.inlineInput, styles.inlineInputName]}
          value={name}
          onChangeText={setName}
          placeholder="নাম *"
          placeholderTextColor={UI_COLORS.textMuted}
          autoCapitalize="words"
          autoFocus
        />
        <TextInput
          style={[styles.inlineInput, styles.inlineInputPhone]}
          value={phone}
          onChangeText={setPhone}
          placeholder="ফোন"
          placeholderTextColor={UI_COLORS.textMuted}
          keyboardType="phone-pad"
        />
        <TouchableOpacity
          style={[styles.inlineAddBtn, saving && styles.inlineAddBtnDisabled]}
          onPress={handleAdd}
          disabled={saving}
          activeOpacity={0.82}
        >
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <MaterialIcons name="add" size={20} color="#fff" />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function CustomerChipSelector({
  customers = [],
  selectedId,
  onSelect,
  onAddNew,        // optional: open full modal from parent
}) {
  const [search, setSearch] = useState('');
  const [showInlineAdd, setShowInlineAdd] = useState(false);
  const searchRef = useRef(null);

  const { recent, active } = useRankedCustomers(customers);
  const selected = useMemo(
    () => customers.find((c) => String(c.id) === String(selectedId)) || null,
    [customers, selectedId],
  );

  const searchResults = useMemo(() => {
    const q = search.trim();
    if (!q) return [];
    return customers
      .filter(
        (c) =>
          banglishMatch(q, c.name || '') ||
          String(c.phone || '').includes(q),
      )
      .sort((a, b) => Number(b.total_due || 0) - Number(a.total_due || 0))
      .slice(0, 8);
  }, [customers, search]);

  const hasSearch = search.trim().length > 0;
  const noResults = hasSearch && searchResults.length === 0;

  const handleSelect = useCallback(
    (id) => {
      onSelect(String(id));
      setSearch('');
      setShowInlineAdd(false);
    },
    [onSelect],
  );

  const handleInlineAdded = useCallback(
    (id) => {
      handleSelect(id);
    },
    [handleSelect],
  );

  const handleNoResultAdd = useCallback(() => {
    if (onAddNew) {
      onAddNew();
    } else {
      setShowInlineAdd(true);
    }
  }, [onAddNew]);

  // ── Selected state ─────────────────────────────────────────────────────
  if (selected) {
    return <SelectedPill customer={selected} onClear={() => onSelect('')} />;
  }

  // ── Unselected state ───────────────────────────────────────────────────
  const showRecent = !hasSearch && recent.length > 0;
  const showActive = !hasSearch && active.length > 0;

  return (
    <View style={styles.wrap}>
      {/* ── Search bar ─────────────────────────────────────────────────── */}
      <View style={styles.searchBar}>
        <MaterialIcons name="search" size={18} color={UI_COLORS.textMuted} />
        <TextInput
          ref={searchRef}
          value={search}
          onChangeText={(v) => { setSearch(v); setShowInlineAdd(false); }}
          placeholder="নাম, ফোন বা Banglish এ খুঁজুন..."
          placeholderTextColor={UI_COLORS.textMuted}
          style={styles.searchInput}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {search ? (
          <TouchableOpacity
            onPress={() => { setSearch(''); setShowInlineAdd(false); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcons name="cancel" size={18} color={UI_COLORS.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* ── Search results ─────────────────────────────────────────────── */}
      {hasSearch && searchResults.length > 0 && (
        <View style={styles.resultList}>
          {searchResults.map((c) => (
            <ResultRow key={c.id} customer={c} onPress={() => handleSelect(c.id)} />
          ))}
        </View>
      )}

      {/* ── No results → inline add ────────────────────────────────────── */}
      {noResults && !showInlineAdd && (
        <TouchableOpacity style={styles.noResultAdd} onPress={handleNoResultAdd} activeOpacity={0.82}>
          <MaterialIcons name="person-add" size={18} color="#fff" />
          <Text style={styles.noResultAddText}>
            "{search.trim()}" — নতুন কাস্টমার যোগ করুন
          </Text>
        </TouchableOpacity>
      )}

      {noResults && showInlineAdd && (
        <InlineQuickAdd
          prefillName={search.trim()}
          onAdded={handleInlineAdded}
          onDismiss={() => setShowInlineAdd(false)}
        />
      )}

      {/* ── Recent customers ───────────────────────────────────────────── */}
      {showRecent && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="schedule" size={13} color={UI_COLORS.textMuted} />
            <Text style={styles.sectionLabel}>সাম্প্রতিক</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {recent.map((c) => (
              <CustomerChip
                key={c.id}
                customer={c}
                onPress={() => handleSelect(c.id)}
              />
            ))}
            {onAddNew ? (
              <TouchableOpacity style={styles.addChip} onPress={onAddNew} activeOpacity={0.78}>
                <MaterialIcons name="add" size={15} color={UI_COLORS.success} />
                <Text style={styles.addChipText}>নতুন</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        </View>
      )}

      {/* ── Active baki customers ───────────────────────────────────────── */}
      {showActive && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="account-balance" size={13} color={UI_COLORS.textMuted} />
            <Text style={styles.sectionLabel}>সক্রিয় বাকি</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {active.map((c) => (
              <CustomerChip
                key={c.id}
                customer={c}
                onPress={() => handleSelect(c.id)}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── Empty state ────────────────────────────────────────────────── */}
      {!hasSearch && !showRecent && !showActive && (
        <View style={styles.emptyState}>
          <MaterialIcons name="groups" size={32} color={UI_COLORS.textMuted} />
          <Text style={styles.emptyText}>কোনো কাস্টমার নেই</Text>
          {onAddNew ? (
            <TouchableOpacity style={styles.emptyAddBtn} onPress={onAddNew} activeOpacity={0.82}>
              <Text style={styles.emptyAddText}>+ নতুন কাস্টমার যোগ করুন</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrap: { gap: 10 },

  // Search bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: UI_COLORS.surface,
    borderWidth: 1.5,
    borderColor: UI_COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 48,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: UI_COLORS.textPrimary,
    paddingVertical: 0,
  },

  // Section headers
  section: { gap: 6 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: UI_COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // Chips
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
    maxWidth: 140,
    minHeight: 48,
    justifyContent: 'center',
  },
  chipActive: {
    borderColor: UI_COLORS.primary,
    backgroundColor: UI_COLORS.surfaceSoft,
  },
  chipName: {
    fontSize: 13,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
    textAlign: 'center',
  },
  chipNameActive: { color: UI_COLORS.primary },
  chipDue: {
    fontSize: 11,
    color: UI_COLORS.danger,
    marginTop: 2,
    fontWeight: '700',
  },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderColor: UI_COLORS.success,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: UI_COLORS.surfaceSuccess,
    minWidth: 72,
    minHeight: 48,
  },
  addChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: UI_COLORS.success,
  },

  // Search results
  resultList: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: UI_COLORS.surface,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.borderSoft,
    minHeight: 56,
  },
  resultAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: UI_COLORS.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultAvatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: UI_COLORS.primary,
  },
  resultInfo: { flex: 1, gap: 2 },
  resultName: { fontSize: 15, fontWeight: '600', color: UI_COLORS.textPrimary },
  resultPhone: { fontSize: 12, color: UI_COLORS.textMuted },
  resultDueBadge: {
    backgroundColor: UI_COLORS.surfaceDanger,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  resultDue: { fontSize: 12, color: UI_COLORS.danger, fontWeight: '700' },

  // No results → add CTA
  noResultAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: UI_COLORS.success,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  noResultAddText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    flexShrink: 1,
  },

  // Inline quick-add
  inlineAdd: {
    backgroundColor: UI_COLORS.surfaceSuccess,
    borderWidth: 1.5,
    borderColor: UI_COLORS.borderSuccess,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  inlineAddHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inlineAddTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: UI_COLORS.textSuccess,
  },
  inlineAddRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  inlineInput: {
    borderWidth: 1,
    borderColor: UI_COLORS.borderSuccess,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    color: UI_COLORS.textPrimary,
    backgroundColor: UI_COLORS.surface,
    minHeight: 44,
  },
  inlineInputName: { flex: 2 },
  inlineInputPhone: { flex: 1.5 },
  inlineAddBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: UI_COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineAddBtnDisabled: { opacity: 0.6 },

  // Selected pill
  selectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: UI_COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: UI_COLORS.surfaceSoft,
    minHeight: 56,
  },
  selectedPillAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: UI_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedPillAvatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
  },
  selectedPillInfo: { flex: 1, gap: 2 },
  selectedPillName: {
    fontSize: 15,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  selectedPillDue: {
    fontSize: 12,
    color: UI_COLORS.danger,
    fontWeight: '700',
  },
  selectedPillClear: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: UI_COLORS.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 20,
  },
  emptyText: {
    fontSize: 14,
    color: UI_COLORS.textMuted,
    fontWeight: '600',
  },
  emptyAddBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: UI_COLORS.surfaceSuccess,
    borderWidth: 1,
    borderColor: UI_COLORS.borderSuccess,
  },
  emptyAddText: {
    fontSize: 13,
    fontWeight: '700',
    color: UI_COLORS.success,
  },
});
