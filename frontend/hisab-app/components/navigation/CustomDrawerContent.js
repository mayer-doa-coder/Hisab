import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import { useMemo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { COLORS } from '../../theme/colors';

// ── Navigation map ──────────────────────────────────────────────────────────
const ROUTE_META = {
  Dashboard:        { icon: 'dashboard',              labelKey: 'map.ড্যাশবোর্ড' },
  Sales:            { icon: 'point-of-sale',           labelKey: 'map.বিক্রি' },
  Baki:             { icon: 'account-balance',         labelKey: 'map.বাকি' },
  SalesHistory:     { icon: 'history-edu',             labelKey: 'map.বিক্রির ইতিহাস' },
  Cashbook:         { icon: 'account-balance-wallet',  labelKey: 'map.ক্যাশবুক' },
  Expenses:         { icon: 'receipt',                 labelKey: 'map.খরচ' },
  DayClose:         { icon: 'event-available',         labelKey: 'map.দিন বন্ধ' },
  Customers:        { icon: 'groups',                  labelKey: 'map.কাস্টমার' },
  Ledger:           { icon: 'receipt-long',            labelKey: 'map.খাতা' },
  CustomerCredit:   { icon: 'credit-score',            labelKey: 'map.ক্রেডিট' },
  Collections:      { icon: 'analytics',               labelKey: 'map.সংগ্রহ' },
  CustomerStatement:{ icon: 'description',             labelKey: 'map.বিবৃতি' },
  Products:         { icon: 'inventory-2',             labelKey: 'map.পণ্য' },
  Movement:         { icon: 'swap-horiz',              labelKey: 'map.স্টক চলাচল' },
  Alerts:           { icon: 'notification-important',  labelKey: 'map.স্টক সতর্কতা' },
  CycleCount:       { icon: 'fact-check',              labelKey: 'map.চক্র গণনা' },
  StockSuggestions: { icon: 'insights',                labelKey: 'map.পরামর্শ' },
  InventoryBatches: { icon: 'layers',                  labelKey: 'map.ইনভেন্টরি ব্যাচ' },
  Suppliers:        { icon: 'local-shipping',          labelKey: 'map.সরবরাহকারী' },
  PurchaseOrders:   { icon: 'assignment',              labelKey: 'map.ক্রয় আদেশ' },
  GoodsReceive:     { icon: 'inventory',               labelKey: 'map.পণ্য গ্রহণ' },
  PurchaseHistory:  { icon: 'history-toggle-off',      labelKey: 'map.ক্রয়ের ইতিহাস' },
  Reports:          { icon: 'bar-chart',               labelKey: 'map.রিপোর্ট' },
  ProfitReport:     { icon: 'trending-up',             labelKey: 'map.লাভ রিপোর্ট' },
  Audit:            { icon: 'history',                 labelKey: 'map.অডিট' },
  ApprovalRequests: { icon: 'verified-user',           labelKey: 'map.অনুমোদন' },
  VoiceAssistant:   { icon: 'keyboard-voice',          labelKey: 'map.ভয়েস সহকারী' },
  Profile:          { icon: 'person',                  labelKey: 'map.প্রোফাইল' },
  HelpCenter:       { icon: 'help-center',             labelKey: 'map.সাহায্য' },
  Feedback:         { icon: 'forum',                   labelKey: 'map.ফিডব্যাক' },
  BackupRestore:    { icon: 'backup',                  labelKey: 'map.ব্যাকআপ' },
};

const GROUPS = [
  {
    key: 'primary',
    labelKey: null,
    accent: COLORS.accent,
    routes: ['Dashboard', 'Sales'],
    primary: true,
  },
  {
    key: 'transactions',
    labelKey: 'nav.transactions',
    accent: '#4A7C59',
    routes: ['Baki', 'SalesHistory', 'Cashbook', 'Expenses', 'DayClose'],
  },
  {
    key: 'customers',
    labelKey: 'nav.customers',
    accent: '#3A6B9E',
    routes: ['Customers', 'Ledger', 'CustomerCredit', 'Collections', 'CustomerStatement'],
  },
  {
    key: 'inventory',
    labelKey: 'nav.inventory',
    accent: '#7A4F9B',
    routes: ['Products', 'Movement', 'Alerts', 'CycleCount', 'StockSuggestions', 'InventoryBatches'],
  },
  {
    key: 'purchase',
    labelKey: 'nav.purchase',
    accent: '#8A5A2A',
    routes: ['Suppliers', 'PurchaseOrders', 'GoodsReceive', 'PurchaseHistory'],
  },
  {
    key: 'reports',
    labelKey: 'nav.reports',
    accent: '#A53A49',
    routes: ['Reports', 'ProfitReport', 'Audit', 'ApprovalRequests'],
  },
  {
    key: 'system',
    labelKey: 'nav.system',
    accent: COLORS.textMuted,
    routes: ['VoiceAssistant', 'Profile', 'HelpCenter', 'Feedback', 'BackupRestore'],
  },
];

export default function CustomDrawerContent(props) {
  const { state, navigation, canAccess } = props;
  const { t } = useLanguage();
  const { user } = useAuth();
  const activeRouteName = state.routes[state.index]?.name;

  const profileImageUri = String(user?.profileImageUrl || user?.profile_image_uri || '').trim() || null;
  const displayName = String(user?.name || '').trim() || t('profile.noName');
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase() || '?';

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
      {/* ── Profile header ──────────────────────────────── */}
      <TouchableOpacity
        style={styles.profileHeader}
        onPress={() => navigation.navigate('Profile')}
        activeOpacity={0.85}
      >
        <View style={styles.avatarWrap}>
          {profileImageUri ? (
            <Image source={{ uri: profileImageUri }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
          <View style={styles.avatarBadge}>
            <MaterialIcons name="edit" size={10} color="#fff" />
          </View>
        </View>
        <View style={styles.profileMeta}>
          <Text style={styles.profileName} numberOfLines={1}>{displayName}</Text>
          <Text style={styles.profileRole} numberOfLines={1}>
            {String(user?.email || '').trim() || t('profile.noEmail')}
          </Text>
        </View>
      </TouchableOpacity>

      <View style={styles.divider} />

      {/* ── Grouped navigation items ─────────────────────── */}
      {GROUPS.map((group) => {
        const groupRoutes = group.routes.filter((r) => visibleRoutes.has(r));
        if (!groupRoutes.length) return null;

        return (
          <View key={group.key} style={styles.group}>
            {group.labelKey ? (
              <View style={[styles.groupHeaderRow, { borderLeftColor: group.accent }]}>
                <Text style={styles.groupLabel}>{t(group.labelKey)}</Text>
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
                    isActive
                      ? isPrimary
                        ? styles.primaryItemActive
                        : styles.itemActive
                      : styles.itemRaised,
                  ]}
                  onPress={() => handleNavigate(routeName)}
                  activeOpacity={0.75}
                >
                  <View
                    style={[
                      styles.iconWrap,
                      isActive && { backgroundColor: group.accent + '30' },
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
                    {t(meta.labelKey)}
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

const NM_BG = '#7B542F';          // sidebar background (BRAND.primaryDark)
const NM_RAISED = '#8E6035';      // slightly lighter — elevated items
const NM_ACTIVE = '#622F0F';      // darker — pressed/active
const NM_SHADOW = '#4A2E12';      // shadow color
const NM_HIGHLIGHT = 'rgba(255,220,150,0.10)'; // warm top-edge highlight

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 24,
  },

  // ── Profile header ─────────────────────────────────────
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 18,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: COLORS.accent,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: NM_RAISED,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.accent,
    // neumorphic pop
    shadowColor: NM_SHADOW,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.6,
    shadowRadius: 5,
    elevation: 5,
  },
  avatarInitials: {
    fontSize: 18,
    fontFamily: 'AnekBangla_800ExtraBold',
    color: COLORS.accent,
    letterSpacing: 1,
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: NM_BG,
  },
  profileMeta: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    fontSize: 16,
    fontFamily: 'AnekBangla_800ExtraBold',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  profileRole: {
    fontSize: 11,
    fontFamily: 'AnekBangla_500Medium',
    color: COLORS.sidebarText,
    opacity: 0.75,
  },

  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginHorizontal: 16,
    marginBottom: 8,
  },

  // ── Groups ─────────────────────────────────────────────
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
    fontFamily: 'AnekBangla_800ExtraBold',
    color: COLORS.sidebarText,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    opacity: 0.6,
  },

  // ── Items (neumorphic) ─────────────────────────────────
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 10,
    marginVertical: 2,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 12,
    minHeight: 50,
    position: 'relative',
  },
  // Raised (default) neumorphic state
  itemRaised: {
    backgroundColor: NM_RAISED,
    shadowColor: NM_SHADOW,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.45,
    shadowRadius: 5,
    elevation: 3,
    borderTopWidth: 0.5,
    borderTopColor: NM_HIGHLIGHT,
  },
  // Active/pressed neumorphic state
  itemActive: {
    backgroundColor: NM_ACTIVE,
    shadowColor: NM_SHADOW,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 0,
    borderTopWidth: 0,
  },
  primaryItem: {
    marginHorizontal: 10,
    paddingHorizontal: 12,
    minHeight: 54,
    marginVertical: 2,
    borderRadius: 14,
    backgroundColor: NM_RAISED,
    shadowColor: NM_SHADOW,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.45,
    shadowRadius: 5,
    elevation: 3,
    borderTopWidth: 0.5,
    borderTopColor: NM_HIGHLIGHT,
  },
  primaryItemActive: {
    backgroundColor: NM_ACTIVE,
    elevation: 0,
    shadowOpacity: 0.2,
    shadowRadius: 2,
    borderTopWidth: 0,
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
    fontFamily: 'AnekBangla_600SemiBold',
    color: COLORS.sidebarText,
  },
  primaryItemLabel: {
    fontSize: 15,
    fontFamily: 'AnekBangla_700Bold',
    color: '#FFFFFF',
  },
  itemLabelActive: {
    fontFamily: 'AnekBangla_800ExtraBold',
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
