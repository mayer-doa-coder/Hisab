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

export default function SetupPinScreen({ navigation }) {
  const { setupPin } = useAuth();

  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [trustDevice, setTrustDevice] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSetupPin = async () => {
    if (loading) {
      return;
    }

    const normalizedPin = String(pin || '').trim();
    const normalizedConfirm = String(confirmPin || '').trim();

    if (!normalizedPin || !normalizedConfirm) {
      setMessage('PIN and confirmation are required.');
      return;
    }

    if (!/^\d{4,6}$/.test(normalizedPin)) {
      setMessage('PIN must be 4 to 6 digits.');
      return;
    }

    if (normalizedPin !== normalizedConfirm) {
      setMessage('PINs do not match.');
      return;
    }

    try {
      setMessage('');
      setLoading(true);
      await setupPin({
        pin: normalizedPin,
        trustDevice,
      });
      setMessage('PIN setup completed.');
      navigation.goBack();
    } catch (error) {
      setMessage(error?.message || 'PIN setup failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScene
      eyebrow="Hisab Security"
      title="Setup PIN"
      subtitle="Set a secure PIN for faster login"
    >
      <TextInput
        value={pin}
        onChangeText={setPin}
        placeholder="New PIN"
        keyboardType="number-pad"
        maxLength={6}
        secureTextEntry
        style={AUTH_FORM_STYLES.input}
      />

      <TextInput
        value={confirmPin}
        onChangeText={setConfirmPin}
        placeholder="Confirm PIN"
        keyboardType="number-pad"
        maxLength={6}
        secureTextEntry
        style={AUTH_FORM_STYLES.input}
      />

      <TouchableOpacity style={AUTH_FORM_STYLES.checkboxRow} onPress={() => setTrustDevice((prev) => !prev)}>
        <View style={[AUTH_FORM_STYLES.checkbox, trustDevice && AUTH_FORM_STYLES.checkboxActive]}>
          {trustDevice ? <Text style={AUTH_FORM_STYLES.checkboxTick}>v</Text> : null}
        </View>
        <Text style={AUTH_FORM_STYLES.checkboxText}>Trust this device for PIN login</Text>
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
        {loading ? <ActivityIndicator size="small" color={UI_COLORS.onAccent} /> : <Text style={AUTH_FORM_STYLES.primaryButtonText}>Setup PIN</Text>}
      </TouchableOpacity>
    </AuthScene>
  );
}

