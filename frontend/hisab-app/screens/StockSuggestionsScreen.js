import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import FilterBar from '../components/FilterBar';
import SuggestionCard from '../components/SuggestionCard';
import { UI_COLORS } from '../constants/ui-theme';
import { useAuth } from '../context/AuthContext';
import { fetchStockSuggestionsOnline } from '../services/backend/suggestionsApi';

const DEFAULT_FILTERS = {
  urgency: 'all',
  confidenceThreshold: 0,
  horizon: 'all',
  category: 'all',
};

const normalizeHorizon = (value) => {
  const token = String(value || '').trim().toUpperCase();
  if (token === '1D') {
    return '1D';
  }
  if (token === '1W' || token === '7D') {
    return '7D';
  }
  if (token === '1M') {
    return '1M';
  }
  return '7D';
};

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const deriveUrgency = (suggestion) => {
  const explicit = String(suggestion?.urgency || '').trim().toLowerCase();
  if (explicit === 'high' || explicit === 'medium' || explicit === 'low') {
    return explicit;
  }

  const decision = String(suggestion?.decision || '').trim().toUpperCase();
  const confidence = toNumber(suggestion?.confidence, 0);

  if (decision === 'BUY_NOW') {
    return confidence >= 0.75 ? 'high' : 'medium';
  }
  if (decision === 'WATCH') {
    return 'medium';
  }
  return 'low';
};

function ErrorState({ message, onRetry }) {
  return (
    <View style={styles.centerState}>
      <MaterialIcons name="wifi-off" size={36} color={UI_COLORS.danger} />
      <Text style={styles.stateTitle}>পরামর্শ লোড হয়নি</Text>
      <Text style={styles.stateText}>{message || 'Please try again.'}</Text>
      <Pressable style={styles.retryButton} onPress={onRetry}>
        <Text style={styles.retryButtonText}>আবার চেষ্টা করুন</Text>
      </Pressable>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.centerState}>
      <MaterialIcons name="inventory" size={36} color={UI_COLORS.textMuted} />
      <Text style={styles.stateTitle}>কোনো পরামর্শ নেই</Text>
      <Text style={styles.stateText}>ফিল্টার পরিবর্তন করুন বা পরে রিফ্রেশ করুন।</Text>
    </View>
  );
}

