/**
 * record-sale.tsx — Record a cash or baki sale with line-items per product.
 *
 * Features:
 *  ① Product picker modal — searchable list from inventory
 *  ② Line-item cart       — qty +/− per item, remove
 *  ③ Cash / Baki toggle   — baki shows customer picker
 *  ④ Baki → customer      — automatically creates credit transaction
 *  ⑤ Confirm → saves sale, deducts stock, then navigates to receipt
 */

import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    Pressable,
    ScrollView,
    Share,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { Card } from "../components/ui/Card";
import { Header } from "../components/ui/Header";
import { BodyText, Caption, TitleMedium } from "../components/ui/Typography";
import { BorderRadius, FontSize, Palette, Spacing } from "../constants/theme";
import { useCustomerStore } from "../stores/customerStore";
import { useProductStore } from "../stores/productStore";
import { CartItem, useSaleStore } from "../stores/saleStore";
import { Customer, Product } from "../types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return "৳" + n.toFixed(2);
}

function buildReceiptText(
  items: CartItem[],
  total: number,
  isBaki: boolean,
  customerName: string | null,
): string {
  const dateStr = new Date().toLocaleString("bn-BD");
  const lines = [
    "━━━━━━━━━━━━━━━━━━━━",
    "    HISAB — বিক্রয় রসিদ",
    "━━━━━━━━━━━━━━━━━━━━",
    `তারিখ: ${dateStr}`,
    isBaki ? `গ্রাহক: ${customerName ?? "—"}  [বাকি]` : "পেমেন্ট: নগদ",
    "────────────────────",
    ...items.map(
      (i) =>
        `${i.product_name.padEnd(16)} x${i.quantity}   ৳${(i.price * i.quantity).toFixed(2)}`,
    ),
    "────────────────────",
    `মোট: ৳${total.toFixed(2)}`,
    "━━━━━━━━━━━━━━━━━━━━",
  ];
  return lines.join("\n");
}

// ── Cart item row ─────────────────────────────────────────────────────────────

const CartRow = React.memo(function CartRow({
  item,
  onQtyChange,
  onRemove,
}: {
  item: CartItem;
  onQtyChange: (productId: number, qty: number) => void;
  onRemove: (productId: number) => void;
}) {
  return (
    <Card style={styles.cartRow} elevation="sm">
      <View style={{ flex: 1 }}>
        <BodyText style={styles.cartName}>{item.product_name}</BodyText>
        <Caption style={{ color: Palette.grey400 }}>
          {fmt(item.price)} × {item.quantity} ={" "}
          {fmt(item.price * item.quantity)}
        </Caption>
      </View>

      {/* Qty stepper */}
      <View style={styles.stepper}>
        <TouchableOpacity
          style={styles.stepBtn}
          onPress={() =>
            item.quantity > 1
              ? onQtyChange(item.product_id, item.quantity - 1)
              : onRemove(item.product_id)
          }
          activeOpacity={0.7}
        >
          <BodyText style={styles.stepBtnText}>−</BodyText>
        </TouchableOpacity>
        <BodyText style={styles.stepQty}>{item.quantity}</BodyText>
        <TouchableOpacity
          style={styles.stepBtn}
          onPress={() => onQtyChange(item.product_id, item.quantity + 1)}
          activeOpacity={0.7}
        >
          <BodyText style={styles.stepBtnText}>+</BodyText>
        </TouchableOpacity>
      </View>

      {/* Remove */}
      <TouchableOpacity
        onPress={() => onRemove(item.product_id)}
        hitSlop={8}
        style={{ paddingLeft: Spacing.xs }}
      >
        <BodyText style={{ color: Palette.danger, fontSize: 18 }}>✕</BodyText>
      </TouchableOpacity>
    </Card>
  );
});

// ── Product picker modal ──────────────────────────────────────────────────────

