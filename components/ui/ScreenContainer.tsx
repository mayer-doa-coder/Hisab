import React from "react";
import { SafeAreaView, ScrollView, StyleSheet, ViewStyle } from "react-native";
import { Palette, Spacing } from "../../constants/theme";

// ── Types ────────────────────────────────────────────────────────────────────

interface ScreenContainerProps {
  children: React.ReactNode;
  /** Allow the content area to scroll (default: true) */
  scrollable?: boolean;
  /** Override background colour */
  backgroundColor?: string;
  style?: ViewStyle;
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * ScreenContainer — root wrapper for every screen.
 *
 * Provides:
 *  - SafeAreaView so content is never obscured by notch / navigation bar
 *  - Consistent horizontal padding (Spacing.md = 16)
 *  - Optional ScrollView with bounce-to-top for long pages
 */
export const ScreenContainer: React.FC<ScreenContainerProps> = ({
  children,
  scrollable = true,
  backgroundColor = Palette.offWhite,
  style,
}) => (
  <SafeAreaView style={[styles.safe, { backgroundColor }]}>
    {scrollable ? (
      <ScrollView
        contentContainerStyle={[styles.scroll, style]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    ) : (
      // Non-scrollable variant (e.g. camera screens)
      React.cloneElement(<>{children}</>, {
        style: [styles.fixed, style],
      })
    )}
  </SafeAreaView>
);

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  fixed: {
    flex: 1,
    padding: Spacing.md,
  },
});
