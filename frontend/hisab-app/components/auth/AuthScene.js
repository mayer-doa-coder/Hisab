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
import { AppCard } from '../ui';
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
          <AppCard style={styles.card}>
            <Text style={styles.eyebrow}>{eyebrow}</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
            <View style={styles.formColumn}>{children}</View>
          </AppCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export const AUTH_FORM_STYLES = StyleSheet.create({
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    backgroundColor: UI_COLORS.surface,
    color: UI_COLORS.textPrimary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    ...TYPOGRAPHY.body,
  },
  primaryButton: {
    marginTop: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: UI_COLORS.accent,
    backgroundColor: UI_COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    minHeight: 50,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    ...TYPOGRAPHY.button,
    color: UI_COLORS.onAccent,
  },
  secondaryButton: {
    marginTop: SPACING.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: UI_COLORS.primary,
    backgroundColor: UI_COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    paddingVertical: SPACING.sm,
  },
  secondaryButtonText: {
    ...TYPOGRAPHY.body,
    color: UI_COLORS.primary,
    fontWeight: '700',
  },
  linkButton: {
    marginTop: SPACING.sm,
    alignItems: 'center',
  },
  linkText: {
    ...TYPOGRAPHY.small,
    color: UI_COLORS.primary,
    fontWeight: '700',
  },
  checkboxRow: {
    marginTop: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: UI_COLORS.surface,
  },
  checkboxActive: {
    backgroundColor: UI_COLORS.primary,
    borderColor: UI_COLORS.primary,
  },
  checkboxTick: {
    color: UI_COLORS.surface,
    fontSize: 10,
    fontWeight: '900',
  },
  checkboxText: {
    ...TYPOGRAPHY.small,
    color: UI_COLORS.textSecondary,
    fontWeight: '600',
  },
  noticeStrip: {
    marginTop: SPACING.xs,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.surfaceSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderRadius: 10,
  },
  noticeText: {
    ...TYPOGRAPHY.small,
    color: UI_COLORS.textPrimary,
    fontWeight: '700',
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
    borderRadius: 18,
  },
  eyebrow: {
    ...TYPOGRAPHY.small,
    textAlign: 'center',
    color: UI_COLORS.textSecondary,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  title: {
    ...TYPOGRAPHY.h1,
    marginTop: SPACING.sm,
    textAlign: 'center',
    color: UI_COLORS.textPrimary,
  },
  subtitle: {
    ...TYPOGRAPHY.body,
    marginTop: SPACING.sm,
    textAlign: 'center',
    color: UI_COLORS.textSecondary,
  },
  formColumn: {
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
});
