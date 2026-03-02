import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
    Alert,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";
import { Card } from "../components/ui/Card";
import { Header } from "../components/ui/Header";
import { ScreenContainer } from "../components/ui/ScreenContainer";
import {
    BengaliBody,
    BengaliTitle,
    BodyText,
    Caption,
    TitleMedium,
} from "../components/ui/Typography";
import { BorderRadius, FontSize, Palette, Spacing } from "../constants/theme";
import { customerService } from "../services/customerService";
import { useCustomerStore } from "../stores/customerStore";
import {
    filterTransactions,
    useTransactionStore,
} from "../stores/transactionStore";
import { Customer, Transaction, TransactionType } from "../types";

// ── Transaction row ──────────────────────────────────────────────────────────

/**
 * Memoised — a filter-chip tap changes `displayed` but should not re-render
 * rows whose underlying transaction object hasn't changed.
 */
const TxRow = React.memo(({ tx }: { tx: Transaction }) => (
  <View style={styles.txRow} accessibilityRole="text">
    <View
      style={[
        styles.txBadge,
        {
          backgroundColor:
            tx.type === "credit" ? Palette.danger : Palette.success,
        },
      ]}
    >
      <Caption style={{ color: "#fff", fontWeight: "600" }}>
        {tx.type === "credit" ? "বাকি" : "পেমেন্ট"}
      </Caption>
    </View>
    <View style={{ flex: 1 }}>
      <BodyText style={{ fontWeight: "600" }}>৳{tx.amount.toFixed(2)}</BodyText>
      {tx.note ? (
        <Caption style={{ color: Palette.grey600 }}>{tx.note}</Caption>
      ) : null}
    </View>
    <Caption style={{ color: Palette.grey400 }}>
      {new Date(tx.created_at).toLocaleDateString("bn-BD")}
    </Caption>
  </View>
));
TxRow.displayName = "TxRow";

// ── Quick-entry panel ────────────────────────────────────────────────────────

// ── Filter chip ───────────────────────────────────────────────────────────────

type TxFilter = TransactionType | "all";

const FilterChip: React.FC<{
  label: string;
  active: boolean;
  color?: string;
  onPress: () => void;
}> = ({ label, active, color = Palette.primary, onPress }) => (
  <TouchableOpacity
    style={[
      styles.chipBtn,
      active && { backgroundColor: color, borderColor: color },
    ]}
    onPress={onPress}
    accessibilityRole="button"
  >
    <Caption style={[styles.chipLabel, active && { color: Palette.white }]}>
      {label}
    </Caption>
  </TouchableOpacity>
);

