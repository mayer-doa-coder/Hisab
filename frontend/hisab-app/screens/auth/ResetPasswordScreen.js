import { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import AuthScene, { AUTH_FORM_STYLES } from '../../components/auth/AuthScene';
import { useAuth } from '../../context/AuthContext';
import { evaluatePasswordPolicy } from '../../utils/passwordPolicy';

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordScreen({ navigation, route }) {
  const { resetPassword } = useAuth();

  const [resetToken, setResetToken] = useState(String(route?.params?.resetToken || '').trim());
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState('');

  const handleResetPassword = async () => {
    const normalizedToken = String(resetToken || '').trim();
    const normalizedPassword = String(newPassword || '').trim();
    const normalizedConfirm = String(confirmPassword || '').trim();

    if (!normalizedToken || !normalizedPassword || !normalizedConfirm) {
      setMessage('Token and password fields are required.');
      return;
    }

    const passwordPolicy = evaluatePasswordPolicy(normalizedPassword, MIN_PASSWORD_LENGTH);
    if (!passwordPolicy.ok) {
      setMessage(passwordPolicy.message);
      return;
    }

    if (normalizedPassword !== normalizedConfirm) {
      setMessage('Passwords do not match.');
      return;
    }

    try {
      setMessage('');
      setResetting(true);
      await resetPassword({
        resetToken: normalizedToken,
        newPassword: normalizedPassword,
      });

      navigation.navigate('Login');
    } catch (error) {
      setMessage(error?.message || 'Reset failed.');
    } finally {
      setResetting(false);
    }
  };

  return (
    <AuthScene
      eyebrow="Hisab Reset"
      title="Set New Password"
      subtitle="Enter token and new password."
    >
      <TextInput
        value={resetToken}
        onChangeText={setResetToken}
        placeholder="Reset token"
        autoCapitalize="none"
        placeholderTextColor="#607D94"
        style={AUTH_FORM_STYLES.input}
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
        placeholderTextColor="#607D94"
        style={AUTH_FORM_STYLES.input}
      />

      <TextInput
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder="Confirm new password"
        secureTextEntry
        placeholderTextColor="#607D94"
        style={AUTH_FORM_STYLES.input}
      />

      <TouchableOpacity
        style={[AUTH_FORM_STYLES.primaryButton, resetting && AUTH_FORM_STYLES.primaryButtonDisabled]}
        onPress={handleResetPassword}
        disabled={resetting}
      >
        {resetting ? <ActivityIndicator size="small" color="#FFF8EE" /> : <Text style={AUTH_FORM_STYLES.primaryButtonText}>Reset Password</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={AUTH_FORM_STYLES.linkButton} onPress={() => navigation.navigate('Login')}>
        <Text style={AUTH_FORM_STYLES.linkText}>Back to login</Text>
      </TouchableOpacity>
    </AuthScene>
  );
}

const styles = StyleSheet.create({
  inlineNotice: {
    marginTop: 4,
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
});
