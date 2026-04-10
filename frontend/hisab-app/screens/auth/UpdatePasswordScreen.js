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
import { evaluatePasswordPolicy } from '../../utils/passwordPolicy';

const MIN_PASSWORD_LENGTH = 8;

export default function UpdatePasswordScreen() {
  const { updatePassword } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleUpdatePassword = async () => {
    const normalizedCurrent = String(currentPassword || '').trim();
    const normalizedNew = String(newPassword || '').trim();
    const normalizedConfirm = String(confirmPassword || '').trim();

    if (!normalizedCurrent || !normalizedNew || !normalizedConfirm) {
      setMessage('All password fields are required.');
      return;
    }

    const passwordPolicy = evaluatePasswordPolicy(normalizedNew, MIN_PASSWORD_LENGTH);
    if (!passwordPolicy.ok) {
      setMessage(passwordPolicy.message);
      return;
    }

    if (normalizedNew !== normalizedConfirm) {
      setMessage('Passwords do not match.');
      return;
    }

    try {
      setMessage('');
      setLoading(true);
      await updatePassword({
        currentPassword: normalizedCurrent,
        newPassword: normalizedNew,
      });
      setMessage('Password updated. Please sign in again.');
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
          <Text style={styles.title}>Update Password</Text>
          <Text style={styles.subtitle}>Change password</Text>

          <TextInput
            value={currentPassword}
            onChangeText={setCurrentPassword}
            placeholder="Current password"
            secureTextEntry
            style={styles.input}
          />

          {message ? (
            <View style={styles.inlineNotice}>
              <Text style={styles.inlineNoticeText}>{message}</Text>
            </View>
          ) : null}

          <TextInput
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="New password"
            secureTextEntry
            style={styles.input}
          />

          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Confirm new password"
            secureTextEntry
            style={styles.input}
          />

          <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleUpdatePassword} disabled={loading}>
            {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.buttonText}>Update Password</Text>}
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
