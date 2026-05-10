import { StyleSheet, View } from 'react-native';

import { COLORS } from '../../theme/colors';
import { SPACING } from '../../theme/spacing';

/**
 * variant:
 *   default   – white card, border + soft shadow
 *   elevated  – stronger shadow, no border
 *   flat      – no border/shadow, tinted background
 *   outlined  – border only, transparent background
 *   accent    – colored left-border stripe + tinted background
 *   ghost     – invisible container, just padding
 */
export default function AppCard({ children, style, variant = 'default' }) {
  return (
    <View style={[styles.base, styles[variant] || styles.default, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 14,
    padding: SPACING.lg,
  },
  default: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.borderSoft,
    borderWidth: 1,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  elevated: {
    backgroundColor: COLORS.surface,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 6,
  },
  flat: {
    backgroundColor: COLORS.surfaceMuted,
  },
  outlined: {
    backgroundColor: 'transparent',
    borderColor: COLORS.border,
    borderWidth: 1.5,
  },
  accent: {
    backgroundColor: COLORS.surfaceSoft,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.accent,
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
  },
  ghost: {
    backgroundColor: 'transparent',
    padding: 0,
  },
});
