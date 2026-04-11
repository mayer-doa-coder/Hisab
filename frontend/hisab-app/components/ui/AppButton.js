import { StyleSheet, Text, TouchableOpacity } from 'react-native';

import { COLORS } from '../../theme/colors';
import { SPACING } from '../../theme/spacing';
import { TYPOGRAPHY } from '../../theme/typography';

export default function AppButton({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  style,
  textStyle,
}) {
  const isSecondary = variant === 'secondary';

  return (
    <TouchableOpacity
      activeOpacity={0.86}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.base,
        isSecondary ? styles.secondary : styles.primary,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      <Text style={[styles.label, isSecondary ? styles.secondaryLabel : styles.primaryLabel, textStyle]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  primary: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  secondary: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.borderStrong,
  },
  label: {
    ...TYPOGRAPHY.button,
  },
  primaryLabel: {
    color: COLORS.onAccent,
  },
  secondaryLabel: {
    color: COLORS.primary,
  },
  disabled: {
    opacity: 0.65,
  },
});
