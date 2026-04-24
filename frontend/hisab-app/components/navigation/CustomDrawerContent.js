import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { COLORS } from '../../theme/colors';

// ── Navigation map ──────────────────────────────────────────────────────────
// route → { icon, label }
const ROUTE_META = {
  Dashboard:        { icon: 'dashboard',              label: 'ড্যাশবোর্ড' },
  Sales:            { icon: 'point-of-sale',           label: 'বিক্রি' },
  Baki:             { icon: 'account-balance',         label: 'বাকি' },
  SalesHistory:     { icon: 'history-edu',             label: 'বিক্রির ইতিহাস' },
  Cashbook:         { icon: 'account-balance-wallet',  label: 'ক্যাশবুক' },
  Expenses:         { icon: 'receipt',                 label: 'খরচ' },
  DayClose:         { icon: 'event-available',         label: 'দিন বন্ধ' },
  Customers:        { icon: 'groups',                  label: 'কাস্টমার' },
  Ledger:           { icon: 'receipt-long',            label: 'খাতা' },
  CustomerCredit:   { icon: 'credit-score',            label: 'ক্রেডিট' },
  Collections:      { icon: 'analytics',               label: 'সংগ্রহ' },
  CustomerStatement:{ icon: 'description',             label: 'বিবৃতি' },
  Products:         { icon: 'inventory-2',             label: 'পণ্য' },
  Movement:         { icon: 'swap-horiz',              label: 'স্টক চলাচল' },
  Alerts:           { icon: 'notification-important',  label: 'স্টক সতর্কতা' },
  CycleCount:       { icon: 'fact-check',              label: 'চক্র গণনা' },
  StockSuggestions: { icon: 'insights',                label: 'পরামর্শ' },
  InventoryBatches: { icon: 'layers',                  label: 'ইনভেন্টরি ব্যাচ' },
  Suppliers:        { icon: 'local-shipping',          label: 'সরবরাহকারী' },
  PurchaseOrders:   { icon: 'assignment',              label: 'ক্রয় আদেশ' },
  GoodsReceive:     { icon: 'inventory',               label: 'পণ্য গ্রহণ' },
  PurchaseHistory:  { icon: 'history-toggle-off',      label: 'ক্রয়ের ইতিহাস' },
  Reports:          { icon: 'bar-chart',               label: 'রিপোর্ট' },
  ProfitReport:     { icon: 'trending-up',             label: 'লাভ রিপোর্ট' },
  Audit:            { icon: 'history',                 label: 'অডিট' },
  ApprovalRequests: { icon: 'verified-user',           label: 'অনুমোদন' },
  VoiceAssistant:   { icon: 'keyboard-voice',          label: 'ভয়েস সহকারী' },
  Profile:          { icon: 'person',                  label: 'প্রোফাইল' },
  HelpCenter:       { icon: 'help-center',             label: 'সাহায্য' },
  Feedback:         { icon: 'forum',                   label: 'ফিডব্যাক' },
  BackupRestore:    { icon: 'backup',                  label: 'ব্যাকআপ' },
};

const GROUPS = [
  {
    key: 'primary',
    label: null, // no section header for top items
    accent: COLORS.accent,
    routes: ['Dashboard', 'Sales'],
    primary: true,
  },
  {
    key: 'transactions',
    label: 'লেনদেন',
    accent: '#4A7C59',
    routes: ['Baki', 'SalesHistory', 'Cashbook', 'Expenses', 'DayClose'],
  },
  {
    key: 'customers',
    label: 'কাস্টমার',
    accent: '#3A6B9E',
    routes: ['Customers', 'Ledger', 'CustomerCredit', 'Collections', 'CustomerStatement'],
  },
  {
    key: 'inventory',
    label: 'ইনভেন্টরি',
    accent: '#7A4F9B',
    routes: ['Products', 'Movement', 'Alerts', 'CycleCount', 'StockSuggestions', 'InventoryBatches'],
  },
  {
    key: 'purchase',
    label: 'ক্রয়',
    accent: '#8A5A2A',
    routes: ['Suppliers', 'PurchaseOrders', 'GoodsReceive', 'PurchaseHistory'],
  },
  {
    key: 'reports',
    label: 'রিপোর্ট',
    accent: '#A53A49',
    routes: ['Reports', 'ProfitReport', 'Audit', 'ApprovalRequests'],
  },
  {
    key: 'system',
    label: 'সিস্টেম',
    accent: COLORS.textMuted,
    routes: ['VoiceAssistant', 'Profile', 'HelpCenter', 'Feedback', 'BackupRestore'],
  },
];

