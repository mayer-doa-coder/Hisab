/**
 * suggestions.tsx — Smart Suggestions screen
 *
 * Three models surface recommendations automatically:
 *  • EMA (Exponential Moving Average)  → how many to restock
 *  • Safety Reorder Model              → when to restock
 *  • First-order Markov Chain          → related products to restock together
 */

import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";
import { Card } from "../components/ui/Card";
import { Header } from "../components/ui/Header";
import {
    BengaliBody,
    BengaliCaption,
    BengaliTitle,
    BodyText,
    Caption,
    TitleMedium,
} from "../components/ui/Typography";
import { BorderRadius, Palette, Spacing } from "../constants/theme";
import { Suggestion, SuggestionKind } from "../services/suggestionEngine";
import { useSuggestionStore } from "../stores/suggestionStore";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const KIND_META: Record<
  SuggestionKind,
  { color: string; bg: string; label: string; labelBn: string }
> = {
  critical_restock: {
    color: Palette.danger,
    bg: Palette.danger + "18",
    label: "Critical",
    labelBn: "জরুরি",
  },
  restock: {
    color: Palette.warning,
    bg: Palette.warning + "18",
    label: "Restock",
    labelBn: "স্টক কম",
  },
  trending: {
    color: Palette.secondary,
    bg: Palette.secondary + "18",
    label: "Trending",
    labelBn: "ট্রেন্ডিং",
  },
  slow_mover: {
    color: Palette.grey400,
    bg: Palette.grey100,
    label: "Slow",
    labelBn: "ধীর",
  },
  price_review: {
    color: Palette.success,
    bg: Palette.success + "18",
    label: "Price",
    labelBn: "দাম",
  },
};

const DEMAND_COLOR: Record<string, string> = {
  LOW: Palette.grey400,
  MEDIUM: Palette.warning,
  HIGH: Palette.success,
};

const DEMAND_BN: Record<string, string> = {
  LOW: "কম",
  MEDIUM: "মাঝারি",
  HIGH: "বেশি",
};

type FilterKey = "all" | SuggestionKind;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "সব" },
  { key: "critical_restock", label: "জরুরি" },
  { key: "restock", label: "স্টক" },
  { key: "trending", label: "ট্রেন্ড" },
  { key: "slow_mover", label: "ধীর" },
  { key: "price_review", label: "দাম" },
];

function daysLabel(days: number): string {
  if (days >= 999) return "∞ দিন";
  if (days <= 0) return "শেষ";
  return `${days} দিন`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DemandBadge({ state }: { state: string | null }) {
  if (!state) return null;
  const color = DEMAND_COLOR[state] ?? Palette.grey400;
  return (
    <View
      style={[
        styles.demandBadge,
        { backgroundColor: color + "22", borderColor: color },
      ]}
    >
      <Caption style={{ color, fontWeight: "700", fontSize: 10 }}>
        {DEMAND_BN[state] ?? state}
      </Caption>
    </View>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniStat}>
      <Caption style={styles.miniStatLabel}>{label}</Caption>
      <BengaliBody style={styles.miniStatValue}>{value}</BengaliBody>
    </View>
  );
}

function RelatedChips({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <View style={styles.relatedRow}>
      <Caption style={styles.relatedTitle}>সাথে রিস্টক করুন:</Caption>
      <View style={styles.chipRow}>
        {names.map((n) => (
          <View key={n} style={styles.chip}>
            <Caption style={styles.chipText}>{n}</Caption>
          </View>
        ))}
      </View>
    </View>
  );
}

