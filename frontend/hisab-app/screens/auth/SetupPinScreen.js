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
      setMessage('PIN এবং নিশ্চিতকরণ দেওয়া আবশ্যক।');
      return;
    }

    if (!/^\d{4,6}$/.test(normalizedPin)) {
      setMessage('PIN ৪ থেকে ৬ সংখ্যার হতে হবে।');
      return;
    }

    if (normalizedPin !== normalizedConfirm) {
      setMessage('PIN মিলছে না।');
      return;
    }

    try {
      setMessage('');
      setLoading(true);
      await setupPin({
        pin: normalizedPin,
        trustDevice,
      });
      setMessage('PIN সেটআপ সম্পন্ন।');
      navigation.goBack();
    } catch (error) {
      setMessage(error?.message || 'PIN সেটআপ ব্যর্থ হয়েছে।');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScene
      eyebrow="হিসাব নিরাপত্তা"
      title="PIN সেটআপ"
      subtitle="দ্রুত লগইনের জন্য নিরাপদ PIN সেট করুন"
    >
      <TextInput
        value={pin}
        onChangeText={setPin}
        placeholder="নতুন PIN"
        placeholderTextColor={UI_COLORS.textSecondary}
        keyboardType="number-pad"
        maxLength={6}
        secureTextEntry
        style={AUTH_FORM_STYLES.input}
      />

      <TextInput
        value={confirmPin}
        onChangeText={setConfirmPin}
        placeholder="PIN নিশ্চিত করুন"
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
        <Text style={AUTH_FORM_STYLES.checkboxText}>এই ডিভাইসে PIN লগইন বিশ্বাস করুন</Text>
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
        {loading ? <ActivityIndicator size="small" color={UI_COLORS.onAccent} /> : <Text style={AUTH_FORM_STYLES.primaryButtonText}>PIN সেটআপ করুন</Text>}
      </TouchableOpacity>
    </AuthScene>
  );
}

