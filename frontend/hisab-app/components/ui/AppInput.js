import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { COLORS } from '../../theme/colors';
import { SPACING } from '../../theme/spacing';
import { TYPOGRAPHY } from '../../theme/typography';

/**
 * AppInput — Rural-first text input.
 *
 * Changes from baseline:
 *  - minHeight 48 → 56dp (easier to tap and type in)
 *  - fontSize body (14) → 16 for readability without glasses
 *  - Optional `label` prop renders a clear field label above the input
 *  - Optional `hint` prop shows helper text below (e.g., "শুধু সংখ্যা দিন")
 *  - error state with red border + message
 *  - Increased borderRadius for friendlier appearance
 */
export default function AppInput({ style, label, hint, error, ...props }) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      {label ? (
        <Text style={styles.label}>{label}</Text>
      ) : null}

      <TextInput
        {...props}
        placeholderTextColor={props.placeholderTextColor || COLORS.placeholder}
        style={[
          styles.input,
          focused && styles.inputFocused,
          error && styles.inputError,
          style,
        ]}
        onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
      />

      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hintText}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  label: {
    ...TYPOGRAPHY.subheading,
    fontSize: 15,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  input: {
    minHeight: 56,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    color: COLORS.textPrimary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    ...TYPOGRAPHY.body,
    fontSize: 16,
    lineHeight: 24,
  },
  inputFocused: {
    borderColor: COLORS.accent,
    borderWidth: 2,
    backgroundColor: COLORS.surfaceMuted,
  },
  inputError: {
    borderColor: COLORS.danger,
    borderWidth: 2,
    backgroundColor: COLORS.surfaceDanger,
  },
  hintText: {
    ...TYPOGRAPHY.small,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
    marginLeft: SPACING.xs,
  },
  errorText: {
    ...TYPOGRAPHY.small,
    color: COLORS.textDanger,
    marginTop: SPACING.xs,
    marginLeft: SPACING.xs,
  },
});
