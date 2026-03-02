/**
 * inventory.tsx — Product catalogue, stock levels, profit margins, low-stock alerts.
 *
 * Features implemented:
 *  ① Product catalogue  — full list sorted A→Z with price & stock
 *  ② Low-stock alerts   — amber badge + dedicated alert section
 *  ③ Stock adjustments  — tap any product → adjust stock button → stock-adjust modal
 *  ④ Profit margin view — gross margin % per product; red when margin < 0
 *  ⑤ Weekly sales       — "Weekly Summary" tab aggregated by product
 */

import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";
import { Card } from "../components/ui/Card";
import { Header } from "../components/ui/Header";
import { BodyText, Caption } from "../components/ui/Typography";
import { BorderRadius, Palette, Spacing } from "../constants/theme";
import { productService } from "../services/productService";
import { selectLowStockCount, useProductStore } from "../stores/productStore";
import { Product, WeeklySale } from "../types";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "catalogue" | "weekly";

// ── Helpers ───────────────────────────────────────────────────────────────────

function grossMarginPct(p: Product): number | null {
  if (p.cost_price === null || p.cost_price === undefined || p.price === 0)
    return null;
  return ((p.price - p.cost_price) / p.price) * 100;
}

function marginColor(pct: number): string {
  if (pct < 0) return Palette.danger;
  if (pct < 15) return Palette.warning;
  return Palette.success;
}

// ── Product row ───────────────────────────────────────────────────────────────

const ProductRow = React.memo(function ProductRow({
  product,
  onPress,
}: {
  product: Product;
  onPress: (p: Product) => void;
}) {
  const isLow = product.stock <= product.low_stock_threshold;
  const m = grossMarginPct(product);

  return (
    <TouchableOpacity onPress={() => onPress(product)} activeOpacity={0.8}>
      <Card style={styles.row} elevation="sm">
        {/* Left: name + stock */}
        <View style={{ flex: 1 }}>
          <View style={styles.rowTop}>
            <BodyText style={styles.productName}>{product.name}</BodyText>
            {isLow && (
              <View style={styles.lowBadge}>
                <Caption style={styles.lowBadgeText}>⚠ কম স্টক</Caption>
              </View>
            )}
          </View>
          <Caption style={styles.stockLine}>
            স্টক: {product.stock} ইউনিট
            {product.low_stock_threshold > 0
              ? `  ·  সীমা: ${product.low_stock_threshold}`
              : ""}
          </Caption>
        </View>

        {/* Right: price + margin */}
        <View style={styles.priceCol}>
          <BodyText style={styles.price}>৳{product.price.toFixed(2)}</BodyText>
          {m !== null ? (
            <Caption style={[styles.marginText, { color: marginColor(m) }]}>
              {m >= 0 ? "+" : ""}
              {m.toFixed(1)}%
            </Caption>
          ) : (
            <Caption style={{ color: Palette.grey400, fontSize: 11 }}>
              — মার্জিন
            </Caption>
          )}
        </View>
      </Card>
    </TouchableOpacity>
  );
});

// ── Stat box ─────────────────────────────────────────────────────────────────

function StatBox({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.statBox}>
      <Caption style={styles.statLabel}>{label}</Caption>
      <BodyText
        style={[
          styles.statValue,
          valueColor ? { color: valueColor } : undefined,
        ]}
      >
        {value}
      </BodyText>
    </View>
  );
}

// ── Product detail bottom-sheet ───────────────────────────────────────────────

function ProductDetail({
  product,
  onClose,
  onEdit,
  onAdjust,
  onDelete,
}: {
  product: Product;
  onClose: () => void;
  onEdit: () => void;
  onAdjust: () => void;
  onDelete: () => void;
}) {
  const m = grossMarginPct(product);
  const isLow = product.stock <= product.low_stock_threshold;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        {/* Header */}
        <View style={styles.sheetHeader}>
          <BodyText style={styles.sheetTitle}>{product.name}</BodyText>
          <Pressable onPress={onClose} hitSlop={12}>
            <BodyText style={{ fontSize: 22, color: Palette.grey400 }}>
              ✕
            </BodyText>
          </Pressable>
        </View>

        {/* Stats grid 3-col */}
        <View style={styles.statsGrid}>
          <StatBox
            label="বিক্রয় মূল্য"
            value={`৳${product.price.toFixed(2)}`}
          />
          <StatBox
            label="ক্রয় মূল্য"
            value={
              product.cost_price !== null && product.cost_price !== undefined
                ? `৳${product.cost_price.toFixed(2)}`
                : "নেই"
            }
          />
          <StatBox
            label="গ্রস মার্জিন"
            value={m !== null ? `${m >= 0 ? "+" : ""}${m.toFixed(1)}%` : "—"}
            valueColor={m !== null ? marginColor(m) : Palette.grey400}
          />
          <StatBox
            label="স্টক"
            value={String(product.stock)}
            valueColor={isLow ? Palette.danger : Palette.dark}
          />
          <StatBox
            label="ন্যূনতম সীমা"
            value={String(product.low_stock_threshold)}
          />
          <StatBox
            label="অবস্থা"
            value={isLow ? "⚠ কম" : "✓ স্বাভাবিক"}
            valueColor={isLow ? Palette.danger : Palette.success}
          />
        </View>

        {/* Actions */}
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={onAdjust}
          activeOpacity={0.8}
        >
          <BodyText style={styles.actionBtnText}>স্টক সামঞ্জস্য করুন</BodyText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: Palette.dark + "15" }]}
          onPress={onEdit}
          activeOpacity={0.8}
        >
          <BodyText style={[styles.actionBtnText, { color: Palette.dark }]}>
            তথ্য সম্পাদনা
          </BodyText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: Palette.danger + "18" }]}
          onPress={onDelete}
          activeOpacity={0.8}
        >
          <BodyText style={[styles.actionBtnText, { color: Palette.danger }]}>
            পণ্য মুছুন
          </BodyText>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ── Weekly card ───────────────────────────────────────────────────────────────

