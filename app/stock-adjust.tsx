/**
 * stock-adjust.tsx — Manual stock adjustment (+/-) for a single product.
 *
 * Route params:
 *   id    (string)  — product id
 *   name  (string)  — product name (display only)
 *   stock (string)  — current stock count
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { Card } from "../components/ui/Card";
import { Header } from "../components/ui/Header";
import { BodyText, Caption, TitleMedium } from "../components/ui/Typography";
import { BorderRadius, FontSize, Palette, Spacing } from "../constants/theme";
import { useProductStore } from "../stores/productStore";

// ── Preset deltas ─────────────────────────────────────────────────────────────

const PRESETS = [-10, -5, -1, +1, +5, +10];

// ── Screen ────────────────────────────────────────────────────────────────────

export default function StockAdjustScreen() {
  const router = useRouter();
  const {
    id,
    name,
    stock: stockParam,
  } = useLocalSearchParams<{
    id: string;
    name: string;
    stock: string;
  }>();

  const currentStock = parseInt(stockParam ?? "0", 10);
  const { adjustStock, loadingOp } = useProductStore();

  // Custom delta state
  const [deltaStr, setDeltaStr] = useState("");
  const [sign, setSign] = useState<"+" | "-">("+");

  // Effective delta: from custom input or 0 if empty
  const customDelta = useMemo(() => {
    const n = parseInt(deltaStr, 10);
    if (isNaN(n) || n < 0) return 0;
    return sign === "+" ? n : -n;
  }, [deltaStr, sign]);

  // Which preset is active (null if none)
  const [activeDelta, setActiveDelta] = useState<number | null>(null);

  // The delta that will actually be applied
  const effective = activeDelta !== null ? activeDelta : customDelta;
  const preview = Math.max(0, currentStock + effective);

  const isAdjusting = loadingOp === "adjusting";

  // ── Select a preset ──────────────────────────────────────────────────────
  const togglePreset = (d: number) => {
    if (activeDelta === d) {
      setActiveDelta(null);
    } else {
      setActiveDelta(d);
      setDeltaStr("");
    }
  };

  // ── Custom input → clear preset ──────────────────────────────────────────
  const handleCustomChange = (v: string) => {
    // only allow digits
    setDeltaStr(v.replace(/[^0-9]/g, ""));
    setActiveDelta(null);
  };

  // ── Apply ────────────────────────────────────────────────────────────────
  const handleApply = useCallback(async () => {
    if (effective === 0) {
      Alert.alert("সামঞ্জস্য করুন", "কোনো পরিবর্তন নির্বাচন করা হয়নি।");
      return;
    }

    const changeLabel = effective > 0 ? `+${effective}` : String(effective);
    Alert.alert(
      "স্টক আপডেট",
      `স্টক ${changeLabel} করবেন?\nনতুন স্টক: ${preview} ইউনিট`,
      [
        { text: "বাতিল", style: "cancel" },
        {
          text: "নিশ্চিত",
          onPress: async () => {
            try {
              await adjustStock(parseInt(id, 10), effective);
              router.back();
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : "অজানা ত্রুটি";
              Alert.alert("ব্যর্থ", msg);
            }
          },
        },
      ],
    );
  }, [effective, preview, id, adjustStock, router]);

  return (
    <View style={{ flex: 1, backgroundColor: Palette.offWhite }}>
      <Header title="স্টক সামঞ্জস্য" subtitle={name ?? ""} showBack />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Current stock display ──────────────────────────────────── */}
          <Card style={styles.stockCard} elevation="md">
            <Caption style={styles.stockLabel}>বর্তমান স্টক</Caption>
            <TitleMedium style={styles.stockNumber}>
              {currentStock} ইউনিট
            </TitleMedium>
          </Card>

          {/* ── Quick presets ──────────────────────────────────────────── */}
          <Caption style={styles.sectionLabel}>দ্রুত সামঞ্জস্য</Caption>
          <View style={styles.presetGrid}>
            {PRESETS.map((d) => {
              const active = activeDelta === d;
              const isNeg = d < 0;
              return (
                <TouchableOpacity
                  key={d}
                  style={[
                    styles.presetBtn,
                    active && {
                      backgroundColor: isNeg ? Palette.danger : Palette.success,
                      borderColor: isNeg ? Palette.danger : Palette.success,
                    },
                  ]}
                  onPress={() => togglePreset(d)}
                  activeOpacity={0.75}
                >
                  <BodyText
                    style={[
                      styles.presetText,
                      { color: isNeg ? Palette.danger : Palette.success },
                      active && { color: "#fff" },
                    ]}
                  >
                    {d > 0 ? `+${d}` : String(d)}
                  </BodyText>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Custom amount ──────────────────────────────────────────── */}
          <Caption style={styles.sectionLabel}>কাস্টম পরিমাণ</Caption>
          <View style={styles.customRow}>
            {/* +/- toggle */}
            <TouchableOpacity
              style={[
                styles.signBtn,
                {
                  backgroundColor:
                    sign === "-"
                      ? Palette.danger + "20"
                      : Palette.success + "20",
                },
              ]}
              onPress={() => {
                setSign((s) => (s === "+" ? "-" : "+"));
                setActiveDelta(null);
              }}
              activeOpacity={0.8}
            >
              <BodyText
                style={[
                  styles.signText,
                  { color: sign === "-" ? Palette.danger : Palette.success },
                ]}
              >
                {sign}
              </BodyText>
            </TouchableOpacity>

            <TextInput
              style={styles.customInput}
              placeholder="পরিমাণ"
              placeholderTextColor={Palette.grey400}
              keyboardType="number-pad"
              value={deltaStr}
              onChangeText={handleCustomChange}
            />

            <Caption style={styles.unitLabel}>ইউনিট</Caption>
          </View>

          {/* ── Preview strip ──────────────────────────────────────────── */}
          {effective !== 0 && (
            <Card style={styles.previewCard} elevation="sm">
              <View style={styles.previewRow}>
                <Caption style={{ color: Palette.grey600 }}>পরিবর্তন</Caption>
                <BodyText
                  style={{
                    fontWeight: "700",
                    color: effective > 0 ? Palette.success : Palette.danger,
                  }}
                >
                  {effective > 0 ? "+" : ""}
                  {effective} ইউনিট
                </BodyText>
              </View>
              <View style={styles.previewRow}>
                <Caption style={{ color: Palette.grey600 }}>নতুন স্টক</Caption>
                <BodyText style={{ fontWeight: "700", color: Palette.dark }}>
                  {preview} ইউনিট
                </BodyText>
              </View>
              {preview === 0 && (
                <Caption style={{ color: Palette.warning, marginTop: 2 }}>
                  ⚠ স্টক শূন্যে পৌঁছাবে
                </Caption>
              )}
            </Card>
          )}

          {/* ── Apply button ───────────────────────────────────────────── */}
          <TouchableOpacity
            style={[
              styles.applyBtn,
              (isAdjusting || effective === 0) && { opacity: 0.5 },
            ]}
            onPress={handleApply}
            disabled={isAdjusting || effective === 0}
            activeOpacity={0.85}
          >
            <BodyText style={styles.applyBtnText}>
              {isAdjusting ? "আপডেট হচ্ছে…" : "স্টক আপডেট করুন"}
            </BodyText>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  body: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl * 2,
    gap: Spacing.md,
  },

  // Current stock card
  stockCard: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
    borderTopWidth: 4,
    borderTopColor: Palette.primary,
  },
  stockLabel: { color: Palette.grey600, marginBottom: Spacing.xs },
  stockNumber: { color: Palette.dark, fontWeight: "700", fontSize: 28 },

  // Section label
  sectionLabel: {
    color: Palette.grey600,
    fontWeight: "700",
    textTransform: "uppercase",
    fontSize: 11,
    letterSpacing: 0.6,
    marginBottom: -Spacing.xs,
  },

  // Preset grid
  presetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  presetBtn: {
    width: "14%",
    minWidth: 52,
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Palette.grey200,
    backgroundColor: Palette.white,
    alignItems: "center",
  },
  presetText: { fontWeight: "700", fontSize: FontSize.body },

  // Custom row
  customRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  signBtn: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  signText: { fontWeight: "700", fontSize: 24 },
  customInput: {
    flex: 1,
    height: 44,
    backgroundColor: Palette.white,
    borderWidth: 1,
    borderColor: Palette.grey200,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    fontSize: FontSize.bodyLarge,
    fontWeight: "600",
    color: Palette.dark,
  },
  unitLabel: { color: Palette.grey600 },

  // Preview card
  previewCard: { gap: Spacing.xs },
  previewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  // Apply button
  applyBtn: {
    backgroundColor: Palette.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
    marginTop: Spacing.sm,
    boxShadow: "0px 2px 6px rgba(0,0,0,0.15)",
  },
  applyBtnText: {
    color: Palette.dark,
    fontWeight: "700",
    fontSize: FontSize.bodyLarge,
  },
});
