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

export default function UpdatePasswordScreen() {
  const { updatePin } = useAuth();

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleUpdatePin = async () => {
    if (loading) {
      return;
    }

    const normalizedCurrent = String(currentPin || '').trim();
    const normalizedNew = String(newPin || '').trim();
    const normalizedConfirm = String(confirmPin || '').trim();

    if (!normalizedCurrent || !normalizedNew || !normalizedConfirm) {
      setMessage('All PIN fields are required.');
      return;
    }

    if (!/^\d{4,6}$/.test(normalizedCurrent) || !/^\d{4,6}$/.test(normalizedNew)) {
      setMessage('PIN must be 4 to 6 digits.');
      return;
    }

    if (normalizedNew !== normalizedConfirm) {
      setMessage('PINs do not match.');
      return;
    }

    try {
      setMessage('');
      setLoading(true);
      await updatePin({
        currentPin: normalizedCurrent,
        newPin: normalizedNew,
      });
      setMessage('PIN updated. Please sign in again.');
    } catch (error) {
      setMessage(error?.message || 'Update failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.container}>
          <Text style={styles.title}>Update PIN</Text>
          <Text style={styles.subtitle}>Change PIN</Text>

          <TextInput
            value={currentPin}
            onChangeText={setCurrentPin}
            placeholder="Current PIN"
            keyboardType="number-pad"
            maxLength={6}
            secureTextEntry
            style={styles.input}
          />

          {message ? (
            <View style={styles.inlineNotice}>
              <Text style={styles.inlineNoticeText}>{message}</Text>
            </View>
          ) : null}

          <TextInput
            value={newPin}
            onChangeText={setNewPin}
            placeholder="New PIN"
            keyboardType="number-pad"
            maxLength={6}
            secureTextEntry
            style={styles.input}
          />

          <TextInput
            value={confirmPin}
            onChangeText={setConfirmPin}
            placeholder="Confirm new PIN"
            keyboardType="number-pad"
            maxLength={6}
            secureTextEntry
            style={styles.input}
          />

          <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleUpdatePin} disabled={loading}>
            {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.buttonText}>Update PIN</Text>}
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
    gap: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: UI_COLORS.textPrimary,
  },
  subtitle: {
    marginBottom: 6,
    fontSize: 13,
    color: UI_COLORS.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    backgroundColor: UI_COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: UI_COLORS.textPrimary,
    fontSize: 15,
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
  button: {
    marginTop: 6,
    borderRadius: 10,
    backgroundColor: UI_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    minHeight: 46,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
