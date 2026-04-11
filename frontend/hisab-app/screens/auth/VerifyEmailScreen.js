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
      setMessage('Email delivery is currently unavailable. Please contact support.');
    }
  }, [emailDelivery]);

  const handleVerify = async () => {
    if (submitting) {
      return;
    }

    const normalizedEmail = String(email || '').trim();
    const normalizedCode = String(verificationCode || '').trim();

    if (!normalizedEmail || !normalizedCode) {
      setMessage('Email and verification code are required.');
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
      setMessage(error?.message || 'Verification failed.');
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
      setMessage('Email is required to resend code.');
      return;
    }

    try {
      setMessage('');
      setResending(true);
      await requestEmailVerification(normalizedEmail);
      setMessage('Verification code sent. Check your email.');
    } catch (error) {
      setMessage(error?.message || 'Could not resend verification code.');
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthScene
      eyebrow="Hisab Verify"
      title="Verify Email"
      subtitle="Enter the code sent to your email"
    >
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        style={AUTH_FORM_STYLES.input}
      />

      <TextInput
        value={verificationCode}
        onChangeText={setVerificationCode}
        placeholder="Verification code"
        autoCapitalize="characters"
        style={AUTH_FORM_STYLES.input}
      />

      <TouchableOpacity style={AUTH_FORM_STYLES.checkboxRow} onPress={() => setRememberMe((prev) => !prev)}>
        <View style={[AUTH_FORM_STYLES.checkbox, rememberMe && AUTH_FORM_STYLES.checkboxActive]}>
          {rememberMe ? <Text style={AUTH_FORM_STYLES.checkboxTick}>v</Text> : null}
        </View>
        <Text style={AUTH_FORM_STYLES.checkboxText}>Remember me after verification</Text>
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
        {submitting ? <ActivityIndicator size="small" color={UI_COLORS.onAccent} /> : <Text style={AUTH_FORM_STYLES.primaryButtonText}>Verify Email</Text>}
      </TouchableOpacity>

      <TouchableOpacity
        style={[AUTH_FORM_STYLES.secondaryButton, resending && { opacity: 0.7 }]}
        onPress={handleResend}
        disabled={resending}
      >
        {resending ? <ActivityIndicator size="small" color={UI_COLORS.primary} /> : <Text style={AUTH_FORM_STYLES.secondaryButtonText}>Resend Code</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={AUTH_FORM_STYLES.linkButton} onPress={() => navigation.navigate('Login')}>
        <Text style={AUTH_FORM_STYLES.linkText}>Back to login</Text>
      </TouchableOpacity>
    </AuthScene>
  );
}


