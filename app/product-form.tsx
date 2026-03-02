/**
 * product-form.tsx — Add or edit a product.
 *
 * Route params:
 *   id (optional string) — if present, load that product and enter edit mode
 *
 * Fields: name, price (selling), cost_price (optional),
 *         stock, low_stock_threshold
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";
import { Button } from "../components/ui/Button";
import { Header } from "../components/ui/Header";
import { Input } from "../components/ui/Input";
import { BodyText, Caption } from "../components/ui/Typography";
import { BorderRadius, Palette, Spacing } from "../constants/theme";
import { useProductStore } from "../stores/productStore";

// ── Field state ───────────────────────────────────────────────────────────────

interface Fields {
  name: string;
  price: string;
  costPrice: string;
  stock: string;
  threshold: string;
}

interface FieldErrors {
  name?: string;
  price?: string;
  costPrice?: string;
  stock?: string;
  threshold?: string;
}

const EMPTY_FIELDS: Fields = {
  name: "",
  price: "",
  costPrice: "",
  stock: "0",
  threshold: "5",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function validateFields(f: Fields): FieldErrors {
  const e: FieldErrors = {};

  if (!f.name.trim()) e.name = "পণ্যের নাম আবশ্যক";
  else if (f.name.trim().length > 100) e.name = "নাম সর্বোচ্চ ১০০ অক্ষর";

  if (!f.price.trim()) e.price = "বিক্রয় মূল্য আবশ্যক";
  else if (isNaN(Number(f.price)) || Number(f.price) <= 0)
    e.price = "বৈধ মূল্য দিন (০-এর বেশি)";

  if (f.costPrice.trim() !== "") {
    if (isNaN(Number(f.costPrice)) || Number(f.costPrice) < 0)
      e.costPrice = "বৈধ ক্রয় মূল্য দিন";
  }

  if (isNaN(Number(f.stock)) || Number(f.stock) < 0)
    e.stock = "স্টক ০ বা তার বেশি হতে হবে";

  if (isNaN(Number(f.threshold)) || Number(f.threshold) < 0)
    e.threshold = "সীমা ০ বা তার বেশি হতে হবে";

  return e;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ProductFormScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = Boolean(id);

  const { products, addProduct, updateProduct, deleteProduct, loadingOp } =
    useProductStore();

  // Populate fields when editing
  const loaded = useRef(false);
  const [fields, setFields] = useState<Fields>(EMPTY_FIELDS);
  const [errors, setErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (isEdit && !loaded.current) {
      const numId = Number(id);
      const product = products.find((p) => p.id === numId);
      if (product) {
        loaded.current = true;
        setFields({
          name: product.name,
          price: String(product.price),
          costPrice:
            product.cost_price !== null && product.cost_price !== undefined
              ? String(product.cost_price)
              : "",
          stock: String(product.stock),
          threshold: String(product.low_stock_threshold),
        });
      }
    }
  }, [id, isEdit, products]);

  // ── Field updater ────────────────────────────────────────────────────────
  const set = useCallback((key: keyof Fields, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }, []);

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    const newErrors = validateFields(fields);
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const data = {
      name: fields.name.trim(),
      price: Number(fields.price),
      cost_price:
        fields.costPrice.trim() !== "" ? Number(fields.costPrice) : null,
      stock: Math.round(Number(fields.stock)),
      low_stock_threshold: Math.round(Number(fields.threshold)),
    };

    try {
      if (isEdit) {
        await updateProduct(Number(id), data);
      } else {
        await addProduct(data as Parameters<typeof addProduct>[0]);
      }
      router.back();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "অজানা ত্রুটি";
      Alert.alert("সংরক্ষণ ব্যর্থ", msg);
    }
  }, [fields, isEdit, id, addProduct, updateProduct, router]);

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = useCallback(() => {
    Alert.alert(
      "পণ্য মুছুন",
      `"${fields.name}" পণ্যটি স্থায়ীভাবে মুছে ফেলবেন?`,
      [
        { text: "বাতিল", style: "cancel" },
        {
          text: "মুছুন",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteProduct(Number(id));
              router.back();
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : "অজানা ত্রুটি";
              Alert.alert("মুছতে ব্যর্থ", msg);
            }
          },
        },
      ],
    );
  }, [fields.name, id, deleteProduct, router]);

  const isSaving = loadingOp === "saving";
  const isDeleting = loadingOp === "deleting";
  const busy = isSaving || isDeleting;

  return (
    <View style={{ flex: 1, backgroundColor: Palette.offWhite }}>
      <Header title={isEdit ? "পণ্য সম্পাদনা" : "নতুন পণ্য"} showBack />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Section: Basic info ─────────────────────────────────── */}
          <SectionLabel>পণ্যের বিবরণ</SectionLabel>

          <Input
            label="পণ্যের নাম *"
            placeholder="যেমন: চাল (1 kg)"
            value={fields.name}
            onChangeText={(v) => set("name", v)}
            error={errors.name}
            autoFocus={!isEdit}
            maxLength={100}
            returnKeyType="next"
          />

          {/* ── Section: Pricing ──────────────────────────────────────── */}
          <SectionLabel style={{ marginTop: Spacing.md }}>
            মূল্য নির্ধারণ
          </SectionLabel>

          <Input
            label="বিক্রয় মূল্য (৳) *"
            placeholder="0.00"
            value={fields.price}
            onChangeText={(v) => set("price", v)}
            error={errors.price}
            keyboardType="decimal-pad"
            hint="গ্রাহককে যে মূল্যে বিক্রি করবেন"
            returnKeyType="next"
          />

          <Input
            label="ক্রয় মূল্য (৳)"
            placeholder="0.00 (ঐচ্ছিক)"
            value={fields.costPrice}
            onChangeText={(v) => set("costPrice", v)}
            error={errors.costPrice}
            keyboardType="decimal-pad"
            hint="খালি রাখলে মার্জিন গণনা হবে না"
            returnKeyType="next"
          />

          {/* Margin preview */}
          {fields.price.trim() !== "" &&
          fields.costPrice.trim() !== "" &&
          !isNaN(Number(fields.price)) &&
          !isNaN(Number(fields.costPrice)) &&
          Number(fields.price) > 0 ? (
            <MarginPreview
              price={Number(fields.price)}
              cost={Number(fields.costPrice)}
            />
          ) : null}

          {/* ── Section: Stock ────────────────────────────────────────── */}
          <SectionLabel style={{ marginTop: Spacing.md }}>
            স্টক তথ্য
          </SectionLabel>

          <Input
            label="বর্তমান স্টক (ইউনিট)"
            placeholder="0"
            value={fields.stock}
            onChangeText={(v) => set("stock", v)}
            error={errors.stock}
            keyboardType="number-pad"
            returnKeyType="next"
          />

          <Input
            label="কম-স্টক সতর্কতার সীমা"
            placeholder="5"
            value={fields.threshold}
            onChangeText={(v) => set("threshold", v)}
            error={errors.threshold}
            keyboardType="number-pad"
            hint="স্টক এই সংখ্যার সমান বা কম হলে সতর্কতা দেখাবে"
            returnKeyType="done"
          />

          {/* ── Actions ─────────────────────────────────────────────────── */}
          <View style={styles.actionsRow}>
            <Button
              label={isEdit ? "আপডেট করুন" : "সংরক্ষণ করুন"}
              onPress={handleSave}
              loading={isSaving}
              disabled={busy}
              variant="primary"
              style={{ flex: 1 }}
            />
          </View>

          {isEdit && (
            <TouchableOpacity
              style={[styles.deleteBtn, busy && { opacity: 0.5 }]}
              onPress={handleDelete}
              disabled={busy}
              activeOpacity={0.8}
            >
              <BodyText style={styles.deleteBtnText}>
                {isDeleting ? "মুছছেন…" : "পণ্য মুছুন"}
              </BodyText>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({
  children,
  style,
}: {
  children: string;
  style?: object;
}) {
  return (
    <Caption
      style={[
        {
          color: Palette.grey600,
          fontWeight: "700",
          marginBottom: Spacing.xs,
          textTransform: "uppercase",
          fontSize: 11,
          letterSpacing: 0.6,
        },
        style,
      ]}
    >
      {children}
    </Caption>
  );
}

function MarginPreview({ price, cost }: { price: number; cost: number }) {
  const marginBdt = price - cost;
  const marginPct = price > 0 ? (marginBdt / price) * 100 : 0;
  const isNeg = marginBdt < 0;
  const color = isNeg
    ? Palette.danger
    : marginPct < 15
      ? Palette.warning
      : Palette.success;

  return (
    <View style={[marginPreviewStyles.box, { borderLeftColor: color }]}>
      <BodyText style={{ fontWeight: "700", color, fontSize: 13 }}>
        মার্জিন: ৳{marginBdt.toFixed(2)} ({marginPct >= 0 ? "+" : ""}
        {marginPct.toFixed(1)}%)
      </BodyText>
      <Caption style={{ color: Palette.grey400 }}>
        প্রতি ইউনিট বিক্রয়ে {isNeg ? "ক্ষতি" : "লাভ"}
      </Caption>
    </View>
  );
}

const marginPreviewStyles = StyleSheet.create({
  box: {
    backgroundColor: Palette.grey100,
    borderLeftWidth: 3,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.sm,
  },
});

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  body: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl * 2,
    gap: Spacing.sm,
  },
  actionsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  deleteBtn: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
    backgroundColor: Palette.danger + "15",
    borderRadius: BorderRadius.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Palette.danger + "40",
  },
  deleteBtnText: {
    color: Palette.danger,
    fontWeight: "700",
  },
});
