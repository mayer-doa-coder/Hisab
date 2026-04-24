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

export default function SignupScreen({ navigation }) {
  const { signup } = useAuth();

  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSignup = async () => {
    if (loading) {
      return;
    }

    const normalizedEmail = String(email || '').trim();
    const normalizedPin = String(pin || '').trim();
    const normalizedConfirm = String(confirmPin || '').trim();

    if (!normalizedEmail || !normalizedPin || !normalizedConfirm) {
      setMessage('সব তথ্য পূরণ করুন।');
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
      const result = await signup(normalizedEmail, normalizedPin, { rememberMe });

      if (result?.verificationRequired) {
        const delivery = result?.emailDelivery || null;
        if (delivery && delivery.delivered === false && !delivery.transportConfigured) {
          setMessage('ইমেইল সেবা চালু নেই। সাপোর্টে যোগাযোগ করুন।');
        }

        navigation.navigate('VerifyEmail', {
          email: result.email || normalizedEmail,
          rememberMe,
          emailDelivery: delivery,
        });
      }
    } catch (error) {
      setMessage(error?.message || 'অ্যাকাউন্ট খোলা যায়নি।');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScene
      eyebrow="হিসাব"
      title="অ্যাকাউন্ট খুলুন"
      subtitle="ইমেইল ও PIN দিয়ে অ্যাকাউন্ট খুলুন"
    >
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="ইমেইল"
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
        placeholder="PIN সেট করুন"
        keyboardType="number-pad"
        maxLength={6}
        secureTextEntry
        style={AUTH_FORM_STYLES.input}
      />

      <TextInput
        value={confirmPin}
        onChangeText={setConfirmPin}
        placeholder="PIN নিশ্চিত করুন"
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
        onPress={handleSignup}
        disabled={loading}
      >
        {loading ? <ActivityIndicator size="small" color={UI_COLORS.onAccent} /> : <Text style={AUTH_FORM_STYLES.primaryButtonText}>অ্যাকাউন্ট খুলুন</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={AUTH_FORM_STYLES.linkButton} onPress={() => navigation.goBack()}>
        <Text style={AUTH_FORM_STYLES.linkText}>আগে থেকে অ্যাকাউন্ট আছে? প্রবেশ করুন</Text>
      </TouchableOpacity>
    </AuthScene>
  );
}
