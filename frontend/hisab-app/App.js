import {
  useFonts,
  AnekBangla_400Regular,
  AnekBangla_500Medium,
  AnekBangla_600SemiBold,
  AnekBangla_700Bold,
  AnekBangla_800ExtraBold,
} from '@expo-google-fonts/anek-bangla';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { registerRootComponent } from 'expo';
import { cloneElement, isValidElement } from 'react';
import { ActivityIndicator, Alert, Text, TextInput } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { BootLoading } from './components/app/BootLoading';
import { MainDataShell } from './components/app/MainDataShell';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { AuthStackNavigator } from './navigation/AuthNavigator';
import { RootStack } from './navigation/navigators';
import { UI_COLORS } from './constants/ui-theme';
import { getRuntimeLanguage, toLocalizedUiText } from './utils/bilingualText';
// The background sync task MUST be imported at module scope so TaskManager
// can register it before the app UI renders. Moving this import inside a
// function or component will cause the task definition to be missed.
import './services/sync/backgroundSync';

// ── Global font defaults ───────────────────────────────────────────────────

Text.defaultProps = Object.assign(Text.defaultProps || {}, {
  style: { fontFamily: 'AnekBangla_400Regular', includeFontPadding: false },
});
TextInput.defaultProps = Object.assign(TextInput.defaultProps || {}, {
  style: { fontFamily: 'AnekBangla_500Medium', includeFontPadding: false, textAlignVertical: 'center' },
});

// ── Bilingual render patches ───────────────────────────────────────────────

const translateTextChildren = (children) => {
  const language = getRuntimeLanguage();
  if (typeof children === 'string') return toLocalizedUiText(children, language);
  if (Array.isArray(children)) return children.map((child) => translateTextChildren(child));
  if (isValidElement(children) && children.props?.children !== undefined) {
    return cloneElement(children, { children: translateTextChildren(children.props.children) });
  }
  return children;
};

if (!Text.__hisabPatchedRender) {
  Text.__hisabPatchedRender = true;
  const nativeTextRender = Text.render;
  Text.render = function patchedTextRender(...args) {
    const origin = nativeTextRender.call(this, ...args);
    if (!origin?.props) return origin;
    return cloneElement(origin, {
      style: [{ fontFamily: 'AnekBangla_400Regular', includeFontPadding: false }, origin.props.style],
      children: translateTextChildren(origin.props.children),
    });
  };
}

if (!TextInput.__hisabPatchedRender && typeof TextInput.render === 'function') {
  TextInput.__hisabPatchedRender = true;
  const nativeTextInputRender = TextInput.render;
  TextInput.render = function patchedTextInputRender(...args) {
    const origin = nativeTextInputRender.call(this, ...args);
    if (!origin?.props) return origin;
    return cloneElement(origin, {
      placeholder:
        typeof origin.props.placeholder === 'string'
          ? toLocalizedUiText(origin.props.placeholder, getRuntimeLanguage())
          : origin.props.placeholder,
      style: [{ fontFamily: 'AnekBangla_500Medium', includeFontPadding: false }, origin.props.style],
    });
  };
}

if (!Alert.__hisabPatchedAlert) {
  Alert.__hisabPatchedAlert = true;
  const nativeAlert = Alert.alert;
  Alert.alert = (title, message, buttons, options, type) => {
    const language = getRuntimeLanguage();
    const localizedTitle = typeof title === 'string' ? toLocalizedUiText(title, language) : title;
    const localizedMessage = typeof message === 'string' ? toLocalizedUiText(message, language) : message;
    const localizedButtons = Array.isArray(buttons)
      ? buttons.map((button) => ({
          ...button,
          text: typeof button?.text === 'string' ? toLocalizedUiText(button.text, language) : button?.text,
        }))
      : buttons;
    return nativeAlert(localizedTitle, localizedMessage, localizedButtons, options, type);
  };
}

// ── Navigation theme ───────────────────────────────────────────────────────

const AppTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: UI_COLORS.background,
    card: UI_COLORS.surface,
    text: UI_COLORS.textPrimary,
    border: UI_COLORS.border,
    primary: UI_COLORS.primary,
  },
};

// ── Root navigator ─────────────────────────────────────────────────────────

function RootNavigator() {
  const { authBooting, isAuthenticated } = useAuth();
  if (authBooting) return <BootLoading compact />;
  return (
    <NavigationContainer theme={AppTheme}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <RootStack.Screen name="MainStack" component={MainDataShell} />
        ) : (
          <RootStack.Screen name="AuthStack" component={AuthStackNavigator} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

// ── App root ───────────────────────────────────────────────────────────────

export default function App() {
  const [fontsLoaded] = useFonts({
    AnekBangla_400Regular,
    AnekBangla_500Medium,
    AnekBangla_600SemiBold,
    AnekBangla_700Bold,
    AnekBangla_800ExtraBold,
  });

  if (!fontsLoaded) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#1A56DB" />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}

registerRootComponent(App);
