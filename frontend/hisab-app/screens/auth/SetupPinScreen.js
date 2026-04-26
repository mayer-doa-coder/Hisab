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

export default function SetupPinScreen({ navigation }) {
  const { setupPin } = useAuth();
  const { t } = useLanguage();

  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [trustDevice, setTrustDevice] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSetupPin = async () => {
    if (loading) return;

    const normalizedPin = String(pin || '').trim();
    const normalizedConfirm = String(confirmPin || '').trim();

    if (!normalizedPin || !normalizedConfirm) { setMessage(t('setupPin.error.required')); return; }
    if (!/^\d{4,6}$/.test(normalizedPin)) { setMessage(t('auth.error.pinFormat')); return; }
    if (normalizedPin !== normalizedConfirm) { setMessage(t('auth.error.pinMismatch')); return; }

    try {
      setMessage('');
      setLoading(true);
      await setupPin({ pin: normalizedPin, trustDevice });
      setMessage(t('setupPin.success'));
      navigation.goBack();
    } catch (error) {
      setMessage(error?.message || t('setupPin.error.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScene
      eyebrow={t('setupPin.eyebrow')}
      title={t('setupPin.title')}
      subtitle={t('setupPin.subtitle')}
    >
      <TextInput
        value={pin}
        onChangeText={setPin}
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

      <TouchableOpacity style={AUTH_FORM_STYLES.checkboxRow} onPress={() => setTrustDevice((prev) => !prev)}>
        <View style={[AUTH_FORM_STYLES.checkbox, trustDevice && AUTH_FORM_STYLES.checkboxActive]}>
          {trustDevice ? <Text style={AUTH_FORM_STYLES.checkboxTick}>✓</Text> : null}
        </View>
        <Text style={AUTH_FORM_STYLES.checkboxText}>{t('setupPin.trustDevice')}</Text>
      </TouchableOpacity>

      {message ? (
        <View style={AUTH_FORM_STYLES.noticeStrip}>
          <Text style={AUTH_FORM_STYLES.noticeText}>{message}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[AUTH_FORM_STYLES.primaryButton, loading && AUTH_FORM_STYLES.primaryButtonDisabled]}
        onPress={handleSetupPin}
        disabled={loading}
      >
        {loading ? <ActivityIndicator size="small" color={UI_COLORS.onAccent} /> : <Text style={AUTH_FORM_STYLES.primaryButtonText}>{t('setupPin.submit')}</Text>}
      </TouchableOpacity>
    </AuthScene>
  );
}