export default function CustomDrawerContent(props) {
  const { state, navigation, canAccess } = props;
  const activeRouteName = state.routes[state.index]?.name;

  const visibleRoutes = useMemo(() => {
    const set = new Set();
    for (const route of state.routes) {
      if (!canAccess || canAccess(route.name)) set.add(route.name);
    }
    return set;
  }, [state.routes, canAccess]);

  const handleNavigate = (routeName) => {
    navigation.navigate(routeName);
  };

  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* ── App header ──────────────────────────────────── */}
      <View style={styles.appHeader}>
        <View style={styles.appIconWrap}>
          <MaterialIcons name="storefront" size={28} color={COLORS.accent} />
        </View>
        <View>
          <Text style={styles.appName}>হিসাব</Text>
          <Text style={styles.appTagline}>ব্যবসার হিসাব</Text>
        </View>
      </View>

      <View style={styles.divider} />

      {/* ── Grouped navigation items ─────────────────────── */}
      {GROUPS.map((group) => {
        const groupRoutes = group.routes.filter((r) => visibleRoutes.has(r));
        if (!groupRoutes.length) return null;

        return (
          <View key={group.key} style={styles.group}>
            {group.label ? (
              <View style={[styles.groupHeaderRow, { borderLeftColor: group.accent }]}>
                <Text style={styles.groupLabel}>{group.label}</Text>
              </View>
            ) : null}

            {groupRoutes.map((routeName) => {
              const meta = ROUTE_META[routeName];
              if (!meta) return null;
              const isActive = activeRouteName === routeName;
              const isPrimary = group.primary;

              return (
                <TouchableOpacity
                  key={routeName}
                  style={[
                    styles.item,
                    isPrimary && styles.primaryItem,
                    isActive && (isPrimary ? styles.primaryItemActive : styles.itemActive),
                  ]}
                  onPress={() => handleNavigate(routeName)}
                  activeOpacity={0.75}
                >
                  <View
                    style={[
                      styles.iconWrap,
                      isActive && { backgroundColor: group.accent + '28' },
                    ]}
                  >
                    <MaterialIcons
                      name={meta.icon}
                      size={22}
                      color={
                        isActive
                          ? group.accent
                          : isPrimary
                          ? COLORS.accent
                          : COLORS.sidebarText
                      }
                    />
                  </View>

                  <Text
                    style={[
                      styles.itemLabel,
                      isPrimary && styles.primaryItemLabel,
                      isActive && [styles.itemLabelActive, { color: group.accent }],
                    ]}
                  >
                    {meta.label}
                  </Text>

                  {isActive ? (
                    <View style={[styles.activePip, { backgroundColor: group.accent }]} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        );
      })}

      <View style={styles.bottomPad} />
    </DrawerContentScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 24,
  },

  // App header
  appHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
  },
  appIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: COLORS.sidebarActiveBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  appTagline: {
    fontSize: 11,
    color: COLORS.sidebarText,
    fontWeight: '500',
    opacity: 0.8,
  },

  divider: {
    height: 1,
    backgroundColor: COLORS.sidebarActiveBackground,
    marginHorizontal: 16,
    marginBottom: 8,
    opacity: 0.5,
  },

  // Groups
  group: {
    marginBottom: 4,
  },
  groupHeaderRow: {
    borderLeftWidth: 3,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingLeft: 8,
  },
  groupLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.sidebarText,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    opacity: 0.65,
  },

  // Items
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 12,
    minHeight: 50,
    position: 'relative',
  },
  primaryItem: {
    marginHorizontal: 10,
    paddingHorizontal: 12,
    minHeight: 54,
  },
  itemActive: {
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  primaryItemActive: {
    backgroundColor: COLORS.sidebarActiveBackground,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.sidebarText,
  },
  primaryItemLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  itemLabelActive: {
    fontWeight: '800',
  },
  activePip: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  bottomPad: {
    height: 32,
  },
});