// ── Screen ───────────────────────────────────────────────────────────────────

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { deleteCustomer } = useCustomerStore();
  const txStore = useTransactionStore();
  const loadForCustomer = useTransactionStore((s) => s.loadForCustomer);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [activeFilter, setActiveFilter] = useState<TxFilter>("all");

  const reload = useCallback(() => {
    if (!id) return;
    const c = customerService.getCustomerById(Number(id));
    setCustomer(c);
    if (c) loadForCustomer(c.id);
  }, [id, loadForCustomer]); // txStore is a stable singleton

  // Re-run whenever this screen gains focus (initial mount + return from edit/modals)
  useFocusEffect(reload);

  // ── Navigation to transaction modals ────────────────────────────────────────

  const handleBakiPress = () => {
    if (!customer) return;
    router.push({
      pathname: "/baki-modal",
      params: { customerId: String(customer.id), customerName: customer.name },
    });
  };

  const handlePaymentPress = () => {
    if (!customer) return;
    if (customer.total_baki <= 0) {
      Alert.alert("কোনো বাকি নেই", "এই কাস্টমারের কোনো বাকি নেই।");
      return;
    }
    router.push({
      pathname: "/payment-modal",
      params: {
        customerId: String(customer.id),
        customerName: customer.name,
        balance: customer.total_baki.toFixed(2),
      },
    });
  };

  const handleDelete = () => {
    if (!customer) return;
    Alert.alert(
      "কাস্টমার মুছুন",
      `"${customer.name}" এবং তার সমস্ত লেনদেন মুছে ফেলবেন? এটি পূর্বাবস্থায় ফিরানো যাবে না।`,
      [
        { text: "বাতিল", style: "cancel" },
        {
          text: "মুছুন",
          style: "destructive",
          onPress: async () => {
            await deleteCustomer(customer.id);
            txStore.reset();
            router.back();
          },
        },
      ],
    );
  };

  // ── Derived display data ─────────────────────────────────────────────────────

  const displayed = filterTransactions(txStore.transactions, activeFilter);
  const totalCredit = txStore.totalCredit();
  const totalPaid = txStore.totalPaid();

  if (!customer) {
    return (
      <View style={{ flex: 1, backgroundColor: Palette.offWhite }}>
        <Header title="Customer" showBack />
        <ScreenContainer>
          <BengaliBody style={{ textAlign: "center", marginTop: Spacing.xxl }}>
            কাস্টমার পাওয়া যায়নি
          </BengaliBody>
        </ScreenContainer>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Palette.offWhite }}>
      <Header
        title={customer.name}
        subtitle={customer.nickname ? `"${customer.nickname}"` : undefined}
        showBack
        right={
          <View style={{ flexDirection: "row", gap: Spacing.xs }}>
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/edit-customer",
                  params: { id: String(customer.id) },
                })
              }
              accessibilityRole="button"
              accessibilityLabel="Edit customer"
              style={styles.headerBtn}
            >
              <BodyText
                style={{
                  color: Palette.white,
                  fontSize: 15,
                  fontWeight: "700",
                }}
              >
                সম্পাদনা
              </BodyText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleDelete}
              accessibilityRole="button"
              accessibilityLabel="Delete customer"
              style={styles.headerBtn}
            >
              <BodyText
                style={{ color: "#f28b82", fontSize: 15, fontWeight: "700" }}
              >
                মুছুন
              </BodyText>
            </TouchableOpacity>
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Balance summary card ─────────────────────────────────────────── */}
        <Card style={styles.summaryCard} elevation="md">
          <Caption style={{ color: Palette.grey600 }}>মোট বাকি</Caption>
          <BengaliTitle
            style={{
              color: customer.total_baki > 0 ? Palette.danger : Palette.success,
              fontSize: 32,
              marginTop: Spacing.xs,
            }}
          >
            ৳{customer.total_baki.toFixed(2)}
          </BengaliTitle>

          {customer.phone ? (
            <Caption style={{ marginTop: Spacing.sm, color: Palette.grey400 }}>
              {customer.phone}
            </Caption>
          ) : null}

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: Palette.danger }]}
              onPress={handleBakiPress}
              accessibilityRole="button"
              accessibilityLabel="Add baki credit"
            >
              <BodyText style={styles.actionBtnText}>+ বাকি দিন</BodyText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionBtn,
                {
                  backgroundColor:
                    customer.total_baki > 0 ? Palette.success : Palette.grey200,
                },
              ]}
              onPress={handlePaymentPress}
              accessibilityRole="button"
              accessibilityLabel="Record payment"
            >
              <BodyText
                style={[
                  styles.actionBtnText,
                  customer.total_baki <= 0 && { color: Palette.grey400 },
                ]}
              >
                ✓ পেমেন্ট
              </BodyText>
            </TouchableOpacity>
          </View>
        </Card>

        {/* ── Stats bar (credit vs paid totals) ────────────────────────────── */}
        {txStore.transactions.length > 0 && (
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Caption style={{ color: Palette.grey600 }}>
                মোট বাকি দিয়েছেন
              </Caption>
              <TitleMedium style={{ color: Palette.danger, fontWeight: "700" }}>
                ৳{totalCredit.toFixed(2)}
              </TitleMedium>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Caption style={{ color: Palette.grey600 }}>মোট পেমেন্ট</Caption>
              <TitleMedium
                style={{ color: Palette.success, fontWeight: "700" }}
              >
                ৳{totalPaid.toFixed(2)}
              </TitleMedium>
            </View>
          </View>
        )}

        {/* ── Transaction history ───────────────────────────────────────────── */}
        <View style={styles.historyHeader}>
          <TitleMedium style={styles.sectionTitle}>লেনদেনের ইতিহাস</TitleMedium>
          <Caption style={{ color: Palette.grey400 }}>
            {txStore.transactions.length} টি
          </Caption>
        </View>

        {/* Filter chips */}
        <View style={styles.filterRow}>
          <FilterChip
            label="সব"
            active={activeFilter === "all"}
            color={Palette.primary}
            onPress={() => setActiveFilter("all")}
          />
          <FilterChip
            label="বাকি"
            active={activeFilter === "credit"}
            color={Palette.danger}
            onPress={() => setActiveFilter("credit")}
          />
          <FilterChip
            label="পেমেন্ট"
            active={activeFilter === "payment"}
            color={Palette.success}
            onPress={() => setActiveFilter("payment")}
          />
        </View>

        {/* Transaction rows */}
        {displayed.length === 0 ? (
          <BengaliBody
            style={{
              color: Palette.grey400,
              textAlign: "center",
              marginTop: Spacing.xl,
            }}
          >
            {txStore.transactions.length === 0
              ? "কোনো লেনদেন নেই"
              : "এই ফিল্টারে কোনো লেনদেন নেই"}
          </BengaliBody>
        ) : (
          displayed.map((tx) => <TxRow key={tx.id} tx={tx} />)
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  summaryCard: {
    marginBottom: Spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: Palette.primary,
    alignItems: "flex-start",
  },
  actionRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    width: "100%",
  },
  actionBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  actionBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: FontSize.body,
  },
  sectionTitle: {
    marginBottom: Spacing.sm,
    color: Palette.dark,
  },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Palette.grey200,
  },
  txBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  entryPanel: {
    backgroundColor: Palette.white,
    borderRadius: BorderRadius.md,
    borderTopWidth: 3,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    boxShadow: "0px 2px 4px rgba(0,0,0,0.08)",
  },
  // ── Stats bar ──────────────────────────────────────────────────────────────
  statsRow: {
    flexDirection: "row",
    backgroundColor: Palette.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Palette.grey200,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statDivider: {
    width: 1,
    backgroundColor: Palette.grey200,
    marginVertical: 4,
  },
  // ── History section ────────────────────────────────────────────────────────
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  filterRow: {
    flexDirection: "row",
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  chipBtn: {
    paddingVertical: 5,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Palette.grey200,
    backgroundColor: Palette.white,
  },
  chipLabel: {
    color: Palette.grey600,
    fontWeight: "600",
    fontSize: FontSize.caption,
  },
  headerBtn: {
    padding: Spacing.xs,
    borderRadius: 6,
  },
});
