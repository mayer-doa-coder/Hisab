import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState } from 'react';
import { Alert, Image, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '../components/ui';
import { UI_COLORS } from '../constants/ui-theme';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { SPACING } from '../theme/spacing';
import { TYPOGRAPHY } from '../theme/typography';
import { localizePersonName } from '../utils/bilingualText';

export default function ProfileScreen() {
  const navigation = useNavigation();
  const {
    user,
    authDeviceProfile,
    logout,
    updateProfile,
    updateDevicePreferences,
  } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(String(user?.name || ''));
  const [busy, setBusy] = useState(false);

  const localizedName = useMemo(() => {
    const baseName = String(user?.name || '').trim() || t('profile.noName');
    return localizePersonName(baseName, language);
  }, [language, t, user?.name]);

  const profileImageUri = String(user?.profileImageUrl || user?.profile_image_uri || '').trim() || null;

  const handleSaveName = async () => {
    if (busy) {
      return;
    }
    const nextName = String(nameDraft || '').trim();
    if (!nextName) {
      Alert.alert(t('common.error'), t('auth.error.nameRequired'));
      return;
    }

    try {
      setBusy(true);
      await updateProfile({ name: nextName, profileImageUri });
      setEditingName(false);
      Alert.alert(t('common.confirm'), t('profile.updateSuccess'));
    } catch (error) {
      Alert.alert(t('common.error'), error?.message || t('profile.updateError'));
    } finally {
      setBusy(false);
    }
  };

  const handleChangePhoto = () => {
    Alert.alert(
      t('profile.photoPickerTitle'),
      '',
      [
        { text: t('profile.photoPickerCancel'), style: 'cancel' },
        {
          text: t('profile.photoPickerCamera'),
          onPress: async () => {
            try {
              const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
              if (cameraPermission.status !== 'granted') {
                Alert.alert(t('common.error'), t('profile.photoPermissionRequired'));
                return;
              }
              const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                quality: 0.7,
              });
              if (!result.canceled && result.assets?.[0]?.uri) {
                await updateProfile({ name: String(user?.name || '').trim(), profileImageUri: result.assets[0].uri });
              }
            } catch (error) {
              Alert.alert(t('common.error'), error?.message || t('profile.updateError'));
            }
          },
        },
        {
          text: t('profile.photoPickerGallery'),
          onPress: async () => {
            try {
              const mediaPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (mediaPermission.status !== 'granted') {
                Alert.alert(t('common.error'), t('profile.photoPermissionRequired'));
                return;
              }
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                quality: 0.7,
              });
              if (!result.canceled && result.assets?.[0]?.uri) {
                await updateProfile({ name: String(user?.name || '').trim(), profileImageUri: result.assets[0].uri });
              }
            } catch (error) {
              Alert.alert(t('common.error'), error?.message || t('profile.updateError'));
            }
          },
        },
      ]
    );
  };

  const handleLowStockToggle = async (nextValue) => {
    try {
      await updateDevicePreferences({ lowStockNotificationsEnabled: nextValue });
    } catch (error) {
      Alert.alert(t('common.error'), error?.message || t('common.retry'));
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* ── Identity card ─────────────────────────────────────── */}
        <View style={styles.identityCard}>
          {/* Avatar — tap to change photo */}
          <TouchableOpacity style={styles.avatarTouchable} onPress={handleChangePhoto} activeOpacity={0.82}>
            {profileImageUri ? (
              <Image source={{ uri: profileImageUri }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarCircle}>
                <MaterialIcons name="person" size={32} color={UI_COLORS.primary} />
              </View>
            )}
            <View style={styles.cameraOverlay}>
              <MaterialIcons name="photo-camera" size={14} color="#fff" />
            </View>
          </TouchableOpacity>

          {/* Name + email column */}
          <View style={styles.identityMeta}>
            {editingName ? (
              <View style={styles.nameEditRow}>
                <TextInput
                  style={styles.nameInput}
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  placeholder={t('profile.changeUsernamePlaceholder')}
                  placeholderTextColor={UI_COLORS.textMuted}
                  autoFocus
                />
                <TouchableOpacity style={styles.saveNameBtn} onPress={handleSaveName} disabled={busy}>
                  <MaterialIcons name="check" size={18} color={UI_COLORS.textOnPrimary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cancelNameBtn}
                  onPress={() => { setEditingName(false); setNameDraft(String(user?.name || '')); }}
                >
                  <MaterialIcons name="close" size={18} color={UI_COLORS.textSecondary} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.nameRow} onPress={() => setEditingName(true)} activeOpacity={0.75}>
                <Text style={styles.profileTitle} numberOfLines={1}>{localizedName}</Text>
                <MaterialIcons name="edit" size={15} color={UI_COLORS.textMuted} style={styles.editIcon} />
              </TouchableOpacity>
            )}
            <Text style={styles.profileSubtitle} numberOfLines={1}>
              {String(user?.email || t('profile.noEmail'))}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.security')}</Text>
          <View style={styles.buttonGroup}>
            <AppButton title={t('profile.changePin')} variant="secondary" onPress={() => navigation.navigate('UpdatePassword')} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.settings')}</Text>

          {/* Language toggle */}
          <View style={styles.settingRow}>
            <MaterialIcons name="language" size={18} color={UI_COLORS.primary} />
            <Text style={styles.settingText}>{t('profile.language')}</Text>
            <View style={styles.langToggleGroup}>
              <TouchableOpacity
                activeOpacity={0.8}
                style={[styles.langToggleBtn, language === 'bn' && styles.langToggleBtnActive]}
                onPress={() => setLanguage('bn')}
              >
                <Text style={[styles.langToggleBtnText, language === 'bn' && styles.langToggleBtnTextActive]}>বাং</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.8}
                style={[styles.langToggleBtn, language === 'en' && styles.langToggleBtnActive]}
                onPress={() => setLanguage('en')}
              >
                <Text style={[styles.langToggleBtnText, language === 'en' && styles.langToggleBtnTextActive]}>EN</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.settingRow}>
            <MaterialIcons name="notifications-active" size={18} color={UI_COLORS.primary} />
            <View style={styles.settingTextWrap}>
              <Text style={styles.settingText}>{t('profile.lowStockNotifications')}</Text>
              <Text style={styles.settingSubtext}>{t('profile.lowStockNotificationsDesc')}</Text>
            </View>
            <Switch
              value={Boolean(authDeviceProfile?.lowStockNotificationsEnabled)}
              onValueChange={handleLowStockToggle}
              trackColor={{ false: UI_COLORS.border, true: UI_COLORS.primarySoft }}
              thumbColor={Boolean(authDeviceProfile?.lowStockNotificationsEnabled) ? UI_COLORS.primary : UI_COLORS.textMuted}
            />
          </View>
        </View>

        <AppButton title={t('profile.logout')} onPress={logout} />
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
  section: {
    gap: SPACING.sm,
  },

  // ── Identity card (avatar + name, not centered) ────────────────
  identityCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  avatarTouchable: {
    position: 'relative',
  },
  avatarCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2,
    borderColor: UI_COLORS.border,
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: UI_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: UI_COLORS.background,
  },
  identityMeta: {
    flex: 1,
    paddingTop: 4,
    gap: SPACING.xs,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  profileTitle: {
    ...TYPOGRAPHY.h2,
    color: UI_COLORS.textPrimary,
    flexShrink: 1,
  },
  editIcon: {
    marginTop: 2,
  },
  profileSubtitle: {
    ...TYPOGRAPHY.body,
    color: UI_COLORS.textSecondary,
  },
  nameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 8,
    backgroundColor: UI_COLORS.surface,
    color: UI_COLORS.textPrimary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    fontFamily: 'AnekBangla_600SemiBold',
    fontSize: 15,
  },
  saveNameBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: UI_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelNameBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: UI_COLORS.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: UI_COLORS.border,
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
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  settingText: {
    ...TYPOGRAPHY.body,
    color: UI_COLORS.textPrimary,
    flex: 1,
  },
  settingTextWrap: {
    flex: 1,
  },
  settingSubtext: {
    ...TYPOGRAPHY.small,
    color: UI_COLORS.textSecondary,
    marginTop: 2,
  },
  langToggleGroup: {
    flexDirection: 'row',
    gap: 4,
  },
  langToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.surface,
  },
  langToggleBtnActive: {
    backgroundColor: UI_COLORS.primary,
    borderColor: UI_COLORS.primary,
  },
  langToggleBtnText: {
    fontFamily: 'AnekBangla_600SemiBold',
    fontSize: 12,
    lineHeight: 18,
    includeFontPadding: false,
    color: UI_COLORS.textSecondary,
  },
  langToggleBtnTextActive: {
    color: UI_COLORS.surface,
  },
});
