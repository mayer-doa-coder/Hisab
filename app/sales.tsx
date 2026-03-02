/**
 * sales.tsx — Sales history, daily/weekly revenue totals, receipt preview.
 *
 * Features:
 *  ① Sales history      — list of all sales, tap for receipt preview
 *  ② Daily totals       — revenue per day for the last 30 days
 *  ③ Weekly product     — top products this week by revenue
 *  ④ Receipt preview    — modal with shareable text receipt
 *  → FAB navigates to record-sale screen
 */

import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    Share,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";
import { Card } from "../components/ui/Card";
import { Header } from "../components/ui/Header";
import { BodyText, Caption, TitleMedium } from "../components/ui/Typography";
import { BorderRadius, Palette, Spacing } from "../constants/theme";
import { DailyTotal, ProductTotal } from "../repositories/ISaleRepository";
import { useCustomerStore } from "../stores/customerStore";
import { useSaleStore } from "../stores/saleStore";
import { Sale, SaleItem } from "../types";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "history" | "daily" | "weekly";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return "৳" + n.toFixed(2);
}

/** Last N days as "YYYY-MM-DD" strings, descending */
function lastNDays(n: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (n - 1));
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function buildReceiptText(
  sale: Sale,
  items: SaleItem[],
  customerName: string | null,
  productNames: Record<number, string>,
): string {
  const lines = [
    "━━━━━━━━━━━━━━━━━━━━",
    "    HISAB — বিক্রয় রসিদ",
    "━━━━━━━━━━━━━━━━━━━━",
    `রসিদ#: ${sale.id}`,
    `তারিখ: ${sale.created_at}`,
    sale.is_baki ? `গ্রাহক: ${customerName ?? "—"}  [বাকি]` : "নগদ বিক্রয়",
    "────────────────────",
    ...items.map(
      (i) =>
        `${(productNames[i.product_id] ?? "#" + i.product_id).padEnd(16)} x${i.quantity}  ৳${(i.price * i.quantity).toFixed(2)}`,
    ),
    "────────────────────",
    `মোট: ৳${sale.total.toFixed(2)}`,
    "━━━━━━━━━━━━━━━━━━━━",
  ];
  return lines.join("\n");
}

// ── Receipt detail modal ──────────────────────────────────────────────────────

function ReceiptModal({
  sale,
  onClose,
  customerName,
  productNames,
}: {
  sale: Sale;
  onClose: () => void;
  customerName: string | null;
  productNames: Record<number, string>;
}) {
  const { getSaleItems } = useSaleStore();
  const [items, setItems] = useState<SaleItem[]>([]);

  React.useEffect(() => {
    try {
      setItems(getSaleItems(sale.id));
    } catch {
      setItems([]);
    }
  }, [sale.id, getSaleItems]);

  const handleShare = async () => {
    const text = buildReceiptText(sale, items, customerName, productNames);
    await Share.share({ message: text, title: `HISAB রসিদ #${sale.id}` });
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        {/* Header */}
        <View style={styles.sheetHeader}>
          <BodyText style={styles.sheetTitle}>রসিদ #{sale.id}</BodyText>
          <Pressable onPress={onClose} hitSlop={12}>
            <BodyText style={{ fontSize: 22, color: Palette.grey400 }}>
              ✕
            </BodyText>
          </Pressable>
        </View>

        {/* Meta */}
        <Caption style={{ color: Palette.grey400 }}>{sale.created_at}</Caption>
        <View style={styles.metaRow}>
          <View
            style={[
              styles.typePill,
              {
                backgroundColor: sale.is_baki
                  ? Palette.warning + "20"
                  : Palette.success + "20",
              },
            ]}
          >
            <Caption
              style={{
                fontWeight: "700",
                color: sale.is_baki ? Palette.warning : Palette.success,
              }}
            >
              {sale.is_baki ? "বাকি" : "নগদ"}
            </Caption>
          </View>
          {sale.is_baki && customerName && (
            <Caption style={{ color: Palette.grey600, fontWeight: "600" }}>
              {customerName}
            </Caption>
          )}
        </View>

        {/* Items */}
        <ScrollView style={{ maxHeight: 260 }}>
          {items.map((item) => (
            <View key={item.id} style={styles.receiptItemRow}>
              <BodyText style={{ flex: 1, fontSize: 13 }}>
                {productNames[item.product_id] ?? `#${item.product_id}`}
              </BodyText>
              <Caption style={{ color: Palette.grey600 }}>
                ×{item.quantity}
              </Caption>
              <BodyText
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  minWidth: 80,
                  textAlign: "right",
                }}
              >
                {fmt(item.price * item.quantity)}
              </BodyText>
            </View>
          ))}
        </ScrollView>

        <View style={styles.receiptDivider} />
        <View style={styles.receiptTotalRow}>
          <TitleMedium>মোট</TitleMedium>
          <TitleMedium style={{ fontWeight: "700", color: Palette.dark }}>
            {fmt(sale.total)}
          </TitleMedium>
        </View>

        {/* Actions */}
        <TouchableOpacity
          style={styles.shareBtn}
          onPress={handleShare}
          activeOpacity={0.8}
        >
          <BodyText style={styles.shareBtnText}>রসিদ শেয়ার করুন</BodyText>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ── Sale list row ─────────────────────────────────────────────────────────────

