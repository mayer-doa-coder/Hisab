import { useState } from 'react';
import {
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import AuthScene, { AUTH_FORM_STYLES } from '../../components/auth/AuthScene';
import { UI_COLORS } from '../../constants/ui-theme';
import { useAuth } from '../../context/AuthContext';

export default function ResetPasswordScreen({ navigation }) {
  const { resetPin } = useAuth();

  const [resetToken, setResetToken] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleResetPin = async () => {
    if (loading) {
      return;
    }

    const normalizedToken = String(resetToken || '').trim();
    const normalizedNewPin = String(newPin || '').trim();
    const normalizedConfirmPin = String(confirmPin || '').trim();

    if (!normalizedToken || !normalizedNewPin || !normalizedConfirmPin) {
      setMessage('Reset token and PIN fields are required.');
      return;
    }

    if (!/^\d{4,6}$/.test(normalizedNewPin)) {
      setMessage('PIN must be 4 to 6 digits.');
      return;
    }

    if (normalizedNewPin !== normalizedConfirmPin) {
      setMessage('PINs do not match.');
      return;
    }

    try {
      setMessage('');
      setLoading(true);
      await resetPin({
        resetToken: normalizedToken,
        newPin: normalizedNewPin,
      });
      setMessage('PIN reset successful. Please login with your new PIN.');
      navigation.navigate('Login');
    } catch (error) {
      setMessage(error?.message || 'PIN reset failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScene
      eyebrow="Hisab Recovery"
      title="Reset PIN"
      subtitle="Use your recovery token to set a new PIN"
    >
      <TextInput
        value={resetToken}
        onChangeText={setResetToken}
        placeholder="Recovery token"
        autoCapitalize="none"
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
        style={AUTH_FORM_STYLES.input}
      />

      <TextInput
        value={confirmPin}
        onChangeText={setConfirmPin}
        placeholder="Confirm new PIN"
        keyboardType="number-pad"
        maxLength={6}
        secureTextEntry
        style={AUTH_FORM_STYLES.input}
      />

      <TouchableOpacity
        style={[AUTH_FORM_STYLES.primaryButton, loading && AUTH_FORM_STYLES.primaryButtonDisabled]}
        onPress={handleResetPin}
        disabled={loading}
      >
        {loading ? <ActivityIndicator size="small" color={UI_COLORS.onAccent} /> : <Text style={AUTH_FORM_STYLES.primaryButtonText}>Reset PIN</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={AUTH_FORM_STYLES.linkButton} onPress={() => navigation.navigate('AccountRecovery')}>
        <Text style={AUTH_FORM_STYLES.linkText}>Need a new recovery token?</Text>
      </TouchableOpacity>

      <TouchableOpacity style={AUTH_FORM_STYLES.linkButton} onPress={() => navigation.navigate('Login')}>
        <Text style={AUTH_FORM_STYLES.linkText}>Back to login</Text>
      </TouchableOpacity>
    </AuthScene>
  );
}

