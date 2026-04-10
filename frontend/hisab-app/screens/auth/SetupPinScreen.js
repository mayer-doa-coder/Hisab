import { useState } from 'react';
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

export default function SetupPinScreen({ navigation }) {
  const { setupPin } = useAuth();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [trustDevice, setTrustDevice] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSetupPin = async () => {
    const normalizedPin = String(pin || '').trim();
    const normalizedConfirm = String(confirmPin || '').trim();

    if (!/^\d{4,6}$/.test(normalizedPin)) {
      setMessage('PIN must be 4 to 6 digits.');
      return;
    }

    if (normalizedPin !== normalizedConfirm) {
      setMessage('PINs do not match.');
      return;
    }

    try {
      setMessage('');
      setLoading(true);
      await setupPin({
        pin: normalizedPin,
        trustDevice,
      });
      setMessage('PIN saved.');
      navigation.goBack();
    } catch (error) {
      setMessage(error?.message || 'PIN setup failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.container}>
          <Text style={styles.title}>Setup Quick PIN</Text>
          <Text style={styles.subtitle}>Use PIN for faster login.</Text>

          <TextInput
            value={pin}
            onChangeText={setPin}
            placeholder="New PIN"
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

          <TextInput
            value={confirmPin}
            onChangeText={setConfirmPin}
            placeholder="Confirm PIN"
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            style={styles.input}
          />

          <TouchableOpacity style={styles.rememberRow} onPress={() => setTrustDevice((prev) => !prev)}>
            <View style={[styles.checkbox, trustDevice && styles.checkboxActive]}>
              {trustDevice ? <Text style={styles.checkboxTick}>✓</Text> : null}
            </View>
            <Text style={styles.rememberText}>Allow PIN only on this trusted device</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.primaryButton, loading && styles.buttonDisabled]} onPress={handleSetupPin} disabled={loading}>
            {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryButtonText}>Save PIN</Text>}
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
    fontSize: 14,
    color: UI_COLORS.textSecondary,
    marginBottom: 6,
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
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
});
