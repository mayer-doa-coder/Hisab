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

export default function ResetPasswordScreen({ navigation }) {
  const { resetPin } = useAuth();
  const { t } = useLanguage();

  const [resetToken, setResetToken] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleResetPin = async () => {
    if (loading) return;

    const normalizedToken = String(resetToken || '').trim();
    const normalizedNewPin = String(newPin || '').trim();
    const normalizedConfirmPin = String(confirmPin || '').trim();

    if (!normalizedToken || !normalizedNewPin || !normalizedConfirmPin) { setMessage(t('reset.error.required')); return; }
    if (!/^\d{4,6}$/.test(normalizedNewPin)) { setMessage(t('auth.error.pinFormat')); return; }
    if (normalizedNewPin !== normalizedConfirmPin) { setMessage(t('auth.error.pinMismatch')); return; }

    try {
      setMessage('');
      setLoading(true);
      await resetPin({ resetToken: normalizedToken, newPin: normalizedNewPin });
      setMessage(t('reset.success'));
      navigation.navigate('Login');
    } catch (error) {
      setMessage(error?.message || t('reset.error.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScene
      eyebrow={t('reset.eyebrow')}
      title={t('reset.title')}
      subtitle={t('reset.subtitle')}
    >
      <TextInput
        value={resetToken}
        onChangeText={setResetToken}
        placeholder={t('reset.tokenPlaceholder')}
        placeholderTextColor={UI_COLORS.textSecondary}
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
        placeholder={t('auth.pin.new')}
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

      <TouchableOpacity
        style={[AUTH_FORM_STYLES.primaryButton, loading && AUTH_FORM_STYLES.primaryButtonDisabled]}
        onPress={handleResetPin}
        disabled={loading}
      >
        {loading ? <ActivityIndicator size="small" color={UI_COLORS.onAccent} /> : <Text style={AUTH_FORM_STYLES.primaryButtonText}>{t('reset.submit')}</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={AUTH_FORM_STYLES.linkButton} onPress={() => navigation.navigate('AccountRecovery')}>
        <Text style={AUTH_FORM_STYLES.linkText}>{t('reset.newToken')}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={AUTH_FORM_STYLES.linkButton} onPress={() => navigation.navigate('Login')}>
        <Text style={AUTH_FORM_STYLES.linkText}>{t('auth.backToLogin')}</Text>
      </TouchableOpacity>
    </AuthScene>
  );
}
