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

export default function AccountRecoveryScreen({ navigation }) {
  const { requestPinRecovery } = useAuth();

  const [email, setEmail] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState('');

  const handleRequestRecovery = async () => {
    if (requesting) {
      return;
    }

    const normalizedEmail = String(email || '').trim();
    if (!normalizedEmail) {
      setMessage('ইমেইল দেওয়া আবশ্যক।');
      return;
    }

    try {
      setMessage('');
      setRequesting(true);
      await requestPinRecovery(normalizedEmail);
      navigation.navigate('ResetPassword');
    } catch (error) {
      if (String(error?.code || '').toUpperCase() === 'EMAIL_NOT_REGISTERED') {
        setMessage('এই ইমেইল নিবন্ধিত নয়।');
      } else {
        setMessage(error?.message || 'রিকভারি অনুরোধ ব্যর্থ হয়েছে।');
      }
    } finally {
      setRequesting(false);
    }
  };

  return (
    <AuthScene
      eyebrow="হিসাব রিকভারি"
      title="অ্যাকাউন্ট পুনরুদ্ধার"
      subtitle="PIN রিসেট করতে রিকভারি টোকেন নিন"
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

      <TouchableOpacity
        style={[AUTH_FORM_STYLES.primaryButton, requesting && AUTH_FORM_STYLES.primaryButtonDisabled]}
        onPress={handleRequestRecovery}
        disabled={requesting}
      >
        {requesting ? <ActivityIndicator size="small" color={UI_COLORS.onAccent} /> : <Text style={AUTH_FORM_STYLES.primaryButtonText}>PIN রিকভারি টোকেন পাঠান</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={AUTH_FORM_STYLES.linkButton} onPress={() => navigation.navigate('Login')}>
        <Text style={AUTH_FORM_STYLES.linkText}>লগইনে ফিরুন</Text>
      </TouchableOpacity>
    </AuthScene>
  );
}
