import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { COLORS } from '../../theme/colors';
import { SPACING } from '../../theme/spacing';
import { TYPOGRAPHY } from '../../theme/typography';

/**
 * AppButton — Rural-first button component.
 *
 * Tap target minimums follow WCAG 2.5.5 (AAA) guidelines:
 *   sm → 48dp  (was 36 — every button must be tappable by all users)
 *   md → 56dp  (standard form actions)
 *   lg → 64dp  (hero CTAs: "Add Sale", "Record Payment")
 *
 * variant: primary | secondary | ghost | danger | success
 * size:    sm | md | lg
 */
export default function AppButton({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  textStyle,
}) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      activeOpacity={0.78}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={[
        styles.base,
        styles[`size_${size}`] || styles.size_md,
        styles[variant] || styles.primary,
        isDisabled && styles.disabled,
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? COLORS.onAccent : COLORS.primary}
        />
      ) : (
        <View style={styles.inner}>
          {title ? (
            <Text
              style={[
                styles.label,
                styles[`${size}Label`] || styles.mdLabel,
                styles[`${variant}Label`] || styles.primaryLabel,
                textStyle,
              ]}
              numberOfLines={1}
            >
              {title}
            </Text>
          ) : null}
        </View>
      )}
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
  fullWidth: { width: '100%' },
  inner: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },

  // ── Sizes — all meet 48dp minimum tap target ──────────────────────────────
  size_sm: { minHeight: 48, paddingHorizontal: SPACING.md, borderRadius: 10 },
  size_md: { minHeight: 56, paddingHorizontal: SPACING.lg, borderRadius: 12 },
  size_lg: { minHeight: 64, paddingHorizontal: SPACING.xl, borderRadius: 14 },

  // ── Variants ──────────────────────────────────────────────────────────────
  primary: {
    backgroundColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.32,
    shadowRadius: 8,
    elevation: 4,
  },
  secondary: {
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  ghost: { backgroundColor: 'transparent' },
  danger: {
    backgroundColor: COLORS.surfaceDanger,
    borderWidth: 2,
    borderColor: COLORS.borderDanger,
  },
  success: {
    backgroundColor: COLORS.surfaceSuccess,
    borderWidth: 2,
    borderColor: COLORS.borderSuccess,
  },

  // ── Labels ────────────────────────────────────────────────────────────────
  label: { ...TYPOGRAPHY.button },
  smLabel: { ...TYPOGRAPHY.button, fontSize: 14 },
  mdLabel: { ...TYPOGRAPHY.button, fontSize: 16 },
  lgLabel: { ...TYPOGRAPHY.button, fontSize: 18 },

  primaryLabel: { color: COLORS.onAccent },
  secondaryLabel: { color: COLORS.textPrimary },
  ghostLabel: { color: COLORS.primary },
  dangerLabel: { color: COLORS.textDanger },
  successLabel: { color: COLORS.textSuccess },

  disabled: { opacity: 0.5 },
});