function ProductPickerModal({
  products,
  cartIds,
  onSelect,
  onClose,
}: {
  products: Product[];
  cartIds: Set<number>;
  onSelect: (p: Product) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () =>
      query.trim()
        ? products.filter((p) =>
            p.name.toLowerCase().includes(query.toLowerCase()),
          )
        : products,
    [query, products],
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.pickerSheet}>
        {/* Header */}
        <View style={styles.pickerHeader}>
          <BodyText style={styles.pickerTitle}>পণ্য নির্বাচন</BodyText>
          <Pressable onPress={onClose} hitSlop={12}>
            <BodyText style={{ fontSize: 22, color: Palette.grey400 }}>
              ✕
            </BodyText>
          </Pressable>
        </View>

        {/* Search */}
        <TextInput
          style={styles.searchInput}
          placeholder="পণ্য খুঁজুন…"
          placeholderTextColor={Palette.grey400}
          value={query}
          onChangeText={setQuery}
          autoFocus
        />

        {/* List */}
        <FlatList
          data={filtered}
          keyExtractor={(p) => String(p.id)}
          renderItem={({ item }) => {
            const already = cartIds.has(item.id);
            return (
              <TouchableOpacity
                style={[styles.pickerRow, already && { opacity: 0.5 }]}
                onPress={() => !already && onSelect(item)}
                activeOpacity={already ? 1 : 0.75}
              >
                <View style={{ flex: 1 }}>
                  <BodyText style={{ fontWeight: "600" }}>{item.name}</BodyText>
                  <Caption style={{ color: Palette.grey400 }}>
                    স্টক: {item.stock} · {fmt(item.price)}
                  </Caption>
                </View>
                {already && (
                  <Caption
                    style={{ color: Palette.success, fontWeight: "700" }}
                  >
                    ✓ যোগ আছে
                  </Caption>
                )}
              </TouchableOpacity>
            );
          }}
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: Palette.grey200 }} />
          )}
          keyboardShouldPersistTaps="handled"
          style={{ flexGrow: 0, maxHeight: 360 }}
        />
      </View>
    </Modal>
  );
}

// ── Customer picker modal ─────────────────────────────────────────────────────

function CustomerPickerModal({
  customers,
  selected,
  onSelect,
  onClose,
}: {
  customers: Customer[];
  selected: number | null;
  onSelect: (c: Customer) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () =>
      query.trim()
        ? customers.filter((c) =>
            c.name.toLowerCase().includes(query.toLowerCase()),
          )
        : customers,
    [query, customers],
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.pickerSheet}>
        <View style={styles.pickerHeader}>
          <BodyText style={styles.pickerTitle}>গ্রাহক নির্বাচন</BodyText>
          <Pressable onPress={onClose} hitSlop={12}>
            <BodyText style={{ fontSize: 22, color: Palette.grey400 }}>
              ✕
            </BodyText>
          </Pressable>
        </View>

        <TextInput
          style={styles.searchInput}
          placeholder="গ্রাহক খুঁজুন…"
          placeholderTextColor={Palette.grey400}
          value={query}
          onChangeText={setQuery}
          autoFocus
        />

        <FlatList
          data={filtered}
          keyExtractor={(c) => String(c.id)}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.pickerRow,
                selected === item.id && {
                  backgroundColor: Palette.primary + "18",
                },
              ]}
              onPress={() => onSelect(item)}
              activeOpacity={0.75}
            >
              <View style={{ flex: 1 }}>
                <BodyText style={{ fontWeight: "600" }}>{item.name}</BodyText>
                {item.phone ? (
                  <Caption style={{ color: Palette.grey400 }}>
                    {item.phone}
                  </Caption>
                ) : null}
              </View>
              {item.total_baki > 0 && (
                <Caption style={{ color: Palette.danger, fontWeight: "700" }}>
                  বাকি {fmt(item.total_baki)}
                </Caption>
              )}
              {selected === item.id && (
                <Caption
                  style={{
                    color: Palette.success,
                    fontWeight: "700",
                    marginLeft: 6,
                  }}
                >
                  ✓
                </Caption>
              )}
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: Palette.grey200 }} />
          )}
          keyboardShouldPersistTaps="handled"
          style={{ flexGrow: 0, maxHeight: 360 }}
        />
      </View>
    </Modal>
  );
}

// ── Receipt modal ─────────────────────────────────────────────────────────────

