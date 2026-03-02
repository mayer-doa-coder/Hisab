/**
 * baki-modal.tsx
 *
 * Full-screen modal for recording a new বাকি (credit) transaction.
 *
 * Route params:
 *   customerId   — (required) number as string
 *   customerName — display name shown in the header
 *
 * On save → calls transactionStore.addBaki() which:
 *   1. Validates + persists via transactionService
 *   2. Reloads the local transaction list
 *   3. Kicks customerStore.load() so Customers tab total_baki updates
 *
 * Person B — Day 5
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { Header } from "../components/ui/Header";
import {
    BengaliBody,
    BengaliTitle,
    BodyText,
    Caption,
} from "../components/ui/Typography";
import {
    BorderRadius,
    FontFamily,
    FontSize,
    Palette,
    Spacing,
} from "../constants/theme";
import { ValidationError } from "../services/errors";
import { useTransactionStore } from "../stores/transactionStore";

// ── Quick-amount presets ──────────────────────────────────────────────────────

const PRESETS = [50, 100, 200, 500, 1000];

// ── Screen ────────────────────────────────────────────────────────────────────

export default function BakiModal() {
  const router = useRouter();
  const { customerId, customerName } = useLocalSearchParams<{
    customerId: string;
    customerName: string;
  }>();

  const numericId = Number(customerId);

  const addBaki = useTransactionStore((s) => s.addBaki);
  const isLoading = useTransactionStore((s) => s.isLoading);

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [amountErr, setAmountErr] = useState("");
  const [noteErr, setNoteErr] = useState("");
  const [saved, setSaved] = useState(false);

  const noteRef = useRef<TextInput>(null);

  // ── Validation ──────────────────────────────────────────────────────────────

  function validateAmount(raw: string): string {
    const val = parseFloat(raw);
    if (!raw.trim()) return "পরিমাণ লিখুন";
    if (isNaN(val) || val <= 0) return "বৈধ পরিমাণ লিখুন (০-এর বেশি)";
    if (val > 1_000_000) return "সর্বোচ্চ ৳১০,০০,০০০";
    return "";
  }

  function validateNote(raw: string): string {
    if (raw.trim().length > 255) return "নোট সর্বোচ্চ ২৫৫ অক্ষর";
    return "";
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    const aErr = validateAmount(amount);
    const nErr = validateNote(note);

    setAmountErr(aErr);
    setNoteErr(nErr);
    if (aErr || nErr) return;

    try {
      await addBaki({
        customer_id: numericId,
        amount: parseFloat(amount),
        note: note.trim() || null,
      });

      setSaved(true);
      // Brief success flash then dismiss
      setTimeout(() => router.back(), 600);
    } catch (err) {
      if (err instanceof ValidationError) {
        if (err.fields.amount) setAmountErr(err.fields.amount);
        if (err.fields.note) setNoteErr(err.fields.note);
        if (err.fields.customer_id) {
          Alert.alert("ত্রুটি", err.fields.customer_id);
        }
      } else {
        Alert.alert(
          "ত্রুটি",
          err instanceof Error ? err.message : "বাকি যোগ করা যায়নি",
        );
      }
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <Header
        title="বাকি দিন"
        subtitle={customerName ?? undefined}
        showBack
        style={{ backgroundColor: Palette.danger }}
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
          {/* Customer context chip */}
          <View style={styles.contextChip}>
            <Caption style={{ color: Palette.danger }}>🧾 বাকি লেনদেন</Caption>
            {customerName ? (
              <BengaliBody style={styles.contextName}>
                {customerName}
              </BengaliBody>
            ) : null}
          </View>

          {/* Amount input */}
          <View style={styles.fieldGroup}>
            <Caption style={styles.fieldLabel}>পরিমাণ (টাকা) *</Caption>

            {/* Quick-select presets */}
            <View style={styles.presetRow}>
              {PRESETS.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.presetBtn,
                    amount === String(p) && styles.presetBtnActive,
                  ]}
                  onPress={() => {
                    setAmount(String(p));
                    setAmountErr("");
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Set amount to ${p}`}
                >
                  <Caption
                    style={[
                      styles.presetLabel,
                      amount === String(p) && { color: Palette.white },
                    ]}
                  >
                    ৳{p}
                  </Caption>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={[styles.amountInput, amountErr ? styles.inputError : null]}
              placeholder="যেমন: ৫০০"
              placeholderTextColor={Palette.grey400}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={(v) => {
                setAmount(v);
                if (amountErr) setAmountErr(validateAmount(v));
              }}
              onBlur={() => setAmountErr(validateAmount(amount))}
              returnKeyType="next"
              onSubmitEditing={() => noteRef.current?.focus()}
              accessibilityLabel="Baki amount"
              autoFocus
            />

            {amountErr ? (
              <Caption style={styles.errText}>{amountErr}</Caption>
            ) : null}
          </View>

          {/* Note / item description */}
          <View style={styles.fieldGroup}>
            <Caption style={styles.fieldLabel}>কী নিল? (ঐচ্ছিক)</Caption>
            <TextInput
              ref={noteRef}
              style={[styles.noteInput, noteErr ? styles.inputError : null]}
              placeholder="যেমন: চাল ৫ কেজি, তেল ১ লিটার…"
              placeholderTextColor={Palette.grey400}
              value={note}
              onChangeText={(v) => {
                setNote(v);
                if (noteErr) setNoteErr(validateNote(v));
              }}
              onBlur={() => setNoteErr(validateNote(note))}
              multiline
              numberOfLines={3}
              maxLength={260}
              accessibilityLabel="Item note"
            />
            <Caption style={styles.charCount}>{note.length}/255</Caption>
            {noteErr ? (
              <Caption style={styles.errText}>{noteErr}</Caption>
            ) : null}
          </View>

          {/* Save button */}
          <TouchableOpacity
            style={[
              styles.saveBtn,
              (isLoading || saved) && styles.saveBtnDisabled,
            ]}
            onPress={handleSave}
            disabled={isLoading || saved}
            accessibilityRole="button"
            accessibilityLabel="Confirm add baki"
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : saved ? (
              <BengaliTitle style={styles.saveBtnText}>
                ✓ সেভ হয়েছে
              </BengaliTitle>
            ) : (
              <BengaliTitle style={styles.saveBtnText}>
                বাকি যোগ করুন
              </BengaliTitle>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelLink}
            onPress={() => router.back()}
            accessibilityRole="button"
          >
            <BodyText style={{ color: Palette.grey600 }}>বাতিল করুন</BodyText>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Palette.offWhite,
  },
  scroll: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  contextChip: {
    backgroundColor: "#fff0f0",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: Palette.danger,
  },
  contextName: {
    fontWeight: "700",
    color: Palette.grey800,
    marginTop: Spacing.xs,
  },
  fieldGroup: {
    marginBottom: Spacing.lg,
  },
  fieldLabel: {
    color: Palette.grey600,
    marginBottom: Spacing.xs,
    fontWeight: "600",
  },
  presetRow: {
    flexDirection: "row",
    gap: Spacing.xs,
    flexWrap: "wrap",
    marginBottom: Spacing.sm,
  },
  presetBtn: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Palette.grey200,
    backgroundColor: Palette.white,
  },
  presetBtnActive: {
    backgroundColor: Palette.danger,
    borderColor: Palette.danger,
  },
  presetLabel: {
    color: Palette.grey600,
    fontSize: FontSize.caption,
    fontWeight: "600",
  },
  amountInput: {
    backgroundColor: Palette.white,
    borderWidth: 1.5,
    borderColor: Palette.grey200,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: 28,
    fontFamily: FontFamily.sans,
    color: Palette.grey800,
    textAlign: "right",
    letterSpacing: 1,
  },
  noteInput: {
    backgroundColor: Palette.white,
    borderWidth: 1.5,
    borderColor: Palette.grey200,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.body,
    fontFamily: FontFamily.sans,
    color: Palette.grey800,
    minHeight: 80,
    textAlignVertical: "top",
  },
  inputError: {
    borderColor: Palette.danger,
  },
  errText: {
    color: Palette.danger,
    marginTop: 4,
  },
  charCount: {
    color: Palette.grey400,
    textAlign: "right",
    marginTop: 2,
  },
  saveBtn: {
    backgroundColor: Palette.danger,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
    marginTop: Spacing.sm,
    boxShadow: "0px 4px 8px rgba(231,76,60,0.30)", // Palette.danger with 30% opacity
  },
  saveBtnDisabled: {
    opacity: 0.65,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: FontSize.bodyLarge,
    fontWeight: "700",
  },
  cancelLink: {
    alignItems: "center",
    padding: Spacing.md,
    marginTop: Spacing.xs,
  },
});
