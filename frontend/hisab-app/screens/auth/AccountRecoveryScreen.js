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

export default function AccountRecoveryScreen({ navigation }) {
  const { requestPinRecovery } = useAuth();

  const [email, setEmail] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState('');

  const handleRequestRecovery = async () => {
    if (requesting) {
      return;
    }

    const normalizedEmail = String(email || '').trim();
    if (!normalizedEmail) {
      setMessage('Email is required.');
      return;
    }

    try {
      setMessage('');
      setRequesting(true);
      await requestPinRecovery(normalizedEmail);
      navigation.navigate('ResetPassword');
    } catch (error) {
      if (String(error?.code || '').toUpperCase() === 'EMAIL_NOT_REGISTERED') {
        setMessage('Email is not registered.');
      } else {
        setMessage(error?.message || 'Recovery request failed.');
      }
    } finally {
      setRequesting(false);
    }
  };

  return (
    <AuthScene
      eyebrow="Hisab Recovery"
      title="Recover Account"
      subtitle="Request a recovery token to reset your PIN"
    >
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        style={AUTH_FORM_STYLES.input}
      />

      {message ? (
        <View style={AUTH_FORM_STYLES.noticeStrip}>
          <Text style={AUTH_FORM_STYLES.noticeText}>{message}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[AUTH_FORM_STYLES.primaryButton, requesting && AUTH_FORM_STYLES.primaryButtonDisabled]}
        onPress={handleRequestRecovery}
        disabled={requesting}
      >
        {requesting ? <ActivityIndicator size="small" color={UI_COLORS.onAccent} /> : <Text style={AUTH_FORM_STYLES.primaryButtonText}>Request PIN Recovery Token</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={AUTH_FORM_STYLES.linkButton} onPress={() => navigation.navigate('Login')}>
        <Text style={AUTH_FORM_STYLES.linkText}>Back to login</Text>
      </TouchableOpacity>
    </AuthScene>
  );
}
