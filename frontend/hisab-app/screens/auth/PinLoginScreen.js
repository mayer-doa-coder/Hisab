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
import { useLanguage } from '../../context/LanguageContext';

const resolveRetrySeconds = (error) => {
  const directSeconds = Number(error?.details?.retryAfterSeconds || 0);
  if (Number.isFinite(directSeconds) && directSeconds > 0) return directSeconds;

  const lockUntilRaw = error?.details?.lockUntil;
  const lockUntilMs = lockUntilRaw ? new Date(lockUntilRaw).getTime() : 0;
  if (!Number.isFinite(lockUntilMs) || lockUntilMs <= 0) return 0;

  return Math.max(0, Math.ceil((lockUntilMs - Date.now()) / 1000));
};

const formatRetryDuration = (totalSeconds, t) => {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  if (seconds <= 0) return t('duration.lessThanMinute');
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.ceil((seconds % 3600) / 60);
  if (hours > 0 && minutes > 0) return t('duration.hours', { h: hours, m: minutes });
  if (hours > 0) return t('duration.hoursOnly', { h: hours });
  return t('duration.minutesOnly', { m: minutes });
};

export default function PinLoginScreen({ navigation }) {
  const { loginWithPin, authDeviceProfile } = useAuth();
  const { t } = useLanguage();

  const [email, setEmail] = useState(String(authDeviceProfile?.preferredEmail || '').trim());
  const [pin, setPin] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleLogin = async () => {
    if (loading) return;

    const normalizedEmail = String(email || '').trim();
    const normalizedPin = String(pin || '').trim();

    if (!normalizedEmail) { setMessage(t('auth.error.emailRequired')); return; }
    if (!normalizedPin) { setMessage(t('auth.error.pinRequired')); return; }
    if (!/^\d{4,6}$/.test(normalizedPin)) { setMessage(t('auth.error.pinFormat')); return; }

    try {
      setMessage('');
      setLoading(true);
      await loginWithPin({ email: normalizedEmail, pin: normalizedPin, rememberMe });
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
        setMessage(t('auth.error.emailNotRegistered'));
      } else if (String(error?.code || '').toUpperCase() === 'PIN_LOCKED') {
        const retrySeconds = resolveRetrySeconds(error);
        if (retrySeconds > 0) {
          setMessage(t('login.pinLocked', { duration: formatRetryDuration(retrySeconds, t) }));
        } else {
          setMessage(error?.message || t('login.pinLockedNoTime'));
        }
      } else {
        setMessage(error?.message || t('auth.error.loginFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScene
      eyebrow={t('pinLogin.eyebrow')}
      title={t('pinLogin.title')}
      subtitle={t('pinLogin.subtitle')}
    >
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder={t('auth.email')}
        placeholderTextColor={UI_COLORS.textSecondary}
        autoCapitalize="none"
        keyboardType="email-address"
        style={AUTH_FORM_STYLES.input}
      />

      {message ? (
        <View style={AUTH_FORM_STYLES.noticeStrip}>
          <Text style={AUTH_FORM_STYLES.noticeText}>{message}</Text>
        </View>
      ) : null}

      <TextInput
        value={pin}
        onChangeText={setPin}
        placeholder={t('auth.pin.your')}
        placeholderTextColor={UI_COLORS.textSecondary}
        keyboardType="number-pad"
        maxLength={6}
        secureTextEntry
        style={AUTH_FORM_STYLES.input}
      />

      <TouchableOpacity style={AUTH_FORM_STYLES.checkboxRow} onPress={() => setRememberMe((prev) => !prev)}>
        <View style={[AUTH_FORM_STYLES.checkbox, rememberMe && AUTH_FORM_STYLES.checkboxActive]}>
          {rememberMe ? <Text style={AUTH_FORM_STYLES.checkboxTick}>✓</Text> : null}
        </View>
        <Text style={AUTH_FORM_STYLES.checkboxText}>{t('auth.rememberDevice')}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[AUTH_FORM_STYLES.primaryButton, loading && AUTH_FORM_STYLES.primaryButtonDisabled]}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? <ActivityIndicator size="small" color={UI_COLORS.onAccent} /> : <Text style={AUTH_FORM_STYLES.primaryButtonText}>{t('pinLogin.submit')}</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={AUTH_FORM_STYLES.linkButton} onPress={() => navigation.navigate('AccountRecovery')}>
        <Text style={AUTH_FORM_STYLES.linkText}>{t('auth.forgotPassword')}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={AUTH_FORM_STYLES.linkButton} onPress={() => navigation.navigate('Signup')}>
        <Text style={AUTH_FORM_STYLES.linkText}>{t('login.createAccount')}</Text>
      </TouchableOpacity>
    </AuthScene>
  );
}
