import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { BorderRadius, Palette, Shadow, Spacing } from "../../constants/theme";

// ── Types ────────────────────────────────────────────────────────────────────

interface CardProps {
  children: React.ReactNode;
  /** Elevation style — 'sm' (default) or 'md' */
  elevation?: "sm" | "md" | "none";
  style?: ViewStyle;
}

// ── Component ────────────────────────────────────────────────────────────────

export const Card: React.FC<CardProps> = ({
  children,
  elevation = "sm",
  style,
}) => (
  <View
    style={[
      styles.card,
      elevation !== "none" ? Shadow[elevation] : undefined,
      style,
    ]}
  >
    {children}
  </View>
);

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: Palette.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
});