function WeeklyCard({
  row,
  productName,
}: {
  row: WeeklySale;
  productName: string;
}) {
  const stateColor: Record<string, string> = {
    HIGH: Palette.success,
    MEDIUM: Palette.warning,
    LOW: Palette.danger,
  };
  return (
    <Card style={styles.weeklyCard} elevation="sm">
      <View style={{ flex: 1 }}>
        <BodyText style={{ fontWeight: "600", fontSize: 13 }}>
          {productName}
        </BodyText>
        <Caption style={{ color: Palette.grey400 }}>{row.week_start}</Caption>
      </View>
      <View style={styles.weeklyRight}>
        <BodyText style={{ fontWeight: "700" }}>
          {row.units_sold} ইউনিট
        </BodyText>
        {row.state ? (
          <Caption
            style={[
              styles.statePill,
              {
                backgroundColor:
                  (stateColor[row.state] ?? Palette.grey400) + "20",
                color: stateColor[row.state] ?? Palette.grey400,
              },
            ]}
          >
            {row.state}
          </Caption>
        ) : null}
      </View>
    </Card>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function InventoryScreen() {
  const router = useRouter();
  const { products, loadingOp, error, load, deleteProduct, clearError } =
    useProductStore();
  const lowCount = useProductStore(selectLowStockCount);

  const [tab, setTab] = useState<Tab>("catalogue");
  const [selected, setSelected] = useState<Product | null>(null);

  // Reload on every focus (handles coming back from product-form / stock-adjust)
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // ── Weekly data — fetched synchronously when tab becomes active ───────────
  const [weeklySales, setWeeklySales] = useState<WeeklySale[]>([]);
  const [weeklyLoading, setWeeklyLoading] = useState(false);

  const loadWeekly = useCallback(() => {
    setWeeklyLoading(true);
    try {
      setWeeklySales(productService.getWeeklySales());
    } catch {
      setWeeklySales([]);
    } finally {
      setWeeklyLoading(false);
    }
  }, []);

  const handleTabChange = (t: Tab) => {
    setTab(t);
    if (t === "weekly") loadWeekly();
  };

  // product id → name lookup for weekly tab
  const nameMap = useMemo(() => {
    const m: Record<number, string> = {};
    for (const p of products) m[p.id] = p.name;
    return m;
  }, [products]);

  // ── Delete with confirmation ───────────────────────────────────────────────
  const handleDeleteConfirm = useCallback(
    (product: Product) => {
      Alert.alert(
        "পণ্য মুছুন",
        `"${product.name}" পণ্যটি সম্পূর্ণরূপে মুছে ফেলবেন?`,
        [
          { text: "বাতিল", style: "cancel" },
          {
            text: "মুছুন",
            style: "destructive",
            onPress: () => {
              setSelected(null);
              deleteProduct(product.id).catch(() => {});
            },
          },
        ],
      );
    },
    [deleteProduct],
  );

  const lowProducts = useMemo(
    () => products.filter((p) => p.stock <= p.low_stock_threshold),
    [products],
  );

  return (
    <View style={{ flex: 1, backgroundColor: Palette.offWhite }}>
      <Header
        title="ইনভেন্টরি"
        subtitle={`${products.length} পণ্য${lowCount > 0 ? ` · ⚠ ${lowCount}টি কম স্টক` : ""}`}
        showBack
      />

      {/* Error banner */}
      {error ? (
        <TouchableOpacity style={styles.errorBanner} onPress={clearError}>
          <BodyText style={styles.errorText}>
            ⚠ {error} (ট্যাপ করুন বন্ধ করতে)
          </BodyText>
        </TouchableOpacity>
      ) : null}

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(["catalogue", "weekly"] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => handleTabChange(t)}
          >
            <BodyText
              style={[styles.tabText, tab === t && styles.tabTextActive]}
            >
              {t === "catalogue" ? "পণ্য তালিকা" : "সাপ্তাহিক বিক্রয়"}
            </BodyText>
          </TouchableOpacity>
        ))}
      </View>

      {/* Loading spinner */}
      {loadingOp === "initial" ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Palette.primary} />
        </View>
      ) : tab === "catalogue" ? (
        <>
          {/* Low-stock alert strip */}
          {lowProducts.length > 0 && (
            <View style={styles.alertStrip}>
              <Caption style={styles.alertText}>
                ⚠ {lowProducts.map((p) => p.name).join(", ")} — স্টক সীমার নিচে
              </Caption>
            </View>
          )}

          <FlatList
            data={products}
            keyExtractor={(p) => String(p.id)}
            renderItem={({ item }) => (
              <ProductRow product={item} onPress={setSelected} />
            )}
            contentContainerStyle={styles.listContent}
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={5}
            ListEmptyComponent={
              <Caption style={styles.empty}>
                কোনো পণ্য নেই। নিচের + বোতাম দিয়ে যোগ করুন।
              </Caption>
            }
          />
        </>
      ) : (
        // ── Weekly sales tab ────────────────────────────────────────────────
        <ScrollView contentContainerStyle={styles.listContent}>
          {weeklyLoading ? (
            <ActivityIndicator
              color={Palette.primary}
              style={{ marginTop: Spacing.xl }}
            />
          ) : weeklySales.length === 0 ? (
            <Caption style={styles.empty}>
              এখনো কোনো সাপ্তাহিক বিক্রয় তথ্য নেই।
            </Caption>
          ) : (
            weeklySales.map((row) => (
              <WeeklyCard
                key={row.id}
                row={row}
                productName={
                  nameMap[row.product_id] ?? `Product #${row.product_id}`
                }
              />
            ))
          )}
        </ScrollView>
      )}

      {/* FAB — add product */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push({ pathname: "/product-form" })}
        activeOpacity={0.85}
        accessibilityLabel="নতুন পণ্য যোগ করুন"
      >
        <BodyText style={styles.fabIcon}>+</BodyText>
      </TouchableOpacity>

      {/* Product detail bottom-sheet */}
      {selected && (
        <ProductDetail
          product={selected}
          onClose={() => setSelected(null)}
          onEdit={() => {
            const p = selected;
            setSelected(null);
            router.push({
              pathname: "/product-form",
              params: { id: String(p.id) },
            });
          }}
          onAdjust={() => {
            const p = selected;
            setSelected(null);
            router.push({
              pathname: "/stock-adjust",
              params: {
                id: String(p.id),
                name: p.name,
                stock: String(p.stock),
              },
            });
          }}
          onDelete={() => handleDeleteConfirm(selected)}
        />
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Error banner
  errorBanner: {
    backgroundColor: Palette.danger,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  errorText: { color: "#fff", fontWeight: "600" },

  // Tab bar
  tabBar: {
    flexDirection: "row",
    backgroundColor: Palette.white,
    borderBottomWidth: 1,
    borderBottomColor: Palette.grey200,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: Palette.primary },
  tabText: { color: Palette.grey400, fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: Palette.dark },

  // Product list
  listContent: { padding: Spacing.md, paddingBottom: 100 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    flexWrap: "wrap",
  },
  productName: { fontWeight: "700", color: Palette.dark, fontSize: 14 },
  stockLine: { color: Palette.grey400, marginTop: 2 },
  priceCol: { alignItems: "flex-end", minWidth: 72 },
  price: { fontWeight: "700", color: Palette.dark },
  marginText: { fontSize: 11, fontWeight: "600" },

  // Low-stock badge
  lowBadge: {
    backgroundColor: Palette.warning + "25",
    borderRadius: BorderRadius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  lowBadgeText: { color: Palette.warning, fontWeight: "700", fontSize: 10 },

  // Alert strip
  alertStrip: {
    backgroundColor: Palette.warning + "18",
    borderLeftWidth: 3,
    borderLeftColor: Palette.warning,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  alertText: { color: Palette.accent, fontWeight: "600" },

  // Weekly tab
  weeklyCard: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  weeklyRight: { alignItems: "flex-end", gap: 2 },
  statePill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BorderRadius.full,
    fontSize: 10,
    fontWeight: "700",
    overflow: "hidden",
  },

  // FAB
  fab: {
    position: "absolute",
    bottom: Spacing.xl,
    right: Spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Palette.primary,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0px 4px 12px rgba(0,0,0,0.25)",
  },
  fabIcon: { color: Palette.dark, fontSize: 30, lineHeight: 34 },

  // Bottom-sheet
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    backgroundColor: Palette.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.sm,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  sheetTitle: { fontWeight: "700", fontSize: 18, color: Palette.dark, flex: 1 },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  statBox: {
    width: "30%",
    backgroundColor: Palette.offWhite,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: 2,
  },
  statLabel: { color: Palette.grey400, fontSize: 10 },
  statValue: { fontWeight: "700", color: Palette.dark, fontSize: 14 },

  actionBtn: {
    backgroundColor: Palette.primary + "20",
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: "center",
  },
  actionBtnText: { fontWeight: "700", color: Palette.dark },

  // Misc
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: {
    color: Palette.grey400,
    textAlign: "center",
    marginTop: Spacing.xxl,
  },
});