function ReceiptModal({
  items,
  total,
  isBaki,
  customerName,
  saleId,
  onClose,
}: {
  items: CartItem[];
  total: number;
  isBaki: boolean;
  customerName: string | null;
  saleId: number;
  onClose: () => void;
}) {
  const handleShare = async () => {
    const text = buildReceiptText(items, total, isBaki, customerName);
    await Share.share({ message: text, title: `HISAB রসিদ #${saleId}` });
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.pickerSheet, { paddingBottom: Spacing.xxl }]}>
        {/* Header */}
        <View style={styles.pickerHeader}>
          <BodyText style={[styles.pickerTitle, { color: Palette.success }]}>
            ✓ বিক্রয় সম্পন্ন
          </BodyText>
          <Pressable onPress={onClose} hitSlop={12}>
            <BodyText style={{ fontSize: 22, color: Palette.grey400 }}>
              ✕
            </BodyText>
          </Pressable>
        </View>

        {/* Receipt body */}
        <ScrollView style={{ maxHeight: 320 }}>
          <View style={styles.receiptBox}>
            <BodyText style={styles.receiptTitle}>
              HISAB — রসিদ #{saleId}
            </BodyText>
            <Caption style={styles.receiptDate}>
              {new Date().toLocaleString("bn-BD")}
            </Caption>
            <Caption style={[styles.receiptDate, { marginBottom: Spacing.sm }]}>
              {isBaki
                ? `গ্রাহক: ${customerName ?? "—"}  [বাকি]`
                : "নগদ বিক্রয়"}
            </Caption>

            {/* Items */}
            {items.map((item) => (
              <View key={item.product_id} style={styles.receiptItemRow}>
                <BodyText style={{ flex: 1, fontSize: 13 }}>
                  {item.product_name}
                </BodyText>
                <Caption style={{ color: Palette.grey600 }}>
                  ×{item.quantity}
                </Caption>
                <BodyText
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    minWidth: 72,
                    textAlign: "right",
                  }}
                >
                  {fmt(item.price * item.quantity)}
                </BodyText>
              </View>
            ))}

            <View style={styles.receiptDivider} />
            <View style={styles.receiptItemRow}>
              <BodyText style={{ flex: 1, fontWeight: "700" }}>মোট</BodyText>
              <BodyText
                style={{ fontWeight: "700", fontSize: 16, color: Palette.dark }}
              >
                {fmt(total)}
              </BodyText>
            </View>
          </View>
        </ScrollView>

        {/* Actions */}
        <TouchableOpacity
          style={styles.shareBtn}
          onPress={handleShare}
          activeOpacity={0.8}
        >
          <BodyText style={styles.shareBtnText}>রসিদ শেয়ার করুন</BodyText>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.doneBtn}
          onPress={onClose}
          activeOpacity={0.85}
        >
          <BodyText style={styles.doneBtnText}>সম্পন্ন</BodyText>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function RecordSaleScreen() {
  const router = useRouter();
  const { products } = useProductStore();
  const { customers } = useCustomerStore();
  const { recordSale, loadingOp } = useSaleStore();

  // ── Cart state ──────────────────────────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isBaki, setIsBaki] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(
    null,
  );

  // ── Modal visibility ────────────────────────────────────────────────────
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);

  // ── Receipt state ───────────────────────────────────────────────────────
  const [receipt, setReceipt] = useState<{
    saleId: number;
    items: CartItem[];
    total: number;
    isBaki: boolean;
    customerName: string | null;
  } | null>(null);

  // ── Derived ─────────────────────────────────────────────────────────────
  const cartTotal = useMemo(
    () => cart.reduce((s, i) => s + i.price * i.quantity, 0),
    [cart],
  );
  const cartIds = useMemo(() => new Set(cart.map((i) => i.product_id)), [cart]);
  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  );

  // ── Handlers ────────────────────────────────────────────────────────────
  const addToCart = useCallback((p: Product) => {
    setCart((prev) => {
      if (prev.find((i) => i.product_id === p.id)) return prev;
      return [
        ...prev,
        { product_id: p.id, product_name: p.name, quantity: 1, price: p.price },
      ];
    });
    setShowProductPicker(false);
  }, []);

  const changeQty = useCallback((productId: number, qty: number) => {
    setCart((prev) =>
      prev.map((i) =>
        i.product_id === productId ? { ...i, quantity: qty } : i,
      ),
    );
  }, []);

  const removeItem = useCallback((productId: number) => {
    setCart((prev) => prev.filter((i) => i.product_id !== productId));
  }, []);

  const handleSelectCustomer = useCallback((c: Customer) => {
    setSelectedCustomerId(c.id);
    setShowCustomerPicker(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (cart.length === 0) {
      Alert.alert("কার্ট খালি", "অন্তত একটি পণ্য যোগ করুন।");
      return;
    }
    if (isBaki && selectedCustomerId === null) {
      Alert.alert(
        "গ্রাহক নির্বাচন করুন",
        "বাকি বিক্রয়ের জন্য গ্রাহক বেছে নিন।",
      );
      return;
    }

    const typeLabel = isBaki ? `বাকি (${selectedCustomer?.name ?? ""})` : "নগদ";

    Alert.alert(
      "বিক্রয় নিশ্চিত করুন",
      `${cart.length}টি পণ্য · মোট ${fmt(cartTotal)} · ${typeLabel}`,
      [
        { text: "বাতিল", style: "cancel" },
        {
          text: "নিশ্চিত",
          onPress: async () => {
            try {
              const id = await recordSale({
                customer_id: isBaki ? selectedCustomerId : null,
                is_baki: isBaki,
                items: cart,
              });
              setReceipt({
                saleId: id,
                items: cart,
                total: cartTotal,
                isBaki,
                customerName: selectedCustomer?.name ?? null,
              });
              // Reset cart
              setCart([]);
              setIsBaki(false);
              setSelectedCustomerId(null);
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : "অজানা ত্রুটি";
              Alert.alert("ব্যর্থ", msg);
            }
          },
        },
      ],
    );
  }, [
    cart,
    isBaki,
    selectedCustomerId,
    selectedCustomer,
    cartTotal,
    recordSale,
  ]);

  const isSaving = loadingOp === "saving";

  return (
    <View style={{ flex: 1, backgroundColor: Palette.offWhite }}>
      <Header title="বিক্রয় রেকর্ড" showBack />

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Cart items ─────────────────────────────────────────────── */}
        <Caption style={styles.sectionLabel}>
          কার্ট ({cart.length} পণ্য)
        </Caption>

        {cart.length === 0 ? (
          <Card style={styles.emptyCart} elevation="sm">
            <BodyText style={{ color: Palette.grey400, textAlign: "center" }}>
              নিচের বোতাম থেকে পণ্য যোগ করুন
            </BodyText>
          </Card>
        ) : (
          cart.map((item) => (
            <CartRow
              key={item.product_id}
              item={item}
              onQtyChange={changeQty}
              onRemove={removeItem}
            />
          ))
        )}

        {/* Add product button */}
        <TouchableOpacity
          style={styles.addProductBtn}
          onPress={() => setShowProductPicker(true)}
          activeOpacity={0.8}
        >
          <BodyText style={styles.addProductText}>+ পণ্য যোগ করুন</BodyText>
        </TouchableOpacity>

        {/* ── Payment type ───────────────────────────────────────────── */}
        <Caption style={[styles.sectionLabel, { marginTop: Spacing.md }]}>
          পেমেন্টের ধরন
        </Caption>
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, !isBaki && styles.toggleActive]}
            onPress={() => setIsBaki(false)}
            activeOpacity={0.8}
          >
            <BodyText
              style={[styles.toggleText, !isBaki && styles.toggleTextActive]}
            >
              নগদ
            </BodyText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, isBaki && styles.toggleBakiActive]}
            onPress={() => setIsBaki(true)}
            activeOpacity={0.8}
          >
            <BodyText
              style={[styles.toggleText, isBaki && styles.toggleTextActive]}
            >
              বাকি
            </BodyText>
          </TouchableOpacity>
        </View>

        {/* ── Customer picker (baki only) ────────────────────────────── */}
        {isBaki && (
          <>
            <Caption style={[styles.sectionLabel, { marginTop: Spacing.md }]}>
              গ্রাহক *
            </Caption>
            <TouchableOpacity
              style={styles.customerPicker}
              onPress={() => setShowCustomerPicker(true)}
              activeOpacity={0.8}
            >
              <View style={{ flex: 1 }}>
                {selectedCustomer ? (
                  <>
                    <BodyText style={{ fontWeight: "700" }}>
                      {selectedCustomer.name}
                    </BodyText>
                    {selectedCustomer.total_baki > 0 && (
                      <Caption style={{ color: Palette.danger }}>
                        বিদ্যমান বাকি: {fmt(selectedCustomer.total_baki)}
                      </Caption>
                    )}
                  </>
                ) : (
                  <BodyText style={{ color: Palette.grey400 }}>
                    গ্রাহক নির্বাচন করুন…
                  </BodyText>
                )}
              </View>
              <BodyText style={{ color: Palette.grey400, fontSize: 18 }}>
                ›
              </BodyText>
            </TouchableOpacity>
          </>
        )}

        {/* ── Order Summary ──────────────────────────────────────────── */}
        {cart.length > 0 && (
          <Card style={styles.summaryCard} elevation="md">
            <View style={styles.summaryRow}>
              <Caption style={{ color: Palette.grey600 }}>উপ-মোট</Caption>
              <BodyText style={{ fontWeight: "600" }}>
                {fmt(cartTotal)}
              </BodyText>
            </View>
            <View style={[styles.summaryRow, { paddingTop: Spacing.xs }]}>
              <TitleMedium style={{ color: Palette.dark }}>মোট</TitleMedium>
              <TitleMedium style={{ color: Palette.dark, fontWeight: "700" }}>
                {fmt(cartTotal)}
              </TitleMedium>
            </View>
          </Card>
        )}

        {/* ── Submit ─────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[
            styles.submitBtn,
            (isSaving || cart.length === 0) && { opacity: 0.5 },
          ]}
          onPress={handleSubmit}
          disabled={isSaving || cart.length === 0}
          activeOpacity={0.85}
        >
          {isSaving ? (
            <ActivityIndicator color={Palette.dark} />
          ) : (
            <BodyText style={styles.submitText}>
              {isBaki
                ? "বাকি বিক্রয় নিশ্চিত করুন"
                : "নগদ বিক্রয় নিশ্চিত করুন"}
            </BodyText>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Modals */}
      {showProductPicker && (
        <ProductPickerModal
          products={products}
          cartIds={cartIds}
          onSelect={addToCart}
          onClose={() => setShowProductPicker(false)}
        />
      )}
      {showCustomerPicker && (
        <CustomerPickerModal
          customers={customers}
          selected={selectedCustomerId}
          onSelect={handleSelectCustomer}
          onClose={() => setShowCustomerPicker(false)}
        />
      )}
      {receipt && (
        <ReceiptModal
          saleId={receipt.saleId}
          items={receipt.items}
          total={receipt.total}
          isBaki={receipt.isBaki}
          customerName={receipt.customerName}
          onClose={() => {
            setReceipt(null);
            router.back();
          }}
        />
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  body: { padding: Spacing.md, paddingBottom: 80, gap: Spacing.sm },

  sectionLabel: {
    color: Palette.grey600,
    fontWeight: "700",
    textTransform: "uppercase",
    fontSize: 11,
    letterSpacing: 0.6,
  },

  // Cart
  cartRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  cartName: { fontWeight: "700", fontSize: 14 },

  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Palette.grey100,
    borderRadius: BorderRadius.md,
    padding: 2,
  },
  stepBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Palette.white,
    borderRadius: BorderRadius.sm,
  },
  stepBtnText: { fontSize: 18, fontWeight: "700", color: Palette.dark },
  stepQty: {
    fontSize: 15,
    fontWeight: "700",
    minWidth: 22,
    textAlign: "center",
  },

  emptyCart: {
    paddingVertical: Spacing.lg,
    alignItems: "center",
  },

  addProductBtn: {
    borderWidth: 1.5,
    borderColor: Palette.primary,
    borderStyle: "dashed",
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: "center",
    backgroundColor: Palette.primary + "10",
  },
  addProductText: { color: Palette.dark, fontWeight: "700" },

  // Payment toggle
  toggleRow: { flexDirection: "row", gap: Spacing.sm },
  toggleBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: Palette.grey200,
    backgroundColor: Palette.white,
  },
  toggleActive: {
    borderColor: Palette.success,
    backgroundColor: Palette.success + "18",
  },
  toggleBakiActive: {
    borderColor: Palette.warning,
    backgroundColor: Palette.warning + "18",
  },
  toggleText: { fontWeight: "600", color: Palette.grey400 },
  toggleTextActive: { color: Palette.dark },

  // Customer picker
  customerPicker: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Palette.white,
    borderWidth: 1.5,
    borderColor: Palette.grey200,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: Spacing.xs,
  },

  // Summary
  summaryCard: { gap: Spacing.xs },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  // Submit
  submitBtn: {
    backgroundColor: Palette.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
    marginTop: Spacing.sm,
    boxShadow: "0px 2px 6px rgba(0,0,0,0.15)",
  },
  submitText: {
    color: Palette.dark,
    fontWeight: "700",
    fontSize: FontSize.bodyLarge,
  },

  // Modals
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  pickerSheet: {
    backgroundColor: Palette.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.md,
    paddingBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pickerTitle: { fontWeight: "700", fontSize: 16, color: Palette.dark },
  searchInput: {
    borderWidth: 1.5,
    borderColor: Palette.grey200,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    fontSize: FontSize.bodyLarge,
    color: Palette.grey800,
    backgroundColor: Palette.grey100,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },

  // Receipt
  receiptBox: {
    backgroundColor: Palette.grey100,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: 4,
  },
  receiptTitle: {
    fontWeight: "700",
    fontSize: 15,
    textAlign: "center",
    color: Palette.dark,
  },
  receiptDate: { textAlign: "center", color: Palette.grey600 },
  receiptItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: 2,
  },
  receiptDivider: {
    height: 1,
    backgroundColor: Palette.grey200,
    marginVertical: Spacing.xs,
  },
  shareBtn: {
    backgroundColor: Palette.dark,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: "center",
  },
  shareBtnText: { color: "#fff", fontWeight: "700" },
  doneBtn: {
    backgroundColor: Palette.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: "center",
  },
  doneBtnText: {
    color: Palette.dark,
    fontWeight: "700",
    fontSize: FontSize.bodyLarge,
  },
});
