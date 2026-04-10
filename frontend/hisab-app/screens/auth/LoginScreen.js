import { useEffect, useState } from 'react';
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

export default function LoginScreen({ navigation }) {
  const { login, authDeviceProfile } = useAuth();

  const [email, setEmail] = useState(String(authDeviceProfile?.preferredEmail || '').trim());
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setEmail(String(authDeviceProfile?.preferredEmail || '').trim());
  }, [authDeviceProfile?.preferredEmail]);

  const handleLogin = async () => {
    const normalizedEmail = String(email || '').trim();
    const normalizedPassword = String(password || '').trim();

    if (!normalizedEmail || !normalizedPassword) {
      setMessage('Email and password are required.');
      return;
    }

    try {
      setMessage('');
      setLoading(true);
      await login(normalizedEmail, normalizedPassword, { rememberMe });
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
      title="Welcome Back"
      subtitle="Sign in to continue."
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

      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
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
        {loading ? <ActivityIndicator size="small" color="#FFF8EE" /> : <Text style={AUTH_FORM_STYLES.primaryButtonText}>Login</Text>}
      </TouchableOpacity>

      {authDeviceProfile?.pinEnabled ? (
        <TouchableOpacity style={[AUTH_FORM_STYLES.secondaryButton, styles.pinButton]} onPress={() => navigation.navigate('PinLogin')}>
          <Text style={AUTH_FORM_STYLES.secondaryButtonText}>Quick PIN Login</Text>
          <Text style={styles.pinButtonHint}>Trusted device shortcut</Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity style={AUTH_FORM_STYLES.linkButton} onPress={() => navigation.navigate('AccountRecovery')}>
        <Text style={AUTH_FORM_STYLES.linkText}>Forgot password? Recover account</Text>
      </TouchableOpacity>

      <TouchableOpacity style={AUTH_FORM_STYLES.linkButton} onPress={() => navigation.navigate('Signup')}>
        <Text style={AUTH_FORM_STYLES.linkText}>No account? Create one</Text>
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
  pinButton: {
    marginTop: 6,
  },
  pinButtonHint: {
    marginTop: 1,
    color: '#486581',
    fontSize: 12,
    fontWeight: '700',
  },
});
