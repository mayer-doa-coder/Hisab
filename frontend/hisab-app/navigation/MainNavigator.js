import { useLanguage } from '../context/LanguageContext';
import ReceiptScreen from '../screens/ReceiptScreen';
import SetupPinScreen from '../screens/auth/SetupPinScreen';
import UpdatePasswordScreen from '../screens/auth/UpdatePasswordScreen';
import { UI_COLORS } from '../constants/ui-theme';
import { BottomTabNavigator } from './BottomTabNavigator';
import { MainStack } from './navigators';

/**
 * MainStackNavigator — wraps the primary UI in a stack so modal screens
 * (Receipt, SetupPin, UpdatePassword) can slide over the bottom tab bar.
 *
 * Primary navigation: BottomTabNavigator (5 tabs — rural-first UX)
 * Modal screens:      Receipt, UpdatePassword, SetupPin
 *
 * The full drawer (35+ screens) is still accessible via the "More" tab
 * inside BottomTabNavigator, preserving all existing navigation paths.
 */
export function MainStackNavigator() {
  const { t } = useLanguage();

  return (
    <MainStack.Navigator>
      {/* Primary shell — bottom tabs with 5 core areas */}
      <MainStack.Screen
        name="MainTabs"
        component={BottomTabNavigator}
        options={{ headerShown: false }}
      />

      {/* Modal screens that slide over the tab bar */}
      <MainStack.Screen
        name="Receipt"
        component={ReceiptScreen}
        options={{
          title: t('nav.receipt'),
          headerStyle: { backgroundColor: UI_COLORS.textPrimary },
          headerTintColor: UI_COLORS.surface,
          headerTitleStyle: { fontFamily: 'AnekBangla_700Bold' },
          contentStyle: { backgroundColor: UI_COLORS.background },
        }}
      />
      <MainStack.Screen
        name="UpdatePassword"
        component={UpdatePasswordScreen}
        options={{
          title: t('nav.updatePassword'),
          headerStyle: { backgroundColor: UI_COLORS.textPrimary },
          headerTintColor: UI_COLORS.surface,
          headerTitleStyle: { fontFamily: 'AnekBangla_700Bold' },
          contentStyle: { backgroundColor: UI_COLORS.background },
        }}
      />
      <MainStack.Screen
        name="SetupPin"
        component={SetupPinScreen}
        options={{
          title: t('nav.setupPin'),
          headerStyle: { backgroundColor: UI_COLORS.textPrimary },
          headerTintColor: UI_COLORS.surface,
          headerTitleStyle: { fontFamily: 'AnekBangla_700Bold' },
          contentStyle: { backgroundColor: UI_COLORS.background },
        }}
      />
    </MainStack.Navigator>
  );
}
