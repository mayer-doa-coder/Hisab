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

const formatRetryDuration = (totalSeconds) => {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  if (seconds <= 0) {
    return 'less than 1 min';
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.ceil((seconds % 3600) / 60);

  if (hours > 0 && minutes > 0) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ${minutes} ${minutes === 1 ? 'min' : 'mins'}`;
  }

  if (hours > 0) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }

  return `${minutes} ${minutes === 1 ? 'min' : 'mins'}`;
};

const resolveRetrySeconds = (error) => {
  const directSeconds = Number(error?.details?.retryAfterSeconds || 0);
  if (Number.isFinite(directSeconds) && directSeconds > 0) {
    return directSeconds;
  }

  const lockUntilRaw = error?.details?.lockUntil;
  const lockUntilMs = lockUntilRaw ? new Date(lockUntilRaw).getTime() : 0;
  if (!Number.isFinite(lockUntilMs) || lockUntilMs <= 0) {
    return 0;
  }

  return Math.max(0, Math.ceil((lockUntilMs - Date.now()) / 1000));
};

export default function LoginScreen({ navigation }) {
  const { login, authDeviceProfile } = useAuth();

  const [pin, setPin] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleLogin = async () => {
    if (loading) {
      return;
    }

    const normalizedEmail = String(authDeviceProfile?.preferredEmail || '').trim();
    const normalizedPin = String(pin || '').trim();

    if (!normalizedEmail) {
      setMessage('Email is not registered.');
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

      if (String(error?.code || '').toUpperCase() === 'EMAIL_NOT_REGISTERED') {
        setMessage('Email is not registered.');
      } else if (String(error?.code || '').toUpperCase() === 'PIN_LOCKED') {
        const retrySeconds = resolveRetrySeconds(error);
        if (retrySeconds > 0) {
          setMessage(`PIN login is temporarily blocked. Try again in ${formatRetryDuration(retrySeconds)}.`);
        } else {
          setMessage(error?.message || 'PIN login is temporarily blocked. Try again later.');
        }
      } else {
        setMessage(error?.message || 'Login failed.');
      }
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
