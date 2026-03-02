import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Card } from "../../components/ui/Card";
import { Header } from "../../components/ui/Header";
import { ScreenContainer } from "../../components/ui/ScreenContainer";
import {
    BengaliBody,
    BengaliTitle,
    BodyText,
    Caption,
    TitleMedium,
} from "../../components/ui/Typography";
import { BorderRadius, Palette, Spacing } from "../../constants/theme";

// ── Quick-action menu items ────────────────────────────────────────────────

const MENU_ITEMS = [
  {
    route: "/(tabs)/customers" as const,
    label: "Customers",
    bengali: "কাস্টমার",
    color: Palette.primary,
  },
  {
    route: "/sales" as const,
    label: "Sales",
    bengali: "বিক্রয়",
    color: Palette.secondary,
  },
  {
    route: "/inventory" as const,
    label: "Inventory",
    bengali: "স্টক",
    color: Palette.accent,
  },
  {
    route: "/suggestions" as const,
    label: "Suggestions",
    bengali: "পরামর্শ",
    color: Palette.dark,
  },
] as const;

// ── Component ────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: Palette.offWhite }}>
      <Header title="HISAB" subtitle="হিসাব — বাকি খাতা" />

      <ScreenContainer>
        {/* Welcome card */}
        <Card style={styles.welcomeCard} elevation="md">
          <BengaliTitle style={{ color: Palette.dark }}>
            আজকের হিসাব
          </BengaliTitle>
          <BengaliBody style={{ color: Palette.grey600, marginTop: 4 }}>
            আপনার দোকানের সব তথ্য এখানে
          </BengaliBody>
        </Card>

        {/* Quick-action grid */}
        <TitleMedium style={styles.sectionTitle}>Quick Actions</TitleMedium>

        <View style={styles.grid}>
          {MENU_ITEMS.map((item) => (
            <TouchableOpacity
              key={item.route}
              style={styles.gridCell}
              activeOpacity={0.8}
              onPress={() => router.push(item.route)}
              accessibilityRole="button"
              accessibilityLabel={item.label}
            >
              <Card
                style={[styles.menuCard, { borderTopColor: item.color }]}
                elevation="sm"
              >
                <BodyText style={[styles.menuLabel, { color: item.color }]}>
                  {item.label}
                </BodyText>
                <Caption style={{ color: Palette.grey600 }}>
                  {item.bengali}
                </Caption>
              </Card>
            </TouchableOpacity>
          ))}
        </View>

        {/* DEV-only DB inspector shortcut */}
        {__DEV__ && (
          <TouchableOpacity
            style={styles.devBtn}
            onPress={() => router.push("/dev-db")}
            activeOpacity={0.7}
          >
            <Caption style={styles.devBtnText}>DEV: DB Inspector</Caption>
          </TouchableOpacity>
        )}
      </ScreenContainer>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  welcomeCard: {
    marginBottom: Spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: Palette.primary,
  },
  sectionTitle: {
    marginBottom: Spacing.sm,
    color: Palette.dark,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  gridCell: {
    width: "47%",
  },
  menuCard: {
    borderTopWidth: 3,
    gap: Spacing.xs,
    minHeight: 80,
    justifyContent: "center",
  },
  menuLabel: {
    fontWeight: "700",
    fontSize: 15,
  },
  devBtn: {
    marginTop: Spacing.xl,
    alignSelf: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Palette.grey200,
    borderStyle: "dashed",
  },
  devBtnText: {
    color: Palette.grey400,
  },
});
