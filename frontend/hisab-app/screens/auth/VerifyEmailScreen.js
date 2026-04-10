import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import AuthScene, { AUTH_FORM_STYLES } from '../../components/auth/AuthScene';
import { useAuth } from '../../context/AuthContext';

const mapVerifyError = (error) => {
  const code = String(error?.code || '').trim().toUpperCase();

  if (code === 'VERIFICATION_CODE_EXPIRED') {
    return 'Code expired. Request a new code and try again.';
  }

  if (code === 'INVALID_VERIFICATION_CODE') {
    return 'Wrong code. Please check and try again.';
  }

  if (code === 'OTP_REQUEST_RATE_LIMITED') {
    return 'Too many requests. Please wait a minute and try again.';
  }

  if (code === 'EMAIL_DELIVERY_FAILED') {
    return 'Email service could not deliver code. Ask admin to configure SMTP or use dev code if shown.';
  }

  return error?.message || 'Unable to verify code right now.';
};

export default function VerifyEmailScreen({ navigation, route }) {
  const { requestEmailVerification, verifyEmailCode } = useAuth();
  const [email, setEmail] = useState(String(route?.params?.email || '').trim());
  const [code, setCode] = useState('');
  const [rememberMe, setRememberMe] = useState(Boolean(route?.params?.rememberMe));
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [deliveryNoticeShown, setDeliveryNoticeShown] = useState(false);
  const [message, setMessage] = useState('');

  const codeHint = useMemo(() => {
    const debugCode = String(route?.params?.verificationCode || '').trim();
    if (!debugCode) {
      return '';
    }

    return `Dev code: ${debugCode}`;
  }, [route?.params?.verificationCode]);

  useEffect(() => {
    if (deliveryNoticeShown) {
      return;
    }

    const delivery = route?.params?.emailDelivery;
    if (delivery && delivery.delivered === false && !delivery.transportConfigured) {
      setDeliveryNoticeShown(true);
      setMessage('Email service is not configured. Use dev code or retry later.');
    }
  }, [deliveryNoticeShown, route?.params?.emailDelivery]);

  const handleVerify = async () => {
    if (submitting) {
      return;
    }

    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedCode = String(code || '').trim();

    if (!normalizedEmail || !normalizedCode) {
      setMessage('Email and code are required.');
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
      setMessage(mapVerifyError(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (resending) {
      return;
    }

    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      setMessage('Enter your email first.');
      return;
    }

    try {
      setMessage('');
      setResending(true);
      const payload = await requestEmailVerification(normalizedEmail);
      const nextDebugCode = String(payload?.verificationCode || '').trim();
      const delivery = payload?.emailDelivery || null;

      if (delivery && delivery.delivered === false && !delivery.transportConfigured) {
        setMessage(
          nextDebugCode
            ? `Email service is not configured. Dev code: ${nextDebugCode}`
            : 'Email service is not configured. Retry after setup.'
        );
      } else {
        setMessage(nextDebugCode ? `Code resent. Dev code: ${nextDebugCode}` : 'Code resent.');
      }
    } catch (error) {
      setMessage(mapVerifyError(error));
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthScene
      eyebrow="Hisab Verify"
      title="Verify Email"
      subtitle="Enter code and continue."
    >
      {codeHint ? (
        <View style={AUTH_FORM_STYLES.noticeStrip}>
          <Text style={AUTH_FORM_STYLES.noticeText}>{codeHint}</Text>
        </View>
      ) : null}

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        placeholderTextColor="#607D94"
        style={AUTH_FORM_STYLES.input}
      />

      {message ? (
        <View style={styles.inlineNotice}>
          <Text style={styles.inlineNoticeText}>{message}</Text>
        </View>
      ) : null}

      <TextInput
        value={code}
        onChangeText={setCode}
        placeholder="Verification code"
        keyboardType="number-pad"
        maxLength={6}
        placeholderTextColor="#607D94"
        style={AUTH_FORM_STYLES.input}
      />

      <TouchableOpacity style={AUTH_FORM_STYLES.checkboxRow} onPress={() => setRememberMe((prev) => !prev)}>
        <View style={[AUTH_FORM_STYLES.checkbox, rememberMe && AUTH_FORM_STYLES.checkboxActive]}>
          {rememberMe ? <Text style={AUTH_FORM_STYLES.checkboxTick}>✓</Text> : null}
        </View>
        <Text style={AUTH_FORM_STYLES.checkboxText}>Remember me on this device</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[AUTH_FORM_STYLES.primaryButton, submitting && AUTH_FORM_STYLES.primaryButtonDisabled]}
        onPress={handleVerify}
        disabled={submitting}
      >
        {submitting ? <ActivityIndicator size="small" color="#FFF8EE" /> : <Text style={AUTH_FORM_STYLES.primaryButtonText}>Verify and Login</Text>}
      </TouchableOpacity>

      <TouchableOpacity
        style={[AUTH_FORM_STYLES.secondaryButton, resending && AUTH_FORM_STYLES.primaryButtonDisabled]}
        onPress={handleResend}
        disabled={resending}
      >
        {resending ? <ActivityIndicator size="small" color="#16324F" /> : <Text style={AUTH_FORM_STYLES.secondaryButtonText}>Resend Code</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={AUTH_FORM_STYLES.linkButton} onPress={() => navigation.navigate('Login')}>
        <Text style={AUTH_FORM_STYLES.linkText}>Back to login</Text>
      </TouchableOpacity>
    </AuthScene>
  );
}

const styles = StyleSheet.create({
  inlineNotice: {
    marginTop: 4,
    borderLeftWidth: 3,
    borderColor: '#B91C1C',
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  inlineNoticeText: {
    color: '#7F1D1D',
    fontSize: 12,
    fontWeight: '700',
  },
});