function SuggestionCard({ item }: { item: Suggestion }) {
  const meta = KIND_META[item.kind];
  return (
    <Card
      style={{ ...styles.card, borderLeftColor: meta.color }}
      elevation="sm"
    >
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={[styles.kindBadge, { backgroundColor: meta.bg }]}>
          <Caption style={[styles.kindLabel, { color: meta.color }]}>
            {meta.labelBn}
          </Caption>
        </View>
        {item.restock_qty > 0 && (
          <View style={[styles.restockBadge, { backgroundColor: meta.color }]}>
            <Caption style={styles.restockText}>
              +{item.restock_qty} ইউনিট
            </Caption>
          </View>
        )}
      </View>

      {/* Product name + title */}
      <BengaliTitle style={[styles.productName, { color: Palette.dark }]}>
        {item.product_name}
      </BengaliTitle>
      <Caption
        style={[styles.cardTitle, { color: meta.color, fontWeight: "700" }]}
      >
        {item.title_bn}
      </Caption>

      {/* Detail text */}
      <BengaliBody style={styles.cardDetail}>{item.detail}</BengaliBody>

      {/* Stats grid */}
      <View style={styles.statsRow}>
        <MiniStat label="স্টক" value={`${item.current_stock}`} />
        <MiniStat label="রি-অর্ডার" value={`${item.reorder_point}`} />
        <MiniStat label="সেফটি স্টক" value={`${item.safety_stock}`} />
        <MiniStat label="EMA/সপ্তাহ" value={`${item.ema_demand}`} />
        <MiniStat
          label="স্টক থাকবে"
          value={daysLabel(item.days_of_stock_left)}
        />
        {item.predicted_state !== null && (
          <View style={styles.miniStat}>
            <Caption style={styles.miniStatLabel}>পূর্বাভাস</Caption>
            <DemandBadge state={item.predicted_state} />
          </View>
        )}
      </View>

      {/* Conviction bar */}
      {item.conviction > 0 && (
        <View style={styles.convictionRow}>
          <Caption style={{ color: Palette.grey600, marginRight: Spacing.xs }}>
            নিশ্চিততা:
          </Caption>
          <View style={styles.convictionTrack}>
            <View
              style={[
                styles.convictionFill,
                {
                  width:
                    `${Math.round(item.conviction * 100)}%` as `${number}%`,
                  backgroundColor: meta.color,
                },
              ]}
            />
          </View>
          <Caption
            style={{
              color: meta.color,
              marginLeft: Spacing.xs,
              fontWeight: "700",
            }}
          >
            {Math.round(item.conviction * 100)}%
          </Caption>
        </View>
      )}

      {/* Related products (Markov similarity) */}
      <RelatedChips names={item.related_product_names} />
    </Card>
  );
}

// ─── Summary strip ────────────────────────────────────────────────────────────

function SummaryStrip({ suggestions }: { suggestions: Suggestion[] }) {
  const counts = useMemo(() => {
    const c: Record<SuggestionKind, number> = {
      critical_restock: 0,
      restock: 0,
      trending: 0,
      slow_mover: 0,
      price_review: 0,
    };
    for (const s of suggestions) c[s.kind]++;
    return c;
  }, [suggestions]);

  const items = [
    { label: "জরুরি", count: counts.critical_restock, color: Palette.danger },
    { label: "স্টক কম", count: counts.restock, color: Palette.warning },
    {
      label: "ট্রেন্ডিং",
      count: counts.trending + counts.price_review,
      color: Palette.secondary,
    },
    { label: "ধীর", count: counts.slow_mover, color: Palette.grey400 },
  ];

  return (
    <View style={styles.summaryStrip}>
      {items.map((item) => (
        <View key={item.label} style={styles.summaryItem}>
          <BengaliTitle style={[styles.summaryCount, { color: item.color }]}>
            {item.count}
          </BengaliTitle>
          <BengaliCaption style={styles.summaryLabel}>
            {item.label}
          </BengaliCaption>
        </View>
      ))}
    </View>
  );
}

// ─── No-data state (first-run explainer) ─────────────────────────────────────

const HOW_IT_WORKS = [
  {
    num: "1",
    label: "সাপ্তাহিক বিক্রয় রেকর্ড",
    detail: "প্রতিটি বিক্রয় weekly_sales টেবিল আপডেট করে",
  },
  {
    num: "2",
    label: "চাহিদার অবস্থা নির্ধারণ",
    detail: "প্রতি সপ্তাহ LOW / MEDIUM / HIGH লেবেল পায়",
  },
  {
    num: "3",
    label: "মার্কভ ট্রানজিশন ম্যাট্রিক্স",
    detail: "চেইন শিখে কোন অবস্থা থেকে কোন অবস্থায় যাওয়ার সম্ভাবনা কত",
  },
  {
    num: "4",
    label: "আগামী সপ্তাহের পূর্বাভাস",
    detail: "প্রতিটি পণ্যের চাহিদার অবস্থা আগাম জানা যায়",
  },
  {
    num: "5",
    label: "পরামর্শ প্রদর্শন",
    detail: "রিস্টক অ্যালার্ট, দাম পরামর্শ এবং ক্যাশফ্লো সংকেত",
  },
];

