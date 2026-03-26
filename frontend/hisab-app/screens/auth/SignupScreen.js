import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UI_COLORS } from '../../constants/ui-theme';
import { useAuth } from '../../context/AuthContext';

export default function SignupScreen({ navigation }) {
  const { signup } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    const normalizedEmail = String(email || '').trim();
    const normalizedPassword = String(password || '').trim();
    const normalizedConfirm = String(confirmPassword || '').trim();

    if (!normalizedEmail || !normalizedPassword || !normalizedConfirm) {
      Alert.alert('Invalid input', 'All fields are required.');
      return;
    }

    if (normalizedPassword.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }

    if (normalizedPassword !== normalizedConfirm) {
      Alert.alert('Password mismatch', 'Confirm password does not match.');
      return;
    }

    try {
      setLoading(true);
      await signup(normalizedEmail, normalizedPassword, { rememberMe });
    } catch (error) {
      Alert.alert('Signup failed', error?.message || 'Unable to signup.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.container}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Set up your local account to access the app.</Text>

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
          />

          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            style={styles.input}
          />

          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Confirm Password"
            secureTextEntry
            style={styles.input}
          />

          <TouchableOpacity style={styles.rememberRow} onPress={() => setRememberMe((prev) => !prev)}>
            <View style={[styles.checkbox, rememberMe && styles.checkboxActive]}>
              {rememberMe ? <Text style={styles.checkboxTick}>✓</Text> : null}
            </View>
            <Text style={styles.rememberText}>Remember me</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleSignup} disabled={loading}>
            {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.buttonText}>Signup</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkButton} onPress={() => navigation.goBack()}>
            <Text style={styles.linkText}>Already have an account? Login</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: UI_COLORS.background,
  },
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    gap: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: UI_COLORS.textPrimary,
  },
  subtitle: {
    marginBottom: 6,
    fontSize: 13,
    color: UI_COLORS.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    backgroundColor: UI_COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: UI_COLORS.textPrimary,
    fontSize: 15,
  },
  button: {
    marginTop: 6,
    borderRadius: 10,
    backgroundColor: UI_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    minHeight: 46,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  rememberRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    borderColor: UI_COLORS.primary,
    backgroundColor: '#DBEAFE',
  },
  checkboxTick: {
    color: UI_COLORS.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  rememberText: {
    color: UI_COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  linkButton: {
    marginTop: 4,
    alignItems: 'center',
  },
  linkText: {
    color: UI_COLORS.primary,
    fontSize: 13,
    fontWeight: '700',
  },
});
