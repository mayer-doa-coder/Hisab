import { StyleSheet, Text, TouchableOpacity } from 'react-native';

import { COLORS } from '../../theme/colors';
import { SPACING } from '../../theme/spacing';
import { TYPOGRAPHY } from '../../theme/typography';

/**
 * variant: primary | secondary | ghost | danger | success
 * size:    sm | md | lg
 */
export default function AppButton({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  style,
  textStyle,
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.base,
        styles[`size_${size}`] || styles.size_md,
        styles[variant] || styles.primary,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text
        style={[
          styles.label,
          styles[`${size}Label`] || styles.mdLabel,
          styles[`${variant}Label`] || styles.primaryLabel,
          textStyle,
        ]}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },

  // Sizes
  size_sm: { minHeight: 36, paddingHorizontal: SPACING.md, borderRadius: 8 },
  size_md: { minHeight: 48, paddingHorizontal: SPACING.lg },
  size_lg: { minHeight: 56, paddingHorizontal: SPACING.xl, borderRadius: 14 },

  // Variants
  primary: {
    backgroundColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  secondary: {
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  danger: {
    backgroundColor: COLORS.surfaceDanger,
    borderWidth: 1.5,
    borderColor: COLORS.borderDanger,
  },
  success: {
    backgroundColor: COLORS.surfaceSuccess,
    borderWidth: 1.5,
    borderColor: COLORS.borderSuccess,
  },

  // Labels
  label: { ...TYPOGRAPHY.button },
  smLabel: { fontSize: 13, fontWeight: '700' },
  mdLabel: { fontSize: 15, fontWeight: '700' },
  lgLabel: { fontSize: 16, fontWeight: '800' },

  primaryLabel: { color: COLORS.onAccent },
  secondaryLabel: { color: COLORS.textPrimary },
  ghostLabel: { color: COLORS.primary },
  dangerLabel: { color: COLORS.textDanger },
  successLabel: { color: COLORS.textSuccess },

  disabled: { opacity: 0.55 },
});
