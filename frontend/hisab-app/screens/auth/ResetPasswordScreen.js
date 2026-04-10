import { useState } from 'react';
import {
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import AuthScene, { AUTH_FORM_STYLES } from '../../components/auth/AuthScene';
import { useAuth } from '../../context/AuthContext';

export default function ResetPasswordScreen({ navigation, route }) {
  const { resetPin } = useAuth();

  const [resetToken, setResetToken] = useState(String(route?.params?.resetToken || '').trim());
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState('');

  const handleResetPin = async () => {
    if (resetting) {
      return;
    }

    const normalizedToken = String(resetToken || '').trim();
    const normalizedPin = String(newPin || '').trim();
    const normalizedConfirm = String(confirmPin || '').trim();

    if (!normalizedToken || !normalizedPin || !normalizedConfirm) {
      setMessage('Token and PIN fields are required.');
      return;
    }

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
      setResetting(true);
      await resetPin({
        resetToken: normalizedToken,
        newPin: normalizedPin,
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
      title="Reset PIN"
      subtitle="Enter your token and choose a new PIN"
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
        <View style={AUTH_FORM_STYLES.noticeStrip}>
          <Text style={AUTH_FORM_STYLES.noticeText}>{message}</Text>
        </View>
      ) : null}

      <TextInput
        value={newPin}
        onChangeText={setNewPin}
        placeholder="New PIN"
        keyboardType="number-pad"
        maxLength={6}
        secureTextEntry
        placeholderTextColor="#607D94"
        style={AUTH_FORM_STYLES.input}
      />

      <TextInput
        value={confirmPin}
        onChangeText={setConfirmPin}
        placeholder="Confirm new PIN"
        keyboardType="number-pad"
        maxLength={6}
        secureTextEntry
        placeholderTextColor="#607D94"
        style={AUTH_FORM_STYLES.input}
      />

      <TouchableOpacity
        style={[AUTH_FORM_STYLES.primaryButton, resetting && AUTH_FORM_STYLES.primaryButtonDisabled]}
        onPress={handleResetPin}
        disabled={resetting}
      >
        {resetting ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={AUTH_FORM_STYLES.primaryButtonText}>Reset PIN</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={AUTH_FORM_STYLES.linkButton} onPress={() => navigation.navigate('Login')}>
        <Text style={AUTH_FORM_STYLES.linkText}>Back to login</Text>
      </TouchableOpacity>
    </AuthScene>
  );
}
