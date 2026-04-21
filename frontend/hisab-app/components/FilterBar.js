import { ScrollView, Pressable, StyleSheet, Text, View } from 'react-native';

import { UI_COLORS } from '../constants/ui-theme';

const HORIZONS = ['all', '1W', '1M'];
const URGENCY = ['all', 'high', 'medium', 'low'];
const CONFIDENCE_STEPS = [0, 0.4, 0.6, 0.8];

function Chip({ active = false, label = '', onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active ? styles.chipActive : null]}>
      <Text style={[styles.chipLabel, active ? styles.chipLabelActive : null]}>{label}</Text>
    </Pressable>
  );
}

export default function FilterBar({
  filters,
  categories = [],
  onChange,
}) {
  return (
    <View style={styles.root}>
      <Text style={styles.sectionTitle}>Filters</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {URGENCY.map((token) => (
          <Chip
            key={`urgency-${token}`}
            active={filters.urgency === token}
            label={token === 'all' ? 'Urgency: All' : `Urgency: ${token}`}
            onPress={() => onChange({ urgency: token })}
          />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {CONFIDENCE_STEPS.map((threshold) => (
          <Chip
            key={`confidence-${threshold}`}
            active={filters.confidenceThreshold === threshold}
            label={threshold <= 0 ? 'Confidence: Any' : `Confidence: ${Math.round(threshold * 100)}%+`}
            onPress={() => onChange({ confidenceThreshold: threshold })}
          />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {HORIZONS.map((token) => (
          <Chip
            key={`horizon-${token}`}
            active={filters.horizon === token}
            label={token === 'all' ? 'Horizon: All' : `Horizon: ${token}`}
            onPress={() => onChange({ horizon: token })}
          />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <Chip
          key="category-all"
          active={filters.category === 'all'}
          label="Category: All"
          onPress={() => onChange({ category: 'all' })}
        />
        {categories.map((category) => (
          <Chip
            key={`category-${category}`}
            active={filters.category === category}
            label={category}
            onPress={() => onChange({ category })}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: UI_COLORS.textSecondary,
  },
  row: {
    gap: 8,
    paddingRight: 8,
  },
  chip: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
    backgroundColor: UI_COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipActive: {
    borderColor: UI_COLORS.primary,
    backgroundColor: UI_COLORS.surfaceInfo,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: UI_COLORS.textSecondary,
  },
  chipLabelActive: {
    color: UI_COLORS.primary,
  },
});
