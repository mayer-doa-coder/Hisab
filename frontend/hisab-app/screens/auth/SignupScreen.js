import { useState } from 'react';
import {
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  View,
} from 'react-native';

import AuthScene, { AUTH_FORM_STYLES } from '../../components/auth/AuthScene';
import { useAuth } from '../../context/AuthContext';
import { evaluatePasswordPolicy } from '../../utils/passwordPolicy';

export default function SignupScreen({ navigation }) {
  const { signup } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSignup = async () => {
    const normalizedEmail = String(email || '').trim();
    const normalizedPassword = String(password || '').trim();
    const normalizedConfirm = String(confirmPassword || '').trim();

    if (!normalizedEmail || !normalizedPassword || !normalizedConfirm) {
      setMessage('All fields are required.');
      return;
    }

    const passwordPolicy = evaluatePasswordPolicy(normalizedPassword, 8);
    if (!passwordPolicy.ok) {
      setMessage(passwordPolicy.message);
      return;
    }

    if (normalizedPassword !== normalizedConfirm) {
      setMessage('Passwords do not match.');
      return;
    }

    try {
      setMessage('');
      setLoading(true);
      const result = await signup(normalizedEmail, normalizedPassword, { rememberMe });

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
      title="Create Account"
      subtitle="Create account in seconds."
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
        <View style={styles.inlineNotice}>
          <Text style={styles.inlineNoticeText}>{message}</Text>
        </View>
      ) : null}

      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
        placeholderTextColor="#607D94"
        style={AUTH_FORM_STYLES.input}
      />

      <TextInput
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder="Confirm password"
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
        {loading ? <ActivityIndicator size="small" color="#FFF8EE" /> : <Text style={AUTH_FORM_STYLES.primaryButtonText}>Create Account</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={AUTH_FORM_STYLES.linkButton} onPress={() => navigation.goBack()}>
        <Text style={AUTH_FORM_STYLES.linkText}>Already have an account? Login</Text>
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
