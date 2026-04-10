import { useState } from 'react';
import {
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import AuthScene, { AUTH_FORM_STYLES } from '../../components/auth/AuthScene';
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
    const normalizedEmail = String(email || '').trim();
    const normalizedPin = String(pin || '').trim();
    const normalizedConfirm = String(confirmPin || '').trim();

    if (!normalizedEmail || !normalizedPin || !normalizedConfirm) {
      setMessage('All fields are required.');
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
      const result = await signup(normalizedEmail, normalizedPin, { rememberMe });

      if (result?.verificationRequired) {
        const delivery = result?.emailDelivery || null;
        if (delivery && delivery.delivered === false && !delivery.transportConfigured) {
          setMessage('Email service is not configured. Use the dev code on next screen.');
        }

        navigation.navigate('VerifyEmail', {
          email: result.email || normalizedEmail,
          rememberMe,
          verificationCode: result.verificationCode || null,
          verificationCodeExpiresAt: result.verificationCodeExpiresAt || null,
          emailDelivery: delivery,
        });
      }
    } catch (error) {
      setMessage(error?.message || 'Signup failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScene
      eyebrow="Hisab Join"
      title="Sign Up"
      subtitle="Create your account with email and PIN"
    >
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
        <View style={AUTH_FORM_STYLES.noticeStrip}>
          <Text style={AUTH_FORM_STYLES.noticeText}>{message}</Text>
        </View>
      ) : null}

      <TextInput
        value={pin}
        onChangeText={setPin}
        placeholder="Set PIN"
        keyboardType="number-pad"
        maxLength={6}
        secureTextEntry
        placeholderTextColor="#607D94"
        style={AUTH_FORM_STYLES.input}
      />

      <TextInput
        value={confirmPin}
        onChangeText={setConfirmPin}
        placeholder="Confirm PIN"
        keyboardType="number-pad"
        maxLength={6}
        secureTextEntry
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
        style={[AUTH_FORM_STYLES.primaryButton, loading && AUTH_FORM_STYLES.primaryButtonDisabled]}
        onPress={handleSignup}
        disabled={loading}
      >
        {loading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={AUTH_FORM_STYLES.primaryButtonText}>Create Account</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={AUTH_FORM_STYLES.linkButton} onPress={() => navigation.goBack()}>
        <Text style={AUTH_FORM_STYLES.linkText}>Already have an account? Login</Text>
      </TouchableOpacity>
    </AuthScene>
  );
}
