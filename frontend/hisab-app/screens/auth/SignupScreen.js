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

export default function SignupScreen({ navigation }) {
  const { signup } = useAuth();
  const { t } = useLanguage();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSignup = async () => {
    if (loading) return;

    const normalizedEmail = String(email || '').trim();
    const normalizedUsername = String(username || '').trim();
    const normalizedPin = String(pin || '').trim();
    const normalizedConfirm = String(confirmPin || '').trim();

    if (!normalizedUsername || !normalizedEmail || !normalizedPin || !normalizedConfirm) { setMessage(t('auth.error.fillAll')); return; }
    if (!/^\d{4,6}$/.test(normalizedPin)) { setMessage(t('auth.error.pinFormat')); return; }
    if (normalizedPin !== normalizedConfirm) { setMessage(t('auth.error.pinMismatch')); return; }

    try {
      setMessage('');
      setLoading(true);
      const result = await signup(normalizedEmail, normalizedPin, { rememberMe, username: normalizedUsername });

      if (result?.verificationRequired) {
        const delivery = result?.emailDelivery || null;
        if (delivery && delivery.delivered === false && !delivery.transportConfigured) {
          setMessage(t('signup.error.emailServiceDown'));
        }

        navigation.navigate('VerifyEmail', {
          email: result.email || normalizedEmail,
          rememberMe,
          emailDelivery: delivery,
        });
      }
    } catch (error) {
      setMessage(error?.message || t('signup.error.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScene
      eyebrow={t('signup.eyebrow')}
      title={t('signup.title')}
      subtitle={t('signup.subtitle')}
    >
      <TextInput
        value={username}
        onChangeText={setUsername}
        placeholder={t('auth.username')}
        placeholderTextColor={UI_COLORS.textSecondary}
        autoCapitalize="words"
        style={AUTH_FORM_STYLES.input}
      />

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
        placeholder={t('auth.pin.set')}
        placeholderTextColor={UI_COLORS.textSecondary}
        keyboardType="number-pad"
        maxLength={6}
        secureTextEntry
        style={AUTH_FORM_STYLES.input}
      />

      <TextInput
        value={confirmPin}
        onChangeText={setConfirmPin}
        placeholder={t('auth.pin.confirm')}
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
        onPress={handleSignup}
        disabled={loading}
      >
        {loading ? <ActivityIndicator size="small" color={UI_COLORS.onAccent} /> : <Text style={AUTH_FORM_STYLES.primaryButtonText}>{t('signup.submit')}</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={AUTH_FORM_STYLES.linkButton} onPress={() => navigation.goBack()}>
        <Text style={AUTH_FORM_STYLES.linkText}>{t('signup.alreadyHaveAccount')}</Text>
      </TouchableOpacity>
    </AuthScene>
  );
}
