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

const formatRetryDuration = (totalSeconds) => {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  if (seconds <= 0) {
    return '১ মিনিটেরও কম';
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.ceil((seconds % 3600) / 60);

  if (hours > 0 && minutes > 0) {
    return `${hours} ঘণ্টা ${minutes} মিনিট`;
  }

  if (hours > 0) {
    return `${hours} ঘণ্টা`;
  }

  return `${minutes} মিনিট`;
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
      setMessage('ইমেইল নিবন্ধিত নয়।');
      return;
    }

    if (!normalizedPin) {
      setMessage('PIN দিন।');
      return;
    }

    if (!/^\d{4,6}$/.test(normalizedPin)) {
      setMessage('PIN ৪ থেকে ৬ সংখ্যার হতে হবে।');
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
          emailDelivery: error?.details?.emailDelivery || null,
        });
        return;
      }

      if (String(error?.code || '').toUpperCase() === 'EMAIL_NOT_REGISTERED') {
        setMessage('ইমেইল নিবন্ধিত নয়।');
      } else if (String(error?.code || '').toUpperCase() === 'PIN_LOCKED') {
        const retrySeconds = resolveRetrySeconds(error);
        if (retrySeconds > 0) {
          setMessage(`PIN লগইন সাময়িকভাবে বন্ধ। ${formatRetryDuration(retrySeconds)} পর আবার চেষ্টা করুন।`);
        } else {
          setMessage(error?.message || 'PIN লগইন সাময়িকভাবে বন্ধ। পরে চেষ্টা করুন।');
        }
      } else {
        setMessage(error?.message || 'প্রবেশ ব্যর্থ হয়েছে।');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScene
      eyebrow="হিসাব"
      title="প্রবেশ করুন"
      subtitle="আপনার PIN দিয়ে প্রবেশ করুন"
    >
      {message ? (
        <View style={AUTH_FORM_STYLES.noticeStrip}>
          <Text style={AUTH_FORM_STYLES.noticeText}>{message}</Text>
        </View>
      ) : null}

      <TextInput
        value={pin}
        onChangeText={setPin}
        placeholder="আপনার PIN"
        keyboardType="number-pad"
        maxLength={6}
        secureTextEntry
        style={AUTH_FORM_STYLES.input}
      />

      <TouchableOpacity style={AUTH_FORM_STYLES.checkboxRow} onPress={() => setRememberMe((prev) => !prev)}>
        <View style={[AUTH_FORM_STYLES.checkbox, rememberMe && AUTH_FORM_STYLES.checkboxActive]}>
          {rememberMe ? <Text style={AUTH_FORM_STYLES.checkboxTick}>✓</Text> : null}
        </View>
        <Text style={AUTH_FORM_STYLES.checkboxText}>এই ডিভাইসে মনে রাখুন</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[AUTH_FORM_STYLES.primaryButton, loading && AUTH_FORM_STYLES.primaryButtonDisabled]}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? <ActivityIndicator size="small" color={UI_COLORS.onAccent} /> : <Text style={AUTH_FORM_STYLES.primaryButtonText}>প্রবেশ করুন</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={AUTH_FORM_STYLES.linkButton} onPress={() => navigation.navigate('AccountRecovery')}>
        <Text style={AUTH_FORM_STYLES.linkText}>পাসওয়ার্ড ভুলে গেছেন?</Text>
      </TouchableOpacity>

      <TouchableOpacity style={AUTH_FORM_STYLES.linkButton} onPress={() => navigation.navigate('Signup')}>
        <Text style={AUTH_FORM_STYLES.linkText}>নতুন অ্যাকাউন্ট খুলুন</Text>
      </TouchableOpacity>
    </AuthScene>
  );
}
