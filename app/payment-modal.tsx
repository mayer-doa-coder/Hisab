/**
 * payment-modal.tsx
 *
 * Full-screen modal for recording a পেমেন্ট (payment) against outstanding বাকি.
 *
 * Route params:
 *   customerId   — (required) number as string
 *   customerName — display name shown in the header
 *   balance      — current total_baki as a string (e.g. "1500.00")
 *                  Used for validation guard and "Pay in full" shortcut.
 *
 * On save → calls transactionStore.addPayment() which:
 *   1. Validates (amount ≤ balance) + persists via transactionService
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
import { Card } from "../components/ui/Card";
import { Header } from "../components/ui/Header";
import {
    BengaliTitle,
    BodyText,
    Caption,
    TitleMedium,
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

// ── Screen ────────────────────────────────────────────────────────────────────

export default function PaymentModal() {
  const router = useRouter();
  const {
    customerId,
    customerName,
    balance: balanceParam,
  } = useLocalSearchParams<{
    customerId: string;
    customerName: string;
    balance: string;
  }>();

  const numericId = Number(customerId);
  const maxBalance = parseFloat(balanceParam ?? "0");

  const addPayment = useTransactionStore((s) => s.addPayment);
  const isLoading = useTransactionStore((s) => s.isLoading);

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [amountErr, setAmountErr] = useState("");
  const [noteErr, setNoteErr] = useState("");
  const [saved, setSaved] = useState(false);

  const noteRef = useRef<TextInput>(null);

  // ── Quick presets built from the current balance ──────────────────────────

  const quickOptions: { label: string; value: number }[] = [];
  if (maxBalance >= 1) {
    quickOptions.push({ label: "পূর্ণ পরিশোধ", value: maxBalance });
  }
  if (maxBalance >= 2) {
    quickOptions.push({
      label: "অর্ধেক",
      value: Math.floor((maxBalance / 2) * 100) / 100,
    });
  }
  // Fixed amounts that are less than or equal to the balance
  [500, 200, 100].forEach((v) => {
    if (v <= maxBalance) quickOptions.push({ label: `৳${v}`, value: v });
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  function validateAmount(raw: string): string {
    const val = parseFloat(raw);
    if (!raw.trim()) return "পরিমাণ লিখুন";
    if (isNaN(val) || val <= 0) return "বৈধ পরিমাণ লিখুন (০-এর বেশি)";
    if (val > maxBalance)
      return `সর্বোচ্চ ৳${maxBalance.toFixed(2)} পরিশোধ করা যাবে`;
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
      await addPayment({
        customer_id: numericId,
        amount: parseFloat(amount),
        note: note.trim() || null,
      });

      setSaved(true);
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
          err instanceof Error ? err.message : "পেমেন্ট রেকর্ড করা যায়নি",
        );
      }
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <Header
        title="পেমেন্ট"
        subtitle={customerName ?? undefined}
        showBack
        style={{ backgroundColor: Palette.success }}
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
          {/* Outstanding balance card */}
          <Card style={styles.balanceCard} elevation="md">
            <Caption style={{ color: Palette.grey600 }}>বর্তমান বাকি</Caption>
            <BengaliTitle
              style={{
                color: maxBalance > 0 ? Palette.danger : Palette.success,
                fontSize: 32,
                marginTop: Spacing.xs,
              }}
            >
              ৳{maxBalance.toFixed(2)}
            </BengaliTitle>
            {customerName ? (
              <Caption
                style={{ color: Palette.grey400, marginTop: Spacing.xs }}
              >
                {customerName}
              </Caption>
            ) : null}
          </Card>

          {/* Quick-payment shortcuts */}
          {quickOptions.length > 0 && (
            <View style={styles.fieldGroup}>
              <Caption style={styles.fieldLabel}>দ্রুত নির্বাচন</Caption>
              <View style={styles.presetRow}>
                {quickOptions.map((opt) => (
                  <TouchableOpacity
                    key={opt.label}
                    style={[
                      styles.presetBtn,
                      amount === String(opt.value) && styles.presetBtnActive,
                    ]}
                    onPress={() => {
                      setAmount(String(opt.value));
                      setAmountErr("");
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={opt.label}
                  >
                    <Caption
                      style={[
                        styles.presetLabel,
                        amount === String(opt.value) && {
                          color: Palette.white,
                        },
                      ]}
                    >
                      {opt.label}
                    </Caption>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Amount input */}
          <View style={styles.fieldGroup}>
            <Caption style={styles.fieldLabel}>
              পরিমাণ (টাকা) * — সর্বোচ্চ ৳{maxBalance.toFixed(2)}
            </Caption>
            <TextInput
              style={[styles.amountInput, amountErr ? styles.inputError : null]}
              placeholder="পরিমাণ লিখুন"
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
              accessibilityLabel="Payment amount"
              autoFocus
            />
            {amountErr ? (
              <Caption style={styles.errText}>{amountErr}</Caption>
            ) : null}
          </View>

          {/* Note input */}
          <View style={styles.fieldGroup}>
            <Caption style={styles.fieldLabel}>নোট (ঐচ্ছিক)</Caption>
            <TextInput
              ref={noteRef}
              style={[styles.noteInput, noteErr ? styles.inputError : null]}
              placeholder="যেমন: নগদ পেমেন্ট, মোবাইল ব্যাংকিং…"
              placeholderTextColor={Palette.grey400}
              value={note}
              onChangeText={(v) => {
                setNote(v);
                if (noteErr) setNoteErr(validateNote(v));
              }}
              onBlur={() => setNoteErr(validateNote(note))}
              multiline
              numberOfLines={2}
              maxLength={260}
              accessibilityLabel="Payment note"
            />
            <Caption style={styles.charCount}>{note.length}/255</Caption>
            {noteErr ? (
              <Caption style={styles.errText}>{noteErr}</Caption>
            ) : null}
          </View>

          {/* Remaining after payment (live preview) */}
          {amount.trim() &&
            !isNaN(parseFloat(amount)) &&
            parseFloat(amount) > 0 && (
              <View style={styles.remainingRow}>
                <TitleMedium style={{ color: Palette.grey600 }}>
                  পেমেন্টের পর বাকি:
                </TitleMedium>
                <TitleMedium
                  style={{
                    color:
                      maxBalance - parseFloat(amount) <= 0
                        ? Palette.success
                        : Palette.warning,
                    fontWeight: "700",
                  }}
                >
                  ৳{Math.max(0, maxBalance - parseFloat(amount)).toFixed(2)}
                </TitleMedium>
              </View>
            )}

          {/* Save button */}
          <TouchableOpacity
            style={[
              styles.saveBtn,
              (isLoading || saved) && styles.saveBtnDisabled,
            ]}
            onPress={handleSave}
            disabled={isLoading || saved}
            accessibilityRole="button"
            accessibilityLabel="Confirm payment"
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : saved ? (
              <BengaliTitle style={styles.saveBtnText}>
                ✓ সেভ হয়েছে
              </BengaliTitle>
            ) : (
              <BengaliTitle style={styles.saveBtnText}>
                পেমেন্ট নিশ্চিত করুন
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
  balanceCard: {
    marginBottom: Spacing.lg,
    alignItems: "flex-start",
    borderLeftWidth: 4,
    borderLeftColor: Palette.success,
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
    backgroundColor: Palette.success,
    borderColor: Palette.success,
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
    minHeight: 64,
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
  remainingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Palette.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Palette.grey200,
  },
  saveBtn: {
    backgroundColor: Palette.success,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
    marginTop: Spacing.sm,
    boxShadow: "0px 4px 8px rgba(39,174,96,0.30)", // Palette.success with 30% opacity
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
