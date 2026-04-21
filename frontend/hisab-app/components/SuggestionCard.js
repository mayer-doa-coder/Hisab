import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { UI_COLORS } from '../constants/ui-theme';
import ConfidenceBar from './ConfidenceBar';
import ExplainPanel from './ExplainPanel';

const ACTION_META = {
  BUY_NOW: {
    icon: 'shopping-cart-checkout',
    bg: UI_COLORS.surfaceSuccess,
    text: UI_COLORS.textSuccess,
    label: 'Buy Now',
  },
  WATCH: {
    icon: 'visibility',
    bg: UI_COLORS.surfaceWarning,
    text: UI_COLORS.textWarning,
    label: 'Watch',
  },
  HOLD: {
    icon: 'pause-circle-outline',
    bg: UI_COLORS.surfaceInfo,
    text: UI_COLORS.textSecondary,
    label: 'Hold',
  },
};

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

export default function SuggestionCard({
  suggestion,
  explainOpen = false,
  onToggleExplain,
}) {
  const decisionToken = String(suggestion?.decision || 'HOLD').trim().toUpperCase();
  const action = ACTION_META[decisionToken] || ACTION_META.HOLD;
  const quantity = Math.max(0, Math.trunc(toNumber(suggestion?.buy_quantity, 0)));
  const horizon = String(suggestion?.horizon || '1W').trim().toUpperCase() === '1M' ? '1M' : '1W';
  const symbol = String(suggestion?.symbol || 'UNKNOWN');
  const outlook = String(suggestion?.outlook || '').trim() || `${horizon === '1M' ? 'Monthly' : 'Weekly'} outlook available`;
  const demandExpected = toNumber(suggestion?.confidence_band?.expected, 0);
  const demandLower = toNumber(suggestion?.confidence_band?.lower, 0);
  const demandUpper = toNumber(suggestion?.confidence_band?.upper, 0);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.symbolWrap}>
          <Text style={styles.symbol}>{symbol}</Text>
          <Text style={styles.category}>{String(suggestion?.category || 'General')}</Text>
        </View>

        <View style={[styles.actionPill, { backgroundColor: action.bg }]}>
          <MaterialIcons name={action.icon} size={16} color={action.text} />
          <Text style={[styles.actionText, { color: action.text }]}>{action.label}</Text>
        </View>
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metricBlock}>
          <Text style={styles.metricLabel}>Suggested Qty</Text>
          <Text style={styles.metricValue}>{quantity}</Text>
        </View>

        <View style={styles.metricBlock}>
          <Text style={styles.metricLabel}>Horizon</Text>
          <Text style={styles.metricValue}>{horizon}</Text>
        </View>

        <View style={styles.metricBlock}>
          <Text style={styles.metricLabel}>Urgency</Text>
          <Text style={styles.metricValue}>{String(suggestion?.urgency || 'low').toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.confidenceWrap}>
        <Text style={styles.metricLabel}>Confidence</Text>
        <ConfidenceBar value={toNumber(suggestion?.confidence, 0)} />
      </View>

      <View style={styles.outlookBox}>
        <MaterialIcons name="query-stats" size={16} color={UI_COLORS.primary} />
        <Text style={styles.outlookText}>{outlook}</Text>
      </View>

      <View style={styles.bandBox}>
        <Text style={styles.bandLabel}>Demand Band ({horizon})</Text>
        <Text style={styles.bandValue}>
          {`${Math.round(demandExpected)} units expected (${Math.round(demandLower)}-${Math.round(demandUpper)})`}
        </Text>
      </View>

      <ExplainPanel
        isOpen={explainOpen}
        onToggle={onToggleExplain}
        modelBreakdown={suggestion?.model_breakdown}
        rationale={suggestion?.rationale}
        confidenceBand={suggestion?.confidence_band}
        explanation={suggestion?.explanation}
      />

      <Pressable style={styles.tapTarget} onPress={onToggleExplain}>
        <Text style={styles.tapTargetText}>{explainOpen ? 'Hide details' : 'Show details'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.borderSoft,
    backgroundColor: UI_COLORS.surface,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  symbolWrap: {
    gap: 2,
    flexShrink: 1,
  },
  symbol: {
    fontSize: 16,
    fontWeight: '800',
    color: UI_COLORS.textPrimary,
  },
  category: {
    fontSize: 12,
    fontWeight: '600',
    color: UI_COLORS.textMuted,
  },
  actionPill: {
    minHeight: 36,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    borderRadius: 18,
    paddingHorizontal: 10,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '800',
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricBlock: {
    minWidth: 86,
    gap: 2,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: UI_COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  confidenceWrap: {
    gap: 4,
  },
  outlookBox: {
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: UI_COLORS.surfaceMuted,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  outlookText: {
    flex: 1,
    fontSize: 12,
    color: UI_COLORS.textSecondary,
    fontWeight: '600',
  },
  bandBox: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
    backgroundColor: UI_COLORS.surfaceSubtle,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  bandLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: UI_COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  bandValue: {
    fontSize: 13,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  tapTarget: {
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: UI_COLORS.surfaceSubtle,
  },
  tapTargetText: {
    color: UI_COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
});
