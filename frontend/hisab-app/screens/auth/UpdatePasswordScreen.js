import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UI_COLORS } from '../../constants/ui-theme';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { SPACING } from '../../theme/spacing';

export default function UpdatePasswordScreen() {
  const { updatePin } = useAuth();
  const { t } = useLanguage();

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleUpdatePin = async () => {
    if (loading) return;

    const normalizedCurrent = String(currentPin || '').trim();
    const normalizedNew = String(newPin || '').trim();
    const normalizedConfirm = String(confirmPin || '').trim();

    if (!normalizedCurrent || !normalizedNew || !normalizedConfirm) { setMessage(t('updatePin.error.fillAll')); return; }
    if (!/^\d{4,6}$/.test(normalizedCurrent) || !/^\d{4,6}$/.test(normalizedNew)) { setMessage(t('auth.error.pinFormat')); return; }
    if (normalizedNew !== normalizedConfirm) { setMessage(t('auth.error.pinMismatch')); return; }

    try {
      setMessage('');
      setLoading(true);
      await updatePin({ currentPin: normalizedCurrent, newPin: normalizedNew });
      setMessage(t('updatePin.success'));
    } catch (error) {
      setMessage(error?.message || t('updatePin.error.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <Text style={styles.title}>{t('updatePin.title')}</Text>
            <Text style={styles.subtitle}>{t('updatePin.subtitle')}</Text>

            <TextInput
              value={currentPin}
              onChangeText={setCurrentPin}
              placeholder={t('auth.pin.current')}
              placeholderTextColor={UI_COLORS.textSecondary}
              keyboardType="number-pad"
              maxLength={6}
              secureTextEntry
              style={styles.input}
            />

            {message ? (
              <View style={styles.inlineNotice}>
                <Text style={styles.inlineNoticeText}>{message}</Text>
              </View>
            ) : null}

            <TextInput
              value={newPin}
              onChangeText={setNewPin}
              placeholder={t('auth.pin.new')}
              placeholderTextColor={UI_COLORS.textSecondary}
              keyboardType="number-pad"
              maxLength={6}
              secureTextEntry
              style={styles.input}
            />

            <TextInput
              value={confirmPin}
              onChangeText={setConfirmPin}
              placeholder={t('auth.pin.confirm')}
              placeholderTextColor={UI_COLORS.textSecondary}
              keyboardType="number-pad"
              maxLength={6}
              secureTextEntry
              style={styles.input}
            />

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleUpdatePin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={UI_COLORS.onAccent} />
              ) : (
                <Text style={styles.buttonText}>{t('updatePin.submit')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
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
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.xl,
    flexGrow: 1,
    justifyContent: 'center',
  },
  card: {
    borderRadius: 24,
    backgroundColor: UI_COLORS.surface,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
    gap: SPACING.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 8,
  },
  title: {
    fontFamily: 'AnekBangla_800ExtraBold',
    fontSize: 28,
    lineHeight: 36,
    includeFontPadding: false,
    color: UI_COLORS.textPrimary,
  },
  subtitle: {
    fontFamily: 'AnekBangla_400Regular',
    fontSize: 13,
    lineHeight: 20,
    includeFontPadding: false,
    color: UI_COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  input: {
    height: 52,
    borderRadius: 16,
    backgroundColor: UI_COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingVertical: 0,
    color: UI_COLORS.textPrimary,
    fontFamily: 'AnekBangla_500Medium',
    fontSize: 14,
    lineHeight: 22,
    includeFontPadding: false,
    textAlignVertical: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  inlineNotice: {
    backgroundColor: UI_COLORS.surfaceSoft,
    borderRadius: 12,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  inlineNoticeText: {
    fontFamily: 'AnekBangla_600SemiBold',
    fontSize: 12,
    lineHeight: 18,
    includeFontPadding: false,
    color: UI_COLORS.textPrimary,
  },
  button: {
    marginTop: SPACING.md,
    borderRadius: 16,
    backgroundColor: UI_COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 5,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontFamily: 'AnekBangla_700Bold',
    fontSize: 15,
    lineHeight: 22,
    includeFontPadding: false,
    color: UI_COLORS.onAccent,
    textAlign: 'center',
  },
});
