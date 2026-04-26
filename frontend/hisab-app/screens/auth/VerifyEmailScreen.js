import { useEffect, useState } from 'react';
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

export default function VerifyEmailScreen({ navigation, route }) {
  const { verifyEmailCode, requestEmailVerification } = useAuth();

  const initialEmail = String(route?.params?.email || '').trim();
  const initialRememberMe = Boolean(route?.params?.rememberMe);
  const emailDelivery = route?.params?.emailDelivery || null;

  const [email, setEmail] = useState(initialEmail);
  const [verificationCode, setVerificationCode] = useState('');
  const [rememberMe, setRememberMe] = useState(initialRememberMe);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (emailDelivery && emailDelivery.delivered === false && !emailDelivery.transportConfigured) {
      setMessage('ইমেইল ডেলিভারি এখন অনুপলব্ধ। সাপোর্টে যোগাযোগ করুন।');
    }
  }, [emailDelivery]);

  const handleVerify = async () => {
    if (submitting) {
      return;
    }

    const normalizedEmail = String(email || '').trim();
    const normalizedCode = String(verificationCode || '').trim();

    if (!normalizedEmail || !normalizedCode) {
      setMessage('ইমেইল ও যাচাই কোড দেওয়া আবশ্যক।');
      return;
    }

    try {
      setMessage('');
      setSubmitting(true);
      await verifyEmailCode({
        email: normalizedEmail,
        verificationCode: normalizedCode,
        rememberMe,
      });
    } catch (error) {
      setMessage(error?.message || 'যাচাই ব্যর্থ হয়েছে।');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (resending) {
      return;
    }

    const normalizedEmail = String(email || '').trim();
    if (!normalizedEmail) {
      setMessage('কোড পুনরায় পাঠাতে ইমেইল দিন।');
      return;
    }

    try {
      setMessage('');
      setResending(true);
      await requestEmailVerification(normalizedEmail);
      setMessage('যাচাই কোড পাঠানো হয়েছে। ইমেইল চেক করুন।');
    } catch (error) {
      setMessage(error?.message || 'যাচাই কোড পাঠানো যায়নি।');
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthScene
      eyebrow="হিসাব যাচাই"
      title="ইমেইল যাচাই"
      subtitle="আপনার ইমেইলে পাঠানো কোড দিন"
    >
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="ইমেইল"
        placeholderTextColor={UI_COLORS.textSecondary}
        autoCapitalize="none"
        keyboardType="email-address"
        style={AUTH_FORM_STYLES.input}
      />

      <TextInput
        value={verificationCode}
        onChangeText={setVerificationCode}
        placeholder="যাচাই কোড"
        placeholderTextColor={UI_COLORS.textSecondary}
        autoCapitalize="characters"
        style={AUTH_FORM_STYLES.input}
      />

      <TouchableOpacity style={AUTH_FORM_STYLES.checkboxRow} onPress={() => setRememberMe((prev) => !prev)}>
        <View style={[AUTH_FORM_STYLES.checkbox, rememberMe && AUTH_FORM_STYLES.checkboxActive]}>
          {rememberMe ? <Text style={AUTH_FORM_STYLES.checkboxTick}>✓</Text> : null}
        </View>
        <Text style={AUTH_FORM_STYLES.checkboxText}>যাচাইয়ের পর মনে রাখুন</Text>
      </TouchableOpacity>

      {message ? (
        <View style={AUTH_FORM_STYLES.noticeStrip}>
          <Text style={AUTH_FORM_STYLES.noticeText}>{message}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[AUTH_FORM_STYLES.primaryButton, submitting && AUTH_FORM_STYLES.primaryButtonDisabled]}
        onPress={handleVerify}
        disabled={submitting}
      >
        {submitting ? <ActivityIndicator size="small" color={UI_COLORS.onAccent} /> : <Text style={AUTH_FORM_STYLES.primaryButtonText}>ইমেইল যাচাই করুন</Text>}
      </TouchableOpacity>

      <TouchableOpacity
        style={[AUTH_FORM_STYLES.secondaryButton, resending && { opacity: 0.7 }]}
        onPress={handleResend}
        disabled={resending}
      >
        {resending ? <ActivityIndicator size="small" color={UI_COLORS.primary} /> : <Text style={AUTH_FORM_STYLES.secondaryButtonText}>কোড পুনরায় পাঠান</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={AUTH_FORM_STYLES.linkButton} onPress={() => navigation.navigate('Login')}>
        <Text style={AUTH_FORM_STYLES.linkText}>লগইনে ফিরুন</Text>
      </TouchableOpacity>
    </AuthScene>
  );
}


