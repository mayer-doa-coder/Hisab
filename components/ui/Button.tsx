import React from "react";
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
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

type Variant = "primary" | "secondary" | "outline" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
}

// ── Variant maps ─────────────────────────────────────────────────────────────

const BG: Record<Variant, string> = {
  primary: Palette.primary,
  secondary: Palette.secondary,
  outline: "transparent",
  danger: Palette.danger,
  ghost: "transparent",
};

const TEXT_COLOR: Record<Variant, string> = {
  primary: Palette.dark,
  secondary: Palette.dark,
  outline: Palette.primary,
  danger: "#fff",
  ghost: Palette.primary,
};

const BORDER_COLOR: Record<Variant, string> = {
  primary: "transparent",
  secondary: "transparent",
  outline: Palette.primary,
  danger: "transparent",
  ghost: "transparent",
};

const PADDING: Record<
  Size,
  { paddingVertical: number; paddingHorizontal: number }
> = {
  sm: { paddingVertical: Spacing.xs, paddingHorizontal: Spacing.sm },
  md: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md },
  lg: { paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg },
};

const FONT_SIZE: Record<Size, number> = {
  sm: FontSize.body,
  md: FontSize.bodyLarge,
  lg: FontSize.titleSmall,
};

// ── Component ────────────────────────────────────────────────────────────────

export const Button: React.FC<ButtonProps> = ({
  label,
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
}) => {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        PADDING[size],
        {
          backgroundColor: BG[variant],
          borderColor: BORDER_COLOR[variant],
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
          alignSelf: fullWidth ? "stretch" : "flex-start",
        },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={TEXT_COLOR[variant]} />
      ) : (
        <Text
          style={[
            styles.label,
            { color: TEXT_COLOR[variant], fontSize: FONT_SIZE[size] },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
};

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  base: {
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
  },
  label: {
    fontFamily: FontFamily.sans,
    fontWeight: FontWeight.semiBold,
    letterSpacing: 0.3,
  },
});
