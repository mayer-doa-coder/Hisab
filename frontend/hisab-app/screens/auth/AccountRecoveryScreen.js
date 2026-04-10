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

export default function AccountRecoveryScreen({ navigation }) {
  const { requestPasswordRecovery } = useAuth();

  const [email, setEmail] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState('');

  const handleRequestRecovery = async () => {
    const normalizedEmail = String(email || '').trim();
    if (!normalizedEmail) {
      setMessage('Email is required.');
      return;
    }

    try {
      setMessage('');
      setRequesting(true);
      const response = await requestPasswordRecovery(normalizedEmail);
      const tokenHint = String(response?.resetToken || '').trim();
      const delivery = response?.emailDelivery || null;

      if (delivery && delivery.delivered === false && !delivery.transportConfigured) {
        setMessage(tokenHint ? `Email service is not configured. Dev token: ${tokenHint}` : 'Email service is not configured.');
      } else {
        setMessage(tokenHint ? `Token generated: ${tokenHint}` : 'Recovery requested.');
      }

      navigation.navigate('ResetPassword', {
        resetToken: tokenHint || '',
      });
    } catch (error) {
      setMessage(error?.message || 'Recovery request failed.');
    } finally {
      setRequesting(false);
    }
  };

  return (
    <AuthScene
      eyebrow="Hisab Recovery"
      title="Recover Account"
      subtitle="Request token, then reset password."
    >
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        placeholderTextColor="#607D94"
        style={AUTH_FORM_STYLES.input}
      />

      {message ? (
        <View style={styles.inlineNotice}>
          <Text style={styles.inlineNoticeText}>{message}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[AUTH_FORM_STYLES.primaryButton, requesting && AUTH_FORM_STYLES.primaryButtonDisabled]}
        onPress={handleRequestRecovery}
        disabled={requesting}
      >
        {requesting ? <ActivityIndicator size="small" color="#FFF8EE" /> : <Text style={AUTH_FORM_STYLES.primaryButtonText}>Request Recovery Token</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={AUTH_FORM_STYLES.secondaryButton} onPress={() => navigation.navigate('ResetPassword')}>
        <Text style={AUTH_FORM_STYLES.secondaryButtonText}>Already have token? Go to Step 2</Text>
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
