import { useLanguage } from '../context/LanguageContext';
import AccountRecoveryScreen from '../screens/auth/AccountRecoveryScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import PinLoginScreen from '../screens/auth/PinLoginScreen';
import ResetPasswordScreen from '../screens/auth/ResetPasswordScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import VerifyEmailScreen from '../screens/auth/VerifyEmailScreen';
import { UI_COLORS } from '../constants/ui-theme';
import { AuthStack } from './navigators';

export function AuthStackNavigator() {
  const { mapText } = useLanguage();
  return (
    <AuthStack.Navigator
      initialRouteName="Login"
      screenOptions={{
        headerStyle: { backgroundColor: UI_COLORS.textPrimary },
        headerTintColor: UI_COLORS.surface,
        headerTitleStyle: { fontFamily: 'AnekBangla_700Bold' },
        contentStyle: { backgroundColor: UI_COLORS.background },
      }}>
      <AuthStack.Screen name="Login" component={LoginScreen} options={{ title: mapText('লগইন') }} />
      <AuthStack.Screen name="PinLogin" component={PinLoginScreen} options={{ title: mapText('PIN লগইন') }} />
      <AuthStack.Screen name="Signup" component={SignupScreen} options={{ title: mapText('নিবন্ধন') }} />
      <AuthStack.Screen name="VerifyEmail" component={VerifyEmailScreen} options={{ title: mapText('ইমেইল যাচাই') }} />
      <AuthStack.Screen name="AccountRecovery" component={AccountRecoveryScreen} options={{ title: mapText('অ্যাকাউন্ট পুনরুদ্ধার') }} />
      <AuthStack.Screen name="ResetPassword" component={ResetPasswordScreen} options={{ title: mapText('PIN রিসেট') }} />
    </AuthStack.Navigator>
  );
}