export default function StockSuggestionsScreen() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [expandedMap, setExpandedMap] = useState({});
  const [holidayNameInput, setHolidayNameInput] = useState('');
  const [holidayDateInput, setHolidayDateInput] = useState('');
  const [manualHolidays, setManualHolidays] = useState([]);

  const addManualHoliday = useCallback(() => {
    const name = String(holidayNameInput || '').trim();
    const date = String(holidayDateInput || '').trim();
    if (!name || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return;
    }

    setManualHolidays((prev) => {
      const key = `${date}|${name.toLowerCase()}`;
      if (prev.some((item) => `${item.date}|${String(item.name || '').toLowerCase()}` === key)) {
        return prev;
      }
      return [...prev, { name, date }];
    });
    setHolidayNameInput('');
    setHolidayDateInput('');
  }, [holidayDateInput, holidayNameInput]);

  const removeManualHoliday = useCallback((index) => {
    setManualHolidays((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  }, []);

  const loadSuggestions = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const data = await fetchStockSuggestionsOnline({
        accessToken: session?.access_token || null,
        currentState: 'SIDEWAYS_STABLE',
        horizons: ['7D', '1D'],
        holidayDates: manualHolidays,
        holidayImpact: 1,
      });

      const rows = Array.isArray(data?.suggestions) ? data.suggestions : [];
      const categories = Array.isArray(data?.filters?.categories)
        ? data.filters.categories.map((item) => String(item || '').trim()).filter(Boolean)
        : [];

      setSuggestions(rows);
      setCategoryOptions(categories);
      setExpandedMap({});
    } catch (loadError) {
      setError(loadError?.message || 'Unable to fetch suggestions from the server.');
      setSuggestions([]);
      setCategoryOptions([]);
    } finally {
      setLoading(false);
    }
  }, [manualHolidays, session?.access_token]);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  const filteredSuggestions = useMemo(() => {
    return suggestions.filter((row) => {
      const rowUrgency = deriveUrgency(row);
      const rowConfidence = toNumber(row?.confidence, 0);
      const rowHorizon = normalizeHorizon(row?.horizon);
      const rowCategory = String(row?.category || 'General').trim() || 'General';

      if (filters.urgency !== 'all' && rowUrgency !== filters.urgency) {
        return false;
      }

      if (rowConfidence < toNumber(filters.confidenceThreshold, 0)) {
        return false;
      }

      if (filters.horizon !== 'all' && rowHorizon !== filters.horizon) {
        return false;
      }

      if (filters.category !== 'all' && rowCategory !== filters.category) {
        return false;
      }

      return true;
    });
  }, [filters.category, filters.confidenceThreshold, filters.horizon, filters.urgency, suggestions]);

  const onChangeFilters = useCallback((partial) => {
    setFilters((prev) => ({
      ...prev,
      ...partial,
    }));
  }, []);

  const toggleExplain = useCallback((key) => {
    setExpandedMap((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>স্টক পরামর্শ</Text>
          <Text style={styles.subtitle}>ব্যাখ্যাযোগ্য মডেলভিত্তিক পদক্ষেপ</Text>
        </View>

        <FilterBar
          filters={filters}
          categories={categoryOptions}
          onChange={onChangeFilters}
        />

        <View style={styles.holidayCard}>
          <Text style={styles.holidayTitle}>Holiday adjustment</Text>
          <Text style={styles.holidaySubtitle}>Add manual dates (YYYY-MM-DD) for Ramadan, Eid, or any holiday.</Text>
          <View style={styles.holidayRow}>
            <TextInput
              value={holidayNameInput}
              onChangeText={setHolidayNameInput}
              placeholder="Holiday name"
              style={styles.holidayInput}
            />
            <TextInput
              value={holidayDateInput}
              onChangeText={setHolidayDateInput}
              placeholder="YYYY-MM-DD"
              style={styles.holidayInput}
            />
            <Pressable style={styles.holidayAddButton} onPress={addManualHoliday}>
              <Text style={styles.holidayAddButtonText}>Add</Text>
            </Pressable>
          </View>
          {manualHolidays.length > 0 ? (
            <View style={styles.holidayChipWrap}>
              {manualHolidays.map((item, index) => (
                <Pressable
                  key={`${item.date}-${item.name}-${index}`}
                  style={styles.holidayChip}
                  onPress={() => removeManualHoliday(index)}
                >
                  <Text style={styles.holidayChipText}>{`${item.name} (${item.date})`}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={UI_COLORS.primary} />
            <Text style={styles.stateText}>পরামর্শ লোড হচ্ছে...</Text>
          </View>
        ) : null}

        {!loading && error ? (
          <ErrorState message={error} onRetry={loadSuggestions} />
        ) : null}

        {!loading && !error ? (
          <FlatList
            data={filteredSuggestions}
            keyExtractor={(item, index) => `${String(item?.symbol || 'row')}-${String(item?.horizon || '7D')}-${index}`}
            renderItem={({ item, index }) => {
              const key = `${String(item?.symbol || 'row')}-${String(item?.horizon || '7D')}-${index}`;
              return (
                <SuggestionCard
                  suggestion={item}
                  explainOpen={Boolean(expandedMap[key])}
                  onToggleExplain={() => toggleExplain(key)}
                />
              );
            }}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={<EmptyState />}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: UI_COLORS.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  header: {
    marginBottom: 10,
    gap: 4,
  },
  holidayCard: {
    backgroundColor: UI_COLORS.surfaceSubtle,
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    gap: 8,
  },
  holidayTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  holidaySubtitle: {
    fontSize: 12,
    color: UI_COLORS.textSecondary,
  },
  holidayRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  holidayInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
    borderRadius: 8,
    backgroundColor: UI_COLORS.surface,
    color: UI_COLORS.textPrimary,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
  },
  holidayAddButton: {
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI_COLORS.primary,
  },
  holidayAddButtonText: {
    color: UI_COLORS.surface,
    fontSize: 12,
    fontWeight: '700',
  },
  holidayChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  holidayChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
    backgroundColor: UI_COLORS.surface,
  },
  holidayChipText: {
    fontSize: 11,
    color: UI_COLORS.textSecondary,
    fontWeight: '600',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: UI_COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: UI_COLORS.textSecondary,
  },
  separator: {
    height: 8,
  },
  listContent: {
    paddingBottom: 22,
    borderRadius: 14,
    backgroundColor: UI_COLORS.surface,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
  },
  centerState: {
    flex: 1,
    minHeight: 220,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
  },
  stateTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: UI_COLORS.textPrimary,
  },
  stateText: {
    fontSize: 13,
    fontWeight: '600',
    color: UI_COLORS.textSecondary,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 44,
    minWidth: 124,
    borderRadius: 12,
    backgroundColor: UI_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  retryButtonText: {
    color: UI_COLORS.textOnPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
});
