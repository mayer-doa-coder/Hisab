import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet } from 'react-native';

import { useLanguage } from '../context/LanguageContext';
import { COLORS } from '../theme/colors';
import { SPACING } from '../theme/spacing';
import { TYPOGRAPHY } from '../theme/typography';

import BakiListScreen from '../screens/BakiListScreen';
import DashboardScreen from '../screens/DashboardScreen';
import ProductListScreen from '../screens/ProductListScreen';
import SalesScreen from '../screens/SalesScreen';
import { MainSidebarNavigator } from './DrawerNavigator';

const Tab = createBottomTabNavigator();

/**
 * BottomTabNavigator — Rural-first primary navigation.
 *
 * Design rationale:
 *  - 5 tabs covering the 4 daily tasks + "More" for advanced features
 *  - Icon + label always visible (no icon-only tabs)
 *  - Tab bar height 64dp + safe area — large enough for counter-top one-thumb use
 *  - Active tab uses filled icon + accent underline for unambiguous state
 *  - "More" tab reveals the full drawer navigator for power users
 *
 * Tab structure:
 *   1. ড্যাশবোর্ড / Dashboard  — daily overview
 *   2. বিক্রি / Sales          — add a sale (most frequent action)
 *   3. বাকি / Credit           — baki/credit management
 *   4. পণ্য / Products         — inventory
 *   5. আরো / More              — drawer with all 35 screens
 */
export function BottomTabNavigator() {
  const { t } = useLanguage();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
        tabBarIcon: ({ focused, color, size }) =>
          getTabIcon(route.name, focused, color, size),
      })}
    >
      <Tab.Screen
        name="TabDashboard"
        component={DashboardScreen}
        options={{ tabBarLabel: t('nav.tab.dashboard') }}
      />
      <Tab.Screen
        name="TabSales"
        component={SalesScreen}
        options={{ tabBarLabel: t('nav.tab.sales') }}
      />
      <Tab.Screen
        name="TabBaki"
        component={BakiListScreen}
        options={{ tabBarLabel: t('nav.tab.baki') }}
      />
      <Tab.Screen
        name="TabProducts"
        component={ProductListScreen}
        options={{ tabBarLabel: t('nav.tab.products') }}
      />
      <Tab.Screen
        name="TabMore"
        component={MainSidebarNavigator}
        options={{
          tabBarLabel: t('nav.tab.more'),
          tabBarIcon: ({ focused, color }) => (
            <MaterialIcons
              name={focused ? 'menu-open' : 'menu'}
              size={26}
              color={color}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// ── Icon resolver ──────────────────────────────────────────────────────────────

const TAB_ICONS = {
  TabDashboard: { active: 'dashboard', inactive: 'dashboard' },
  TabSales:     { active: 'point-of-sale', inactive: 'point-of-sale' },
  TabBaki:      { active: 'account-balance', inactive: 'account-balance' },
  TabProducts:  { active: 'inventory-2', inactive: 'inventory-2' },
  TabMore:      { active: 'menu-open', inactive: 'menu' },
};

function getTabIcon(routeName, focused, color, size) {
  const icons = TAB_ICONS[routeName] || { active: 'circle', inactive: 'circle' };
  return (
    <View style={focused ? styles.iconActive : styles.iconInactive}>
      <MaterialIcons
        name={focused ? icons.active : icons.inactive}
        size={size ?? 26}
        color={color}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft,
    height: 64,
    paddingBottom: SPACING.xs,
    paddingTop: SPACING.xs,
    elevation: 12,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  tabItem: {
    paddingVertical: SPACING.xs,
  },
  tabLabel: {
    ...TYPOGRAPHY.small,
    fontSize: 11,
    marginTop: 2,
  },
  iconActive: {
    backgroundColor: `${COLORS.primary}18`,
    borderRadius: 16,
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
  },
  iconInactive: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
  },
});
