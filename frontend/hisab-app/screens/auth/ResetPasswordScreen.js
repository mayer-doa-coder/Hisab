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

export default function ResetPasswordScreen({ navigation }) {
  const { resetPin } = useAuth();

  const [resetToken, setResetToken] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleResetPin = async () => {
    if (loading) {
      return;
    }

    const normalizedToken = String(resetToken || '').trim();
    const normalizedNewPin = String(newPin || '').trim();
    const normalizedConfirmPin = String(confirmPin || '').trim();

    if (!normalizedToken || !normalizedNewPin || !normalizedConfirmPin) {
      setMessage('রিসেট টোকেন এবং PIN দেওয়া আবশ্যক।');
      return;
    }

    if (!/^\d{4,6}$/.test(normalizedNewPin)) {
      setMessage('PIN ৪ থেকে ৬ সংখ্যার হতে হবে।');
      return;
    }

    if (normalizedNewPin !== normalizedConfirmPin) {
      setMessage('PIN মিলছে না।');
      return;
    }

    try {
      setMessage('');
      setLoading(true);
      await resetPin({
        resetToken: normalizedToken,
        newPin: normalizedNewPin,
      });
      setMessage('PIN রিসেট সম্পন্ন। নতুন PIN দিয়ে লগইন করুন।');
      navigation.navigate('Login');
    } catch (error) {
      setMessage(error?.message || 'PIN রিসেট ব্যর্থ হয়েছে।');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScene
      eyebrow="হিসাব রিকভারি"
      title="PIN রিসেট"
      subtitle="নতুন PIN সেট করতে রিকভারি টোকেন ব্যবহার করুন"
    >
      <TextInput
        value={resetToken}
        onChangeText={setResetToken}
        placeholder="রিকভারি টোকেন"
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

      <TouchableOpacity
        style={[AUTH_FORM_STYLES.primaryButton, loading && AUTH_FORM_STYLES.primaryButtonDisabled]}
        onPress={handleResetPin}
        disabled={loading}
      >
        {loading ? <ActivityIndicator size="small" color={UI_COLORS.onAccent} /> : <Text style={AUTH_FORM_STYLES.primaryButtonText}>PIN রিসেট করুন</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={AUTH_FORM_STYLES.linkButton} onPress={() => navigation.navigate('AccountRecovery')}>
        <Text style={AUTH_FORM_STYLES.linkText}>নতুন রিকভারি টোকেন লাগবে?</Text>
      </TouchableOpacity>

      <TouchableOpacity style={AUTH_FORM_STYLES.linkButton} onPress={() => navigation.navigate('Login')}>
        <Text style={AUTH_FORM_STYLES.linkText}>লগইনে ফিরুন</Text>
      </TouchableOpacity>
    </AuthScene>
  );
}

