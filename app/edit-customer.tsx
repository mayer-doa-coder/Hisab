/**
 * edit-customer.tsx
 *
 * Edit an existing customer.
 *
 * Person B — Day 4
 *   Hour 1-2: Connect form to store (useCustomerStore.updateCustomer)
 *   Hour 3-4: Validation UI — real-time blur validation, char counter,
 *             inline field error messages, error summary
 *   Hour 5-6: Confirmation dialogs — discard-changes guard on back,
 *             save-changes confirmation with diff summary
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
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

// ── Screen ────────────────────────────────────────────────────────────────────

export default function EditCustomerScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam);
  const router = useRouter();

  const { customers, updateCustomer } = useCustomerStore();

  // ── Load existing customer ─────────────────────────────────────────────────

  const existing = customers.find((c) => c.id === id) ?? null;

  const [name, setName] = useState(existing?.name ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [nickname, setNickname] = useState(existing?.nickname ?? "");
  const [trustScore, setTrustScore] = useState(existing?.trust_score ?? 3);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Snapshot of original values to detect dirty state and build diff summary
  const original = useRef({
    name: existing?.name ?? "",
    phone: existing?.phone ?? "",
    nickname: existing?.nickname ?? "",
    trust_score: existing?.trust_score ?? 3,
  });

  // Sync initial values once the customer loads from the store
  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setPhone(existing.phone ?? "");
      setNickname(existing.nickname ?? "");
      setTrustScore(existing.trust_score);
      original.current = {
        name: existing.name,
        phone: existing.phone ?? "",
        nickname: existing.nickname ?? "",
        trust_score: existing.trust_score,
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: re-sync only on customer ID change, not on every store update
  }, [existing?.id]);

  // ── Dirty check ─────────────────────────────────────────────────────────────

  const isDirty = useCallback(() => {
    const orig = original.current;
    return (
      name.trim() !== orig.name ||
      (phone.trim() || null) !== (orig.phone || null) ||
      (nickname.trim() || null) !== (orig.nickname || null) ||
      trustScore !== orig.trust_score
    );
  }, [name, phone, nickname, trustScore]);

  // ── Build human-readable diff for the confirmation dialog ──────────────────

  const buildChangeSummary = useCallback((): string => {
    const orig = original.current;
    const lines: string[] = [];

    if (name.trim() !== orig.name)
      lines.push(`Name: "${orig.name}" → "${name.trim()}"`);

    const normPhone = phone.trim() || "(none)";
    const origPhone = orig.phone || "(none)";
    if (normPhone !== origPhone)
      lines.push(`Phone: ${origPhone} → ${normPhone}`);

    const normNick = nickname.trim() || "(none)";
    const origNick = orig.nickname || "(none)";
    if (normNick !== origNick)
      lines.push(`Nickname: ${origNick} → ${normNick}`);

    if (trustScore !== orig.trust_score)
      lines.push(`Trust score: ${orig.trust_score} → ${trustScore}`);

    return lines.length ? lines.join("\n") : "No changes detected.";
  }, [name, phone, nickname, trustScore]);

  // ── Back — discard guard ────────────────────────────────────────────────────

  const handleBack = useCallback(() => {
    if (!isDirty()) {
      router.back();
      return;
    }
    Alert.alert(
      "Discard changes?",
      "You have unsaved edits. Go back and lose them?",
      [
        { text: "Keep editing", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => router.back(),
        },
      ],
    );
  }, [isDirty, router]);

  // ── Blur validators ─────────────────────────────────────────────────────────

  const handleNameBlur = () => {
    const msg = validateName(name);
    setFieldErrors((e) => ({ ...e, name: msg }));
  };

  const handlePhoneBlur = () => {
    const msg = validatePhone(phone);
    setFieldErrors((e) => ({ ...e, phone: msg }));
  };

  const handleNicknameBlur = () => {
    const msg = validateNickname(nickname);
    setFieldErrors((e) => ({ ...e, nickname: msg }));
  };

  // ── Submit — confirmation dialog with diff summary ──────────────────────────

  const persistSave = useCallback(async () => {
    setSaving(true);
    try {
      await updateCustomer(id, {
        name: name.trim(),
        phone: phone.trim() || null,
        nickname: nickname.trim() || null,
        trust_score: trustScore,
      });
      router.back();
    } catch (err) {
      if (err instanceof ValidationError) {
        setFieldErrors(err.fields);
      } else {
        Alert.alert("Error", "Could not save changes. Please try again.");
        console.error("[EditCustomer]", err);
      }
    } finally {
      setSaving(false);
    }
  }, [updateCustomer, id, name, phone, nickname, trustScore, router]);

  const handleSave = useCallback(() => {
    // Run all validations synchronously first
    const nameErr = validateName(name);
    const phoneErr = validatePhone(phone);
    const nickErr = validateNickname(nickname);

    if (nameErr || phoneErr || nickErr) {
      setFieldErrors({ name: nameErr, phone: phoneErr, nickname: nickErr });
      return;
    }

    if (!isDirty()) {
      // Nothing actually changed — just go back
      router.back();
      return;
    }

    // Show a confirmation dialog listing exactly what will change
    const summary = buildChangeSummary();
    Alert.alert(
      "Save changes?",
      `The following will be updated:\n\n${summary}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Save",
          style: "default",
          onPress: () => persistSave(),
        },
      ],
    );
  }, [name, phone, nickname, isDirty, buildChangeSummary, persistSave, router]);

  // ── Not found guard ─────────────────────────────────────────────────────────

  if (!existing) {
    return (
      <View style={{ flex: 1, backgroundColor: Palette.offWhite }}>
        <Header title="Edit Customer" showBack />
        <View style={styles.centreBox}>
          <BengaliBody style={{ color: Palette.grey400, textAlign: "center" }}>
            কাস্টমার পাওয়া যায়নি
          </BengaliBody>
        </View>
      </View>
    );
  }

  const nameLen = name.length;
  const nameWarn = nameLen > 80; // show counter when approaching limit

  return (
    <View style={{ flex: 1, backgroundColor: Palette.offWhite }}>
      <Header
        title="Edit Customer"
        subtitle={`"${existing.name}" সম্পাদনা করুন`}
        showBack
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Customer info fields ──────────────────────────────────────── */}
          <TitleMedium style={styles.section}>Customer Info</TitleMedium>

          {/* Name — with character counter near limit */}
          <Input
            label={`Full Name *${nameWarn ? `  ${nameLen}/100` : ""}`}
            placeholder="e.g. Karim Mia"
            value={name}
            onChangeText={(t) => {
              setName(t);
              if (fieldErrors.name) setFieldErrors((e) => ({ ...e, name: "" }));
            }}
            onBlur={handleNameBlur}
            error={fieldErrors.name}
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
              if (fieldErrors.phone)
                setFieldErrors((e) => ({ ...e, phone: "" }));
            }}
            onBlur={handlePhoneBlur}
            error={fieldErrors.phone}
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
              if (fieldErrors.nickname)
                setFieldErrors((e) => ({ ...e, nickname: "" }));
            }}
            onBlur={handleNicknameBlur}
            error={fieldErrors.nickname}
            hint="Optional — shown in search results"
            returnKeyType="done"
            accessibilityLabel="Customer nickname"
          />

          {/* ── Trust score ───────────────────── */}
          <View style={styles.trustBlock}>
            <BodyText style={styles.trustLabel}>
              Trust Score{" "}
              <Caption style={{ color: Palette.grey400 }}>
                (1 = low, 5 = high)
              </Caption>
            </BodyText>
            <TrustSelector value={trustScore} onChange={setTrustScore} />
          </View>

          {/* ── Dirty-state summary ────────────── */}
          {isDirty() ? (
            <View style={styles.changeCard}>
              <Caption style={styles.changeTitle}>Unsaved changes:</Caption>
              {name.trim() !== original.current.name && (
                <Caption style={styles.changeLine}>
                  • Name: {original.current.name} → {name.trim()}
                </Caption>
              )}
              {(phone.trim() || null) !== (original.current.phone || null) && (
                <Caption style={styles.changeLine}>
                  • Phone: {original.current.phone || "(none)"} →{" "}
                  {phone.trim() || "(none)"}
                </Caption>
              )}
              {(nickname.trim() || null) !==
                (original.current.nickname || null) && (
                <Caption style={styles.changeLine}>
                  • Nickname: {original.current.nickname || "(none)"} →{" "}
                  {nickname.trim() || "(none)"}
                </Caption>
              )}
              {trustScore !== original.current.trust_score && (
                <Caption style={styles.changeLine}>
                  • Trust score: {original.current.trust_score} → {trustScore}
                </Caption>
              )}
            </View>
          ) : (
            <View style={styles.noChangeCard}>
              <Caption style={{ color: Palette.grey400 }}>
                No changes yet — edit any field above.
              </Caption>
            </View>
          )}

          {/* ── Actions ────────────────────────── */}
          <View style={styles.actions}>
            <Button
              label="Cancel"
              variant="outline"
              onPress={handleBack}
              style={{ flex: 1 }}
            />
            <Button
              label={saving ? "Saving…" : "Save Changes"}
              variant="primary"
              loading={saving}
              disabled={!isDirty()}
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
  centreBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
  },
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
  changeCard: {
    backgroundColor: Palette.primary + "18",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: Palette.primary,
    gap: Spacing.xs,
  },
  changeTitle: {
    fontWeight: "700",
    color: Palette.dark,
    marginBottom: 2,
  },
  changeLine: {
    color: Palette.grey800,
  },
  noChangeCard: {
    backgroundColor: Palette.grey100 ?? Palette.grey200,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
});
