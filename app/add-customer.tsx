import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    View,
} from "react-native";
import { Button } from "../components/ui/Button";
import { Header } from "../components/ui/Header";
import { Input } from "../components/ui/Input";
import { TrustSelector } from "../components/ui/TrustSelector";
import {
    BengaliBody,
    BodyText,
    Caption,
    TitleMedium,
} from "../components/ui/Typography";
import { BorderRadius, Palette, Spacing } from "../constants/theme";
import { ValidationError } from "../services/errors";
import {
    validateName,
    validateNickname,
    validatePhone,
} from "../services/validation";
import { useCustomerStore } from "../stores/customerStore";

// ── Main screen ───────────────────────────────────────────────────────────────

export default function AddCustomerScreen() {
  const router = useRouter();
  const addCustomer = useCustomerStore((s) => s.addCustomer);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [nickname, setNickname] = useState("");
  const [trustScore, setTrustScore] = useState(3);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const nameLen = name.length;
  const nameWarn = nameLen > 80;

  // ── Confirm discard ─────────────────────────────────────────────────────────

  const handleBack = () => {
    const dirty = name.trim() || phone.trim() || nickname.trim();
    if (dirty) {
      Alert.alert(
        "Discard changes?",
        "You have unsaved information. Go back anyway?",
        [
          { text: "Keep editing", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => router.back(),
          },
        ],
      );
    } else {
      router.back();
    }
  };

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    // Run all validations before touching the store
    const nameErr = validateName(name);
    const phoneErr = validatePhone(phone);
    const nickErr = validateNickname(nickname);
    if (nameErr || phoneErr || nickErr) {
      setErrors({ name: nameErr, phone: phoneErr, nickname: nickErr });
      return;
    }
    setLoading(true);
    setErrors({});

    try {
      // store.addCustomer validates, persists, and refreshes the list
      const id = await addCustomer({
        name,
        phone: phone.trim() || null,
        nickname: nickname.trim() || null,
        total_baki: 0,
        trust_score: trustScore,
      });

      // Navigate to the detail screen for the new customer
      router.replace({ pathname: "/customer-detail", params: { id } });
    } catch (err) {
      if (err instanceof ValidationError) {
        setErrors(err.fields);
      } else {
        Alert.alert("Error", "Could not save customer. Please try again.");
        console.error("[AddCustomer]", err);
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: Palette.offWhite }}>
      <Header title="Add Customer" subtitle="নতুন কাস্টমার" showBack />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Fields ───────────────────────────────────────────────────── */}
          <TitleMedium style={styles.section}>Customer Info</TitleMedium>

          <Input
            label={`Full Name *${nameWarn ? `  ${nameLen}/100` : ""}`}
            placeholder="e.g. Karim Mia"
            value={name}
            onChangeText={(t) => {
              setName(t);
              setErrors((e) => ({ ...e, name: "" }));
            }}
            onBlur={() =>
              setErrors((e) => ({ ...e, name: validateName(name) }))
            }
            error={errors.name}
            autoCapitalize="words"
            returnKeyType="next"
            accessibilityLabel="Customer full name"
          />

          <Input
            label="Phone"
            placeholder="e.g. 01711000001"
            value={phone}
            onChangeText={(t) => {
              setPhone(t);
              setErrors((e) => ({ ...e, phone: "" }));
            }}
            onBlur={() =>
              setErrors((e) => ({ ...e, phone: validatePhone(phone) }))
            }
            error={errors.phone}
            hint="Optional — Bangladeshi number (01XXXXXXXXX)"
            keyboardType="phone-pad"
            returnKeyType="next"
            accessibilityLabel="Customer phone number"
          />

          <Input
            label="Nickname / ডাক নাম"
            placeholder="e.g. Karim"
            value={nickname}
            onChangeText={(t) => {
              setNickname(t);
              setErrors((e) => ({ ...e, nickname: "" }));
            }}
            onBlur={() =>
              setErrors((e) => ({ ...e, nickname: validateNickname(nickname) }))
            }
            error={errors.nickname}
            hint="Optional — shown in search"
            returnKeyType="done"
            accessibilityLabel="Customer nickname"
          />

          {/* ── Trust score ───────────────────────── */}
          <View style={styles.trustBlock}>
            <BodyText style={styles.trustLabel}>
              Trust Score{" "}
              <Caption style={{ color: Palette.grey400 }}>
                (1 = low, 5 = high)
              </Caption>
            </BodyText>
            <TrustSelector value={trustScore} onChange={setTrustScore} />
          </View>

          {/* ── Bengali hint ──────────────────────── */}
          <View style={styles.hintCard}>
            <BengaliBody style={{ color: Palette.dark }}>
              নাম লিখুন এবং সংরক্ষণ করুন
            </BengaliBody>
            <Caption style={{ color: Palette.grey600, marginTop: 2 }}>
              Fields marked * are required
            </Caption>
          </View>

          {/* ── Actions ──────────────────────────── */}
          <View style={styles.actions}>
            <Button
              label="Cancel"
              variant="outline"
              onPress={handleBack}
              style={{ flex: 1 }}
            />
            <Button
              label={loading ? "Saving…" : "Save Customer"}
              variant="primary"
              loading={loading}
              onPress={handleSave}
              style={{ flex: 1 }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  section: {
    color: Palette.dark,
    marginBottom: Spacing.xs,
  },
  trustBlock: {
    gap: Spacing.sm,
  },
  trustLabel: {
    fontWeight: "600",
    color: Palette.grey800,
  },
  hintCard: {
    backgroundColor: Palette.primary + "22", // 13 % alpha
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: Palette.primary,
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
});