const SaleRow = React.memo(function SaleRow({
  sale,
  customerName,
  onPress,
}: {
  sale: Sale;
  customerName: string | null;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <Card style={styles.saleRow} elevation="sm">
        <View style={{ flex: 1 }}>
          <View style={styles.saleRowTop}>
            <BodyText style={styles.saleId}>#{sale.id}</BodyText>
            <View
              style={[
                styles.typePill,
                {
                  backgroundColor: sale.is_baki
                    ? Palette.warning + "20"
                    : Palette.success + "20",
                },
              ]}
            >
              <Caption
                style={{
                  fontWeight: "700",
                  fontSize: 10,
                  color: sale.is_baki ? Palette.warning : Palette.success,
                }}
              >
                {sale.is_baki ? "বাকি" : "নগদ"}
              </Caption>
            </View>
          </View>
          <Caption style={{ color: Palette.grey400 }}>
            {sale.created_at}
            {customerName ? `  ·  ${customerName}` : ""}
          </Caption>
        </View>
        <BodyText style={styles.saleTotal}>{fmt(sale.total)}</BodyText>
      </Card>
    </TouchableOpacity>
  );
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function SalesScreen() {
  const router = useRouter();
  const {
    sales,
    loadingOp,
    error,
    load,
    getDailyTotals,
    getWeeklyProductTotals,
    clearError,
  } = useSaleStore();
  const { customers } = useCustomerStore();

  const [tab, setTab] = useState<Tab>("history");
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  // Customer lookup map for display
  const customerMap = useMemo<Record<number, string>>(() => {
    const m: Record<number, string> = {};
    for (const c of customers) m[c.id] = c.name;
    return m;
  }, [customers]);

  // Product names — we'll gather them from sale items on demand (loaded in ReceiptModal)
  // For the list, we just need customer names
  const productNames = useMemo<Record<number, string>>(() => ({}), []);

  // Daily totals (last 30 days)
  const [dailyTotals, setDailyTotals] = useState<DailyTotal[]>([]);
  const [weeklyTotals, setWeeklyTotals] = useState<ProductTotal[]>([]);

  const loadTabData = useCallback(
    (t: Tab) => {
      if (t === "daily") {
        try {
          const { from, to } = lastNDays(30);
          setDailyTotals(getDailyTotals(from, to));
        } catch {
          setDailyTotals([]);
        }
      } else if (t === "weekly") {
        try {
          setWeeklyTotals(getWeeklyProductTotals());
        } catch {
          setWeeklyTotals([]);
        }
      }
    },
    [getDailyTotals, getWeeklyProductTotals],
  );

  const handleTabChange = (t: Tab) => {
    setTab(t);
    loadTabData(t);
  };

  useFocusEffect(
    useCallback(() => {
      load();
      loadTabData(tab);
    }, [load, loadTabData, tab]),
  );

  // Revenue totals
  const totalRevenue = useMemo(
    () => sales.reduce((s, sale) => s + sale.total, 0),
    [sales],
  );
  const bakiRevenue = useMemo(
    () => sales.filter((s) => s.is_baki).reduce((s, sale) => s + sale.total, 0),
    [sales],
  );

  return (
    <View style={{ flex: 1, backgroundColor: Palette.offWhite }}>
      <Header
        title="বিক্রয়"
        subtitle={`${sales.length} রেকর্ড · মোট ${fmt(totalRevenue)}`}
        showBack
      />

      {/* Error banner */}
      {error ? (
        <TouchableOpacity style={styles.errorBanner} onPress={clearError}>
          <BodyText style={styles.errorText}>⚠ {error}</BodyText>
        </TouchableOpacity>
      ) : null}

      {/* Summary strip */}
      <View style={styles.summaryStrip}>
        <View style={styles.summaryChip}>
          <Caption style={{ color: Palette.grey600 }}>রাজস্ব</Caption>
          <BodyText style={{ fontWeight: "700", color: Palette.dark }}>
            {fmt(totalRevenue)}
          </BodyText>
        </View>
        <View
          style={[
            styles.summaryChip,
            { borderLeftWidth: 1, borderColor: Palette.grey200 },
          ]}
        >
          <Caption style={{ color: Palette.grey600 }}>বাকি বিক্রয়</Caption>
          <BodyText style={{ fontWeight: "700", color: Palette.warning }}>
            {fmt(bakiRevenue)}
          </BodyText>
        </View>
        <View
          style={[
            styles.summaryChip,
            { borderLeftWidth: 1, borderColor: Palette.grey200 },
          ]}
        >
          <Caption style={{ color: Palette.grey600 }}>নগদ বিক্রয়</Caption>
          <BodyText style={{ fontWeight: "700", color: Palette.success }}>
            {fmt(totalRevenue - bakiRevenue)}
          </BodyText>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {(
          [
            ["history", "ইতিহাস"],
            ["daily", "দৈনিক"],
            ["weekly", "সাপ্তাহিক"],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => handleTabChange(t)}
          >
            <Caption
              style={[styles.tabText, tab === t && styles.tabTextActive]}
            >
              {label}
            </Caption>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {loadingOp === "initial" ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Palette.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {/* ── History tab ───────────────────────────────────────────── */}
          {tab === "history" &&
            (sales.length === 0 ? (
              <Caption style={styles.empty}>
                কোনো বিক্রয় নেই। নিচের + বোতামে ট্যাপ করুন।
              </Caption>
            ) : (
              sales.map((sale) => (
                <SaleRow
                  key={sale.id}
                  sale={sale}
                  customerName={
                    sale.customer_id !== null
                      ? (customerMap[sale.customer_id] ?? null)
                      : null
                  }
                  onPress={() => setSelectedSale(sale)}
                />
              ))
            ))}

          {/* ── Daily totals tab ──────────────────────────────────────── */}
          {tab === "daily" &&
            (dailyTotals.length === 0 ? (
              <Caption style={styles.empty}>এই মাসে কোনো বিক্রয় নেই।</Caption>
            ) : (
              dailyTotals.map((row) => (
                <Card key={row.date} style={styles.totalsRow} elevation="sm">
                  <View style={{ flex: 1 }}>
                    <BodyText style={{ fontWeight: "700" }}>
                      {row.date}
                    </BodyText>
                    <Caption style={{ color: Palette.grey400 }}>
                      {row.sale_count}টি বিক্রয়
                    </Caption>
                  </View>
                  <BodyText style={{ fontWeight: "700", color: Palette.dark }}>
                    {fmt(row.total)}
                  </BodyText>
                </Card>
              ))
            ))}

          {/* ── Weekly product totals tab ─────────────────────────────── */}
          {tab === "weekly" &&
            (weeklyTotals.length === 0 ? (
              <Caption style={styles.empty}>
                গত ৭ দিনে কোনো বিক্রয় নেই।
              </Caption>
            ) : (
              <>
                <Caption style={styles.weeklyHint}>
                  গত ৭ দিনের পণ্যভিত্তিক রাজস্ব
                </Caption>
                {weeklyTotals.map((row, i) => (
                  <Card
                    key={row.product_id}
                    style={styles.totalsRow}
                    elevation="sm"
                  >
                    <View style={styles.rankBadge}>
                      <BodyText style={styles.rankText}>{i + 1}</BodyText>
                    </View>
                    <View style={{ flex: 1 }}>
                      <BodyText style={{ fontWeight: "700" }}>
                        {row.product_name}
                      </BodyText>
                      <Caption style={{ color: Palette.grey400 }}>
                        {row.units_sold} ইউনিট বিক্রয়
                      </Caption>
                    </View>
                    <BodyText
                      style={{ fontWeight: "700", color: Palette.dark }}
                    >
                      {fmt(row.revenue)}
                    </BodyText>
                  </Card>
                ))}
              </>
            ))}
        </ScrollView>
      )}

      {/* FAB — record new sale */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push({ pathname: "/record-sale" })}
        activeOpacity={0.85}
        accessibilityLabel="নতুন বিক্রয় রেকর্ড করুন"
      >
        <BodyText style={styles.fabIcon}>+</BodyText>
      </TouchableOpacity>

      {/* Receipt modal */}
      {selectedSale && (
        <ReceiptModal
          sale={selectedSale}
          customerName={
            selectedSale.customer_id !== null
              ? (customerMap[selectedSale.customer_id] ?? null)
              : null
          }
          productNames={productNames}
          onClose={() => setSelectedSale(null)}
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

  // Summary strip
  summaryStrip: {
    flexDirection: "row",
    backgroundColor: Palette.white,
    borderBottomWidth: 1,
    borderBottomColor: Palette.grey200,
  },
  summaryChip: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    alignItems: "center",
    gap: 2,
  },

  // Tabs
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
  tabText: { color: Palette.grey400, fontWeight: "600" },
  tabTextActive: { color: Palette.dark },

  // List
  listContent: { padding: Spacing.md, paddingBottom: 100, gap: Spacing.sm },
  saleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  saleRowTop: { flexDirection: "row", alignItems: "center", gap: Spacing.xs },
  saleId: { fontWeight: "700", color: Palette.dark },
  saleTotal: {
    fontWeight: "700",
    color: Palette.dark,
    minWidth: 80,
    textAlign: "right",
  },
  typePill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BorderRadius.full,
  },

  // Totals rows
  totalsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  weeklyHint: {
    color: Palette.grey600,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Palette.primary + "30",
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: { fontWeight: "700", fontSize: 13, color: Palette.dark },

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

  // Receipt modal
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
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
  },
  sheetTitle: { fontWeight: "700", fontSize: 18, color: Palette.dark },
  metaRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  receiptItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: 3,
  },
  receiptDivider: {
    height: 1,
    backgroundColor: Palette.grey200,
    marginVertical: Spacing.xs,
  },
  receiptTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  shareBtn: {
    backgroundColor: Palette.dark,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: "center",
  },
  shareBtnText: { color: "#fff", fontWeight: "700" },

  // Misc
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: {
    color: Palette.grey400,
    textAlign: "center",
    marginTop: Spacing.xxl,
  },
});
