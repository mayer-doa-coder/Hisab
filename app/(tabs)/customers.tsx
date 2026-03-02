import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";
import { Card } from "../../components/ui/Card";
import { Header } from "../../components/ui/Header";
import { Input } from "../../components/ui/Input";
import { BengaliBody, BodyText, Caption } from "../../components/ui/Typography";
import { Palette, Spacing } from "../../constants/theme";
import { useCustomerStore } from "../../stores/customerStore";
import { Customer } from "../../types";

// ── Customer row ─────────────────────────────────────────────────────────────

/**
 * Memoised so that scrolling 500 rows doesn't re-render the entire list
 * when only one customer changes. Requires a stable `onPress` reference
 * from the parent (provided via useCallback).
 */
const CustomerRow = React.memo(
  ({
    customer,
    onPress,
  }: {
    customer: Customer;
    onPress: (id: number) => void;
  }) => (
    <TouchableOpacity
      onPress={() => onPress(customer.id)}
      activeOpacity={0.8}
      accessibilityRole="button"
    >
      <Card style={styles.row} elevation="sm">
        {/* Avatar circle */}
        <View
          style={[
            styles.avatar,
            {
              backgroundColor:
                customer.total_baki > 0 ? Palette.primary : Palette.grey200,
            },
          ]}
        >
          <BodyText style={styles.avatarText}>
            {customer.name.charAt(0).toUpperCase()}
          </BodyText>
        </View>

        {/* Name + baki */}
        <View style={{ flex: 1 }}>
          <BodyText style={styles.name}>{customer.name}</BodyText>
          {customer.nickname && (
            <Caption
              style={{ color: Palette.grey400 }}
            >{`"${customer.nickname}"`}</Caption>
          )}
          <BengaliBody
            style={{
              color: customer.total_baki > 0 ? Palette.danger : Palette.success,
            }}
          >
            {customer.total_baki > 0
              ? `বাকি: ৳${customer.total_baki.toFixed(2)}`
              : "কোনো বাকি নেই"}
          </BengaliBody>
        </View>

        {/* Chevron */}
        <BodyText style={styles.chevron}>›</BodyText>
      </Card>
    </TouchableOpacity>
  ),
);
CustomerRow.displayName = "CustomerRow";

// ── Screen ───────────────────────────────────────────────────────────────────

export default function CustomersScreen() {
  const router = useRouter();
  const { customers, totalBaki, loadingOp, error, load, clearError } =
    useCustomerStore();
  const [query, setQuery] = useState("");

  // Debounce: filter computation is deferred 150 ms after the user stops
  // typing — prevents re-rendering 500 rows on every keystroke.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(t);
  }, [query]);

  // Stable press handler so React.memo on CustomerRow actually suppresses
  // re-renders (inline arrow functions defeat memoisation).
  const handleCustomerPress = useCallback(
    (id: number) =>
      router.push({ pathname: "/customer-detail", params: { id } }),
    [router],
  );

  // Reload from DB every time this tab comes into focus
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const filtered = useMemo(() => {
    if (!debouncedQuery.trim()) return customers;
    const q = debouncedQuery.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.nickname ?? "").toLowerCase().includes(q),
    );
  }, [customers, debouncedQuery]);

  return (
    <View style={{ flex: 1, backgroundColor: Palette.offWhite }}>
      <Header
        title="Customers"
        subtitle={`কাস্টমার তালিকা · মোট বাকি ৳${totalBaki.toFixed(0)}`}
        showBack
      />

      {/* Error banner */}
      {error ? (
        <TouchableOpacity
          style={styles.errorBanner}
          onPress={clearError}
          accessibilityRole="alert"
          accessibilityLabel={`Error: ${error}. Tap to dismiss.`}
        >
          <BodyText style={styles.errorText}>⚠ {error}</BodyText>
        </TouchableOpacity>
      ) : null}

      <Input
        placeholder="Search by name or nickname…"
        value={query}
        onChangeText={setQuery}
        containerStyle={styles.search}
        clearButtonMode="while-editing"
      />

      {/* Loading skeleton — only on very first paint (no cached data) */}
      {loadingOp === "initial" ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Palette.primary} />
          <BengaliBody style={styles.loadingText}>লোড হচ্ছে…</BengaliBody>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={styles.list}
          // ── Virtualisation tuning for 500+ rows ──────────────────────────
          initialNumToRender={15} // paint only the first screen-full
          maxToRenderPerBatch={10} // add 10 rows per JS frame while scrolling
          windowSize={5} // keep 5× viewport heights in memory (default 21)
          updateCellsBatchingPeriod={50} // batch cell updates every 50 ms
          removeClippedSubviews
          renderItem={({ item }) => (
            <CustomerRow customer={item} onPress={handleCustomerPress} />
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <BengaliBody style={styles.emptyText}>
                {query.trim() ? "কোনো ফলাফল নেই" : "কোনো কাস্টমার নেই"}
              </BengaliBody>
              {!query.trim() && (
                <BodyText style={styles.emptyHint}>
                  Tap + to add your first customer
                </BodyText>
              )}
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* FAB — add customer */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push("/add-customer")}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Add new customer"
      >
        <BodyText style={styles.fabIcon}>+</BodyText>
      </TouchableOpacity>
    </View>
  );
}
// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  errorBanner: {
    backgroundColor: "#fdecea",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderLeftWidth: 4,
    borderLeftColor: Palette.danger,
  },
  errorText: {
    color: Palette.danger,
    fontSize: 13,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  loadingText: {
    color: Palette.grey400,
  },
  search: {
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
  },
  list: {
    padding: Spacing.md,
    paddingBottom: 100, // leave room above FAB
    gap: Spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontWeight: "700",
    fontSize: 18,
    color: Palette.dark,
  },
  name: {
    fontWeight: "600",
    color: Palette.grey800,
  },
  chevron: {
    fontSize: 22,
    color: Palette.grey400,
  },
  emptyContainer: {
    alignItems: "center",
    marginTop: Spacing.xxl,
    paddingHorizontal: Spacing.lg,
  },
  emptyText: {
    color: Palette.grey400,
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  emptyHint: {
    color: Palette.grey400,
    textAlign: "center",
    fontSize: 13,
  },
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
    boxShadow: "0px 4px 8px rgba(0,0,0,0.25)",
  },
  fabIcon: {
    color: "#fff",
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "400",
  },
});
