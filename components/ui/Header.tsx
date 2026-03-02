import { useRouter } from "expo-router";
import React from "react";
import {
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
    ViewStyle,
} from "react-native";
import {
    FontFamily,
    FontSize,
    FontWeight,
    Palette,
    Shadow,
    Spacing,
} from "../../constants/theme";

// ── Types ────────────────────────────────────────────────────────────────────

interface HeaderProps {
  title: string;
  /** Bengali subtitle rendered below the title */
  subtitle?: string;
  /** Show an arrow-back button (default: false) */
  showBack?: boolean;
  /** Right-side action element (e.g. search icon, save button) */
  right?: React.ReactNode;
  style?: ViewStyle;
}

// ── Component ────────────────────────────────────────────────────────────────

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  showBack = false,
  right,
  style,
}) => {
  const router = useRouter();

  return (
    <View style={[styles.header, style]}>
      {/* Back button */}
      {showBack && (
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
      )}

      {/* Title block */}
      <View style={styles.titleWrap}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      {/* Right action (flexible slot) */}
      <View style={styles.right}>{right ?? null}</View>
    </View>
  );
};

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    backgroundColor: Palette.dark, // #614419
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingTop: Platform.OS === "android" ? Spacing.lg : Spacing.sm,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
    ...Shadow.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  backIcon: {
    color: Palette.white,
    fontSize: 28,
    fontWeight: FontWeight.bold,
    lineHeight: 30,
  },
  titleWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.titleMedium,
    fontWeight: FontWeight.bold,
    color: Palette.white,
    letterSpacing: 0.2,
  },
  subtitle: {
    fontFamily: FontFamily.bengali,
    fontSize: FontSize.body,
    color: Palette.secondary, // #DB9A39 — warm amber
  },
  right: {
    minWidth: 36,
    alignItems: "flex-end",
  },
});