function NoDataState() {
  return (
    <>
      <Card style={styles.hero} elevation="md">
        <TitleMedium style={styles.heroTitle}>Smart Suggestions</TitleMedium>
        <BengaliBody style={styles.heroSub}>
          পণ্য বিক্রয় রেকর্ড করুন — মডেল স্বয়ংক্রিয়ভাবে পরামর্শ তৈরি করবে
        </BengaliBody>
      </Card>

      <View style={styles.badgeRow}>
        <View style={styles.badge}>
          <Caption style={styles.badgeText}>EMA ফোরকাস্ট</Caption>
        </View>
        <View style={styles.badge}>
          <Caption style={styles.badgeText}>সেফটি রিঅর্ডার</Caption>
        </View>
        <View style={styles.badge}>
          <Caption style={styles.badgeText}>মার্কভ চেইন</Caption>
        </View>
      </View>

      <TitleMedium style={styles.sectionTitle}>এটি কীভাবে কাজ করে</TitleMedium>
      {HOW_IT_WORKS.map((item) => (
        <Card key={item.num} style={styles.stepRow} elevation="sm">
          <View style={styles.stepBubble}>
            <BodyText style={styles.stepNum}>{item.num}</BodyText>
          </View>
          <View style={{ flex: 1 }}>
            <BodyText style={styles.stepLabel}>{item.label}</BodyText>
            <Caption style={{ color: Palette.grey600 }}>{item.detail}</Caption>
          </View>
        </Card>
      ))}
    </>
  );
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

function FilterBar({
  active,
  onSelect,
  counts,
}: {
  active: FilterKey;
  onSelect: (k: FilterKey) => void;
  counts: Record<FilterKey, number>;
}) {
  return (
    <View style={styles.filterBar}>
      {FILTERS.map((f) => {
        const isActive = active === f.key;
        const count = counts[f.key];
        return (
          <TouchableOpacity
            key={f.key}
            onPress={() => onSelect(f.key)}
            style={[styles.filterBtn, isActive && styles.filterBtnActive]}
          >
            <Caption
              style={[styles.filterLabel, isActive && styles.filterLabelActive]}
            >
              {f.label}
              {count > 0 && f.key !== "all" ? ` (${count})` : ""}
            </Caption>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function SuggestionsScreen() {
  const { suggestions, isLoading, error, lastUpdated, load } =
    useSuggestionStore();
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const filtered = useMemo(
    () =>
      activeFilter === "all"
        ? suggestions
        : suggestions.filter((s) => s.kind === activeFilter),
    [suggestions, activeFilter],
  );

  const filterCounts = useMemo((): Record<FilterKey, number> => {
    const c: Record<FilterKey, number> = {
      all: suggestions.length,
      critical_restock: 0,
      restock: 0,
      trending: 0,
      slow_mover: 0,
      price_review: 0,
    };
    for (const s of suggestions) c[s.kind]++;
    return c;
  }, [suggestions]);

  const hasData = suggestions.length > 0;

  return (
    <View style={styles.root}>
      <Header
        title="পরামর্শ"
        subtitle="Smart Suggestions"
        showBack
        right={
          isLoading ? undefined : (
            <TouchableOpacity onPress={load} style={styles.refreshBtn}>
              <BodyText style={styles.refreshIcon}>↻</BodyText>
            </TouchableOpacity>
          )
        }
      />

      {isLoading && !hasData ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Palette.primary} />
          <BengaliBody style={styles.loadingText}>বিশ্লেষণ চলছে…</BengaliBody>
        </View>
      ) : (
        <FlatList
          data={hasData ? filtered : []}
          keyExtractor={(item) => `${item.product_id}-${item.kind}`}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={load}
              colors={[Palette.primary]}
              tintColor={Palette.primary}
            />
          }
          ListHeaderComponent={
            <View>
              {hasData && <SummaryStrip suggestions={suggestions} />}
              {hasData && (
                <>
                  {lastUpdated !== null && (
                    <Caption style={styles.lastUpdated}>
                      শেষ আপডেট:{" "}
                      {new Date(lastUpdated).toLocaleTimeString("bn-BD", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Caption>
                  )}
                  <FilterBar
                    active={activeFilter}
                    onSelect={setActiveFilter}
                    counts={filterCounts}
                  />
                  {filtered.length === 0 && (
                    <Card style={styles.emptyFilter} elevation="sm">
                      <BengaliBody style={styles.emptyText}>
                        এই বিভাগে কোনো পরামর্শ নেই।
                      </BengaliBody>
                    </Card>
                  )}
                </>
              )}
              {!hasData && !isLoading && <NoDataState />}
              {error !== null && (
                <Card style={styles.errorCard} elevation="sm">
                  <Caption style={{ color: Palette.danger }}>{error}</Caption>
                </Card>
              )}
            </View>
          }
          renderItem={({ item }) => <SuggestionCard item={item} />}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.offWhite },
  list: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  loadingText: { color: Palette.grey600 },
  refreshBtn: { padding: Spacing.xs },
  refreshIcon: { fontSize: 22, color: Palette.dark, fontWeight: "700" },
  lastUpdated: {
    color: Palette.grey400,
    textAlign: "right",
    marginBottom: Spacing.xs,
  },

  // Summary strip
  summaryStrip: {
    flexDirection: "row",
    backgroundColor: Palette.white,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    justifyContent: "space-around",
  },
  summaryItem: { alignItems: "center" },
  summaryCount: { fontSize: 22, fontWeight: "700" },
  summaryLabel: { color: Palette.grey400 },

  // Filters
  filterBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  filterBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Palette.grey100,
    borderWidth: 1,
    borderColor: Palette.grey200,
  },
  filterBtnActive: { backgroundColor: Palette.dark, borderColor: Palette.dark },
  filterLabel: { color: Palette.grey600, fontWeight: "600" },
  filterLabelActive: { color: Palette.white },

  // Suggestion card
  card: {
    marginBottom: Spacing.sm,
    borderLeftWidth: 4,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  kindBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  kindLabel: { fontWeight: "700", fontSize: 11 },
  restockBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  restockText: { color: Palette.white, fontWeight: "700", fontSize: 11 },
  productName: { fontSize: 16, marginBottom: 2 },
  cardTitle: { marginBottom: Spacing.xs },
  cardDetail: {
    color: Palette.grey600,
    marginBottom: Spacing.sm,
    lineHeight: 20,
  },

  // Stats grid
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  miniStat: {
    backgroundColor: Palette.grey100,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    minWidth: 72,
    alignItems: "center",
  },
  miniStatLabel: { color: Palette.grey600, fontSize: 10 },
  miniStatValue: { color: Palette.dark, fontWeight: "700", fontSize: 12 },

  // Demand badge
  demandBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },

  // Conviction bar
  convictionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  convictionTrack: {
    flex: 1,
    height: 6,
    backgroundColor: Palette.grey200,
    borderRadius: 3,
    overflow: "hidden",
  },
  convictionFill: { height: "100%", borderRadius: 3 },

  // Related products chips
  relatedRow: { marginTop: Spacing.xs },
  relatedTitle: { color: Palette.grey600, marginBottom: 4 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  chip: {
    backgroundColor: Palette.primary + "33",
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Palette.primary,
  },
  chipText: { color: Palette.dark, fontWeight: "600" },

  // Empty states
  emptyFilter: { alignItems: "center", paddingVertical: Spacing.lg },
  emptyText: { color: Palette.grey600 },
  errorCard: {
    marginBottom: Spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: Palette.danger,
  },

  // No-data / how-it-works
  hero: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    marginBottom: Spacing.md,
    borderTopWidth: 4,
    borderTopColor: Palette.dark,
  },
  heroIcon: { fontSize: 48, marginBottom: Spacing.sm },
  heroTitle: { color: Palette.dark, marginBottom: Spacing.xs },
  heroSub: { color: Palette.grey600, textAlign: "center" },
  badgeRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    flexWrap: "wrap",
  },
  badge: {
    backgroundColor: Palette.success + "22",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Palette.success,
  },
  badgeText: { color: Palette.success, fontWeight: "600" },
  sectionTitle: { color: Palette.dark, marginBottom: Spacing.sm },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  stepBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Palette.dark,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  stepNum: { color: Palette.white, fontWeight: "700", fontSize: 13 },
  stepLabel: { fontWeight: "600", color: Palette.grey800 },
});
