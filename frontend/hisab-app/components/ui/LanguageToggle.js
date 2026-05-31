import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useLanguage } from '../../context/LanguageContext';
import { COLORS } from '../../theme/colors';
import { SPACING } from '../../theme/spacing';
import { TYPOGRAPHY } from '../../theme/typography';

/**
 * LanguageToggle — Persistent BN / EN language switcher.
 *
 * Design decisions for rural users:
 *  - Both options always visible (no dropdown) — user instantly sees current state
 *  - Active option uses strong contrast (filled pill); inactive is dimmed
 *  - Minimum tap target 48dp on each side
 *  - Can be placed in headers, settings screens, or the drawer footer
 *
 * variant: 'pill' (default) | 'tab'
 *   pill → compact rounded pill (for headers/toolbars)
 *   tab  → full-width horizontal tab (for settings screens)
 */
export default function LanguageToggle({ variant = 'pill', style }) {
  const { language, setLanguage } = useLanguage();

  if (variant === 'tab') {
    return (
      <View style={[styles.tabContainer, style]}>
        <TouchableOpacity
          style={[styles.tabOption, language === 'bn' && styles.tabOptionActive]}
          onPress={() => setLanguage('bn')}
          activeOpacity={0.78}
          accessibilityRole="radio"
          accessibilityState={{ checked: language === 'bn' }}
          accessibilityLabel="বাংলা ভাষা"
        >
          <Text style={[styles.tabLabel, language === 'bn' && styles.tabLabelActive]}>
            বাং
          </Text>
          <Text style={[styles.tabSub, language === 'bn' && styles.tabSubActive]}>
            Bangla
          </Text>
        </TouchableOpacity>

        <View style={styles.tabDivider} />

        <TouchableOpacity
          style={[styles.tabOption, language === 'en' && styles.tabOptionActive]}
          onPress={() => setLanguage('en')}
          activeOpacity={0.78}
          accessibilityRole="radio"
          accessibilityState={{ checked: language === 'en' }}
          accessibilityLabel="English language"
        >
          <Text style={[styles.tabLabel, language === 'en' && styles.tabLabelActive]}>
            EN
          </Text>
          <Text style={[styles.tabSub, language === 'en' && styles.tabSubActive]}>
            English
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── pill variant (default, for headers) ────────────────────────────────────
  return (
    <View style={[styles.pillContainer, style]}>
      <TouchableOpacity
        style={[styles.pillOption, language === 'bn' && styles.pillOptionActive]}
        onPress={() => setLanguage('bn')}
        activeOpacity={0.78}
        accessibilityRole="radio"
        accessibilityState={{ checked: language === 'bn' }}
        accessibilityLabel="বাংলা"
      >
        <Text style={[styles.pillLabel, language === 'bn' && styles.pillLabelActive]}>
          বাং
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.pillOption, language === 'en' && styles.pillOptionActive]}
        onPress={() => setLanguage('en')}
        activeOpacity={0.78}
        accessibilityRole="radio"
        accessibilityState={{ checked: language === 'en' }}
        accessibilityLabel="EN"
      >
        <Text style={[styles.pillLabel, language === 'en' && styles.pillLabelActive]}>
          EN
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Pill ─────────────────────────────────────────────────────────────────
  pillContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: 24,
    padding: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pillOption: {
    minWidth: 48,
    minHeight: 36,
    paddingHorizontal: SPACING.md,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillOptionActive: {
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  pillLabel: {
    ...TYPOGRAPHY.button,
    fontSize: 13,
    color: COLORS.textMuted,
  },
  pillLabelActive: {
    color: COLORS.textOnPrimary,
  },

  // ── Tab ───────────────────────────────────────────────────────────────────
  tabContainer: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.border,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
  },
  tabOption: {
    flex: 1,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
  },
  tabOptionActive: {
    backgroundColor: COLORS.primary,
  },
  tabDivider: {
    width: 1,
    backgroundColor: COLORS.border,
  },
  tabLabel: {
    ...TYPOGRAPHY.h2,
    fontSize: 20,
    color: COLORS.textMuted,
  },
  tabLabelActive: {
    color: COLORS.textOnPrimary,
  },
  tabSub: {
    ...TYPOGRAPHY.small,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  tabSubActive: {
    color: `${COLORS.textOnPrimary}CC`,
  },
});
