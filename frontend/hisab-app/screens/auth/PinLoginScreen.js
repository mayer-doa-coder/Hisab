import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UI_COLORS } from '../../constants/ui-theme';
import { useAuth } from '../../context/AuthContext';

const mapPinError = (error) => {
  const code = String(error?.code || '').trim().toUpperCase();

  if (code === 'INVALID_PIN') {
    return 'Wrong PIN. Please try again.';
  }

  if (code === 'PIN_LOCKED') {
    return 'Too many wrong attempts. PIN login is locked for a while.';
  }

  if (code === 'PIN_DEVICE_NOT_TRUSTED') {
    return 'PIN login works only on your trusted device.';
  }

  if (code === 'PIN_NOT_CONFIGURED') {
    return 'PIN is not set yet for this account.';
  }

  if (code === 'EMAIL_NOT_VERIFIED') {
    return 'Email is not verified. Verify email first, then use PIN.';
  }

  return error?.message || 'Unable to login with PIN.';
};

export default function PinLoginScreen({ navigation }) {
  const { authDeviceProfile, loginWithPin } = useAuth();
  const [email, setEmail] = useState(String(authDeviceProfile?.preferredEmail || '').trim());
  const [pin, setPin] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setEmail(String(authDeviceProfile?.preferredEmail || '').trim());
  }, [authDeviceProfile?.preferredEmail]);

  const handlePinLogin = async () => {
    const normalizedPin = String(pin || '').trim();

    if (!/^\d{4,6}$/.test(normalizedPin)) {
      setMessage('PIN must be 4 to 6 digits.');
      return;
    }

    try {
      setMessage('');
      setSubmitting(true);
      await loginWithPin({
        pin: normalizedPin,
        email,
        rememberMe,
      });
    } catch (error) {
      setMessage(mapPinError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.container}>
          <Text style={styles.title}>Quick PIN Login</Text>
          <Text style={styles.subtitle}>Use PIN for faster sign in.</Text>

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
          />

          <TextInput
            value={pin}
            onChangeText={setPin}
            placeholder="PIN"
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            style={styles.input}
          />

          {message ? (
            <View style={styles.inlineNotice}>
              <Text style={styles.inlineNoticeText}>{message}</Text>
            </View>
          ) : null}

          <TouchableOpacity style={styles.rememberRow} onPress={() => setRememberMe((prev) => !prev)}>
            <View style={[styles.checkbox, rememberMe && styles.checkboxActive]}>
              {rememberMe ? <Text style={styles.checkboxTick}>✓</Text> : null}
            </View>
            <Text style={styles.rememberText}>Remember me</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryButton, submitting && styles.buttonDisabled]}
            onPress={handlePinLogin}
            disabled={submitting}
          >
            {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryButtonText}>Login with PIN</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.secondaryButtonText}>Use Main Login</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: UI_COLORS.background,
  },
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    gap: 12,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: UI_COLORS.textPrimary,
  },
  subtitle: {
    marginBottom: 6,
    fontSize: 14,
    color: UI_COLORS.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    backgroundColor: UI_COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: UI_COLORS.textPrimary,
    fontSize: 16,
  },
  inlineNotice: {
    borderLeftWidth: 3,
    borderColor: '#B91C1C',
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  inlineNoticeText: {
    color: '#7F1D1D',
    fontSize: 12,
    fontWeight: '700',
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    borderColor: UI_COLORS.primary,
    backgroundColor: '#DBEAFE',
  },
  checkboxTick: {
    color: UI_COLORS.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  rememberText: {
    color: UI_COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: 12,
    backgroundColor: UI_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  secondaryButton: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: UI_COLORS.primary,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    color: UI_COLORS.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
});
