import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { UI_COLORS } from '../constants/ui-theme';
import ConfidenceBar from './ConfidenceBar';

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

export default function ExplainPanel({
  isOpen = false,
  onToggle,
  modelBreakdown = null,
  rationale = '',
  confidenceBand = null,
  explanation = null,
}) {
  const ema = toNumber(modelBreakdown?.ema, 0);
  const threshold = toNumber(modelBreakdown?.threshold, 0);
  const markov = toNumber(modelBreakdown?.markov, 0);
  const expectedDemand = toNumber(confidenceBand?.expected, 0);
  const lowerDemand = toNumber(confidenceBand?.lower, 0);
  const upperDemand = toNumber(confidenceBand?.upper, 0);

  const explanationSummary = String(explanation?.summary || '').trim();
  const explanationDrivers = Array.isArray(explanation?.drivers)
    ? explanation.drivers.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const modelContext = Array.isArray(explanation?.model_context)
    ? explanation.model_context.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const trustNote = String(explanation?.trust_note || '').trim();

  return (
    <View style={styles.root}>
      <Pressable style={styles.headerButton} onPress={onToggle}>
        <Text style={styles.headerText}>Why this suggestion</Text>
        <MaterialIcons
          name={isOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
          size={22}
          color={UI_COLORS.textSecondary}
        />
      </Pressable>

      {isOpen ? (
        <View style={styles.panelBody}>
          <View style={styles.row}>
            <Text style={styles.metricLabel}>EMA</Text>
            <ConfidenceBar value={ema} />
          </View>

          <View style={styles.row}>
            <Text style={styles.metricLabel}>Threshold</Text>
            <ConfidenceBar value={threshold} />
          </View>

          <View style={styles.row}>
            <Text style={styles.metricLabel}>Markov</Text>
            <ConfidenceBar value={markov} />
          </View>

          <View style={styles.rationaleWrap}>
            <Text style={styles.rationaleLabel}>Rationale</Text>
            <Text style={styles.rationaleText}>{String(rationale || 'No rationale available.')}</Text>
          </View>

          <View style={styles.rationaleWrap}>
            <Text style={styles.rationaleLabel}>Confidence Band</Text>
            <Text style={styles.rationaleText}>
              {`${Math.round(expectedDemand)} expected (${Math.round(lowerDemand)}-${Math.round(upperDemand)}) units`}
            </Text>
          </View>

          {explanationSummary ? (
            <View style={styles.rationaleWrap}>
              <Text style={styles.rationaleLabel}>Summary</Text>
              <Text style={styles.rationaleText}>{explanationSummary}</Text>
            </View>
          ) : null}

          {explanationDrivers.length > 0 ? (
            <View style={styles.rationaleWrap}>
              <Text style={styles.rationaleLabel}>Key Drivers</Text>
              {explanationDrivers.map((item, index) => (
                <Text key={`driver-${index}`} style={styles.rationaleText}>{`- ${item}`}</Text>
              ))}
            </View>
          ) : null}

          {modelContext.length > 0 ? (
            <View style={styles.rationaleWrap}>
              <Text style={styles.rationaleLabel}>Model Context</Text>
              {modelContext.map((item, index) => (
                <Text key={`model-context-${index}`} style={styles.rationaleText}>{`- ${item}`}</Text>
              ))}
            </View>
          ) : null}

          {trustNote ? (
            <View style={styles.rationaleWrap}>
              <Text style={styles.rationaleLabel}>Trust Signal</Text>
              <Text style={styles.rationaleText}>{trustNote}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: UI_COLORS.borderSoft,
    paddingTop: 8,
  },
  headerButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerText: {
    fontSize: 13,
    fontWeight: '700',
    color: UI_COLORS.textSecondary,
  },
  panelBody: {
    gap: 10,
    paddingBottom: 2,
  },
  row: {
    gap: 6,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: UI_COLORS.textMuted,
  },
  rationaleWrap: {
    marginTop: 4,
    gap: 4,
  },
  rationaleLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: UI_COLORS.textMuted,
  },
  rationaleText: {
    fontSize: 13,
    lineHeight: 18,
    color: UI_COLORS.textPrimary,
  },
});
