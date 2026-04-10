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

export default function LoginScreen({ navigation }) {
  const { login, authDeviceProfile } = useAuth();

  const [pin, setPin] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleLogin = async () => {
    const normalizedEmail = String(authDeviceProfile?.preferredEmail || '').trim();
    const normalizedPin = String(pin || '').trim();

    if (!normalizedEmail) {
      setMessage('Account email is hidden and unavailable on this device. Please sign up first.');
      return;
    }

    if (!normalizedPin) {
      setMessage('PIN is required.');
      return;
    }

    if (!/^\d{4,6}$/.test(normalizedPin)) {
      setMessage('PIN must be 4 to 6 digits.');
      return;
    }

    try {
      setMessage('');
      setLoading(true);
      await login(normalizedEmail, normalizedPin, { rememberMe });
    } catch (error) {
      if (String(error?.code || '').toUpperCase() === 'EMAIL_NOT_VERIFIED') {
        navigation.navigate('VerifyEmail', {
          email: normalizedEmail,
          rememberMe,
          verificationCode: error?.details?.verificationCode || null,
          verificationCodeExpiresAt: error?.details?.verificationCodeExpiresAt || null,
          emailDelivery: error?.details?.emailDelivery || null,
        });
        return;
      }

      setMessage(error?.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScene
      eyebrow="Hisab Access"
      title="Login"
      subtitle="Enter your PIN to log in"
    >
      {message ? (
        <View style={AUTH_FORM_STYLES.noticeStrip}>
          <Text style={AUTH_FORM_STYLES.noticeText}>{message}</Text>
        </View>
      ) : null}

      <TextInput
        value={pin}
        onChangeText={setPin}
        placeholder="PIN"
        keyboardType="number-pad"
        maxLength={6}
        secureTextEntry
        placeholderTextColor="#607D94"
        style={AUTH_FORM_STYLES.input}
      />

      <TouchableOpacity style={AUTH_FORM_STYLES.checkboxRow} onPress={() => setRememberMe((prev) => !prev)}>
        <View style={[AUTH_FORM_STYLES.checkbox, rememberMe && AUTH_FORM_STYLES.checkboxActive]}>
          {rememberMe ? <Text style={AUTH_FORM_STYLES.checkboxTick}>✓</Text> : null}
        </View>
        <Text style={AUTH_FORM_STYLES.checkboxText}>Remember me</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[AUTH_FORM_STYLES.primaryButton, loading && AUTH_FORM_STYLES.primaryButtonDisabled]}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={AUTH_FORM_STYLES.primaryButtonText}>Log In</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={AUTH_FORM_STYLES.linkButton} onPress={() => navigation.navigate('AccountRecovery')}>
        <Text style={AUTH_FORM_STYLES.linkText}>Forgot Password ?</Text>
      </TouchableOpacity>

      <TouchableOpacity style={AUTH_FORM_STYLES.linkButton} onPress={() => navigation.navigate('Signup')}>
        <Text style={AUTH_FORM_STYLES.linkText}>Don’t have an account? Sign Up</Text>
      </TouchableOpacity>
    </AuthScene>
  );
}
