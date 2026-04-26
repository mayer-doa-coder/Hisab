import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UI_COLORS } from '../../constants/ui-theme';
import { SPACING } from '../../theme/spacing';
import { TYPOGRAPHY } from '../../theme/typography';

export default function AuthScene({ eyebrow = 'হিসাব সিকিউর', title, subtitle, children }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <Text style={styles.eyebrow}>{eyebrow}</Text>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            <View style={styles.formColumn}>{children}</View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export const AUTH_FORM_STYLES = StyleSheet.create({
  input: {
    height: 52,
    borderRadius: 16,
    backgroundColor: UI_COLORS.surface,
    color: UI_COLORS.textPrimary,
    paddingHorizontal: SPACING.md,
    paddingVertical: 0,
    fontFamily: 'AnekBangla_500Medium',
    fontSize: 14,
    includeFontPadding: false,
    textAlignVertical: 'center',
    // neumorphism
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryButton: {
    marginTop: SPACING.md,
    borderRadius: 16,
    backgroundColor: UI_COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    // neumorphism
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 5,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontFamily: 'AnekBangla_700Bold',
    fontSize: 15,
    lineHeight: 22,
    includeFontPadding: false,
    color: UI_COLORS.onAccent,
    textAlign: 'center',
  },
  secondaryButton: {
    marginTop: SPACING.sm,
    borderRadius: 16,
    backgroundColor: UI_COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    // neumorphism
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  secondaryButtonText: {
    fontFamily: 'AnekBangla_700Bold',
    fontSize: 14,
    lineHeight: 22,
    includeFontPadding: false,
    color: UI_COLORS.primary,
    textAlign: 'center',
  },
  linkButton: {
    marginTop: SPACING.sm,
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  linkText: {
    fontFamily: 'AnekBangla_600SemiBold',
    fontSize: 13,
    lineHeight: 20,
    includeFontPadding: false,
    color: UI_COLORS.primary,
    textAlign: 'center',
  },
  checkboxRow: {
    marginTop: SPACING.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: UI_COLORS.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  checkboxActive: {
    backgroundColor: UI_COLORS.primary,
  },
  checkboxTick: {
    color: UI_COLORS.surface,
    fontSize: 11,
    lineHeight: 14,
    includeFontPadding: false,
    textAlign: 'center',
  },
  checkboxText: {
    fontFamily: 'AnekBangla_400Regular',
    fontSize: 13,
    lineHeight: 20,
    includeFontPadding: false,
    color: UI_COLORS.textSecondary,
  },
  noticeStrip: {
    borderRadius: 12,
    backgroundColor: UI_COLORS.surfaceSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  noticeText: {
    fontFamily: 'AnekBangla_600SemiBold',
    fontSize: 12,
    lineHeight: 18,
    includeFontPadding: false,
    color: UI_COLORS.textPrimary,
  },
});

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
    // neumorphism depth shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 8,
  },
  eyebrow: {
    fontFamily: 'AnekBangla_400Regular',
    fontSize: 11,
    lineHeight: 16,
    includeFontPadding: false,
    textAlign: 'center',
    color: UI_COLORS.textSecondary,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: 'AnekBangla_800ExtraBold',
    fontSize: 28,
    lineHeight: 36,
    includeFontPadding: false,
    marginTop: SPACING.xs,
    textAlign: 'center',
    color: UI_COLORS.textPrimary,
  },
  subtitle: {
    fontFamily: 'AnekBangla_400Regular',
    fontSize: 13,
    lineHeight: 20,
    includeFontPadding: false,
    marginTop: SPACING.xs,
    textAlign: 'center',
    color: UI_COLORS.textSecondary,
  },
  formColumn: {
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
});
