import React, { useState } from "react";
import {
    StyleSheet,
    Text,
    TextInput,
    TextInputProps,
    View,
    ViewStyle,
} from "react-native";
import {
    BorderRadius,
    FontFamily,
    FontSize,
    FontWeight,
    Palette,
    Spacing,
} from "../../constants/theme";

// ── Types ────────────────────────────────────────────────────────────────────

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  containerStyle?: ViewStyle;
}

// ── Component ────────────────────────────────────────────────────────────────

export const Input: React.FC<InputProps> = ({
  label,
  error,
  hint,
  containerStyle,
  style,
  ...textInputProps
}) => {
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? Palette.danger
    : focused
      ? Palette.primary
      : Palette.grey200;

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}

      <TextInput
        style={[styles.input, { borderColor }, style]}
        placeholderTextColor={Palette.grey400}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={label}
        {...textInputProps}
      />

      {error && <Text style={styles.error}>{error}</Text>}
      {!error && hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
};

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: Spacing.xs,
  },
  label: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.body,
    fontWeight: FontWeight.medium,
    color: Palette.grey800,
  },
  input: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.bodyLarge,
    color: Palette.grey800,
    backgroundColor: Palette.white,
    borderWidth: 1.5,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  error: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.caption,
    color: Palette.danger,
  },
  hint: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.caption,
    color: Palette.grey400,
  },
});
