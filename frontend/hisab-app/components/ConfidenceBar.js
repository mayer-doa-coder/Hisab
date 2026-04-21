import { StyleSheet, Text, View } from 'react-native';

import { UI_COLORS } from '../constants/ui-theme';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export default function ConfidenceBar({ value = 0 }) {
  const confidence = clamp(Number(value) || 0, 0, 1);
  const widthPercent = `${Math.round(confidence * 100)}%`;

  return (
    <View style={styles.root}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: widthPercent }]} />
      </View>
      <Text style={styles.label}>{Math.round(confidence * 100)}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  track: {
    flex: 1,
    height: 8,
    borderRadius: 99,
    backgroundColor: UI_COLORS.surfaceMuted,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 99,
    backgroundColor: UI_COLORS.primary,
  },
  label: {
    minWidth: 38,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '700',
    color: UI_COLORS.textSecondary,
  },
});
