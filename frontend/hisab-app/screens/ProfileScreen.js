import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton, AppCard } from '../components/ui';
import { UI_COLORS } from '../constants/ui-theme';
import { useAuth } from '../context/AuthContext';
import { SPACING } from '../theme/spacing';
import { TYPOGRAPHY } from '../theme/typography';

export default function ProfileScreen() {
  const navigation = useNavigation();
  const { user, isOnline, authStatus, logout } = useAuth();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <AppCard>
          <View style={styles.profileHeader}>
            <View style={styles.avatarCircle}>
              <MaterialIcons name="person" size={28} color={UI_COLORS.primary} />
            </View>
            <View style={styles.profileMeta}>
              <Text style={styles.profileTitle}>প্রোফাইল</Text>
              <Text style={styles.profileSubtitle}>{String(user?.email || 'ইমেইল নেই')}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>সংযোগ</Text>
            <Text style={styles.infoValue}>{isOnline ? 'অনলাইন' : 'অফলাইন'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>ভূমিকা</Text>
            <Text style={styles.infoValue}>{String(user?.role || 'CASHIER')}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>শাখা</Text>
            <Text style={styles.infoValue}>{String(user?.branchId || 'ডিফল্ট')}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>লগইন অবস্থা</Text>
            <Text style={styles.infoValue}>{String(authStatus?.state || 'unknown')}</Text>
          </View>
        </AppCard>

        <AppCard>
          <Text style={styles.sectionTitle}>নিরাপত্তা</Text>
          <View style={styles.buttonGroup}>
            <AppButton title="PIN আপডেট" variant="secondary" onPress={() => navigation.navigate('UpdatePassword')} />
            <AppButton title="PIN পরিবর্তন" variant="secondary" onPress={() => navigation.navigate('SetupPin')} />
          </View>
        </AppCard>

        <AppCard>
          <Text style={styles.sectionTitle}>অ্যাপ সেটিংস</Text>
          <TouchableOpacity activeOpacity={0.86} style={styles.settingRow}>
            <MaterialIcons name="language" size={18} color={UI_COLORS.primary} />
            <Text style={styles.settingText}>ভাষা: বাংলা</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.86} style={styles.settingRow}>
            <MaterialIcons name="notifications-active" size={18} color={UI_COLORS.primary} />
            <Text style={styles.settingText}>কম স্টক বিজ্ঞপ্তি</Text>
          </TouchableOpacity>
        </AppCard>

        <AppButton title="লগআউট" onPress={logout} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: UI_COLORS.background,
  },
  container: {
    flex: 1,
    gap: SPACING.md,
    padding: SPACING.lg,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileMeta: {
    flex: 1,
  },
  profileTitle: {
    ...TYPOGRAPHY.h3,
    color: UI_COLORS.textPrimary,
    fontWeight: '700',
  },
  profileSubtitle: {
    ...TYPOGRAPHY.body,
    color: UI_COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: UI_COLORS.border,
    paddingTop: SPACING.sm,
    marginTop: SPACING.sm,
  },
  infoLabel: {
    ...TYPOGRAPHY.small,
    color: UI_COLORS.textMuted,
  },
  infoValue: {
    ...TYPOGRAPHY.small,
    color: UI_COLORS.textPrimary,
    fontWeight: '700',
  },
  sectionTitle: {
    ...TYPOGRAPHY.subheading,
    color: UI_COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  buttonGroup: {
    gap: SPACING.sm,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    backgroundColor: UI_COLORS.surfaceSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  settingText: {
    ...TYPOGRAPHY.body,
    color: UI_COLORS.textPrimary,
  },
});
