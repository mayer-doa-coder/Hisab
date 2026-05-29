import { useLanguage } from '../context/LanguageContext';
import ReceiptScreen from '../screens/ReceiptScreen';
import SetupPinScreen from '../screens/auth/SetupPinScreen';
import UpdatePasswordScreen from '../screens/auth/UpdatePasswordScreen';
import { UI_COLORS } from '../constants/ui-theme';
import { MainSidebarNavigator } from './DrawerNavigator';
import { MainStack } from './navigators';

export function MainStackNavigator() {
  const { mapText } = useLanguage();
  return (
    <MainStack.Navigator>
      <MainStack.Screen name="MainSidebar" component={MainSidebarNavigator} options={{ headerShown: false }} />
      <MainStack.Screen
        name="Receipt"
        component={ReceiptScreen}
        options={{
          title: mapText('রসিদ'),
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
          title: mapText('PIN আপডেট'),
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
          title: mapText('PIN সেটআপ'),
          headerStyle: { backgroundColor: UI_COLORS.textPrimary },
          headerTintColor: UI_COLORS.surface,
          headerTitleStyle: { fontFamily: 'AnekBangla_700Bold' },
          contentStyle: { backgroundColor: UI_COLORS.background },
        }}
      />
    </MainStack.Navigator>
  );
}
