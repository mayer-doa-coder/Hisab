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
        <View style={styles.section}>
          <View style={styles.profileHeader}>
            <View>
              {profileImageUri ? (
                <Image source={{ uri: profileImageUri }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarCircle}>
                  <MaterialIcons name="person" size={28} color={UI_COLORS.primary} />
                </View>
              )}
            </View>
            <View style={styles.profileMeta}>
              <Text style={styles.profileTitle}>{localizedName}</Text>
              <Text style={styles.profileSubtitle}>{String(user?.email || t('profile.noEmail'))}</Text>
            </View>
          </View>

          <View style={styles.buttonGroup}>
            <AppButton title={t('profile.editPhoto')} variant="secondary" onPress={handleChangePhoto} />
            {editingName ? (
              <View style={styles.editNameWrap}>
                <TextInput
                  style={styles.editNameInput}
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  placeholder={t('profile.changeUsernamePlaceholder')}
                  placeholderTextColor={UI_COLORS.textSecondary}
                />
                <View style={styles.inlineButtons}>
                  <AppButton title={t('profile.changeUsernameSubmit')} onPress={handleSaveName} />
                  <AppButton
                    title={t('profile.changeUsernameCancel')}
                    variant="secondary"
                    onPress={() => {
                      setEditingName(false);
                      setNameDraft(String(user?.name || ''));
                    }}
                  />
                </View>
              </View>
            ) : (
              <AppButton title={t('profile.changeUsername')} variant="secondary" onPress={() => setEditingName(true)} />
            )}
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
    ...TYPOGRAPHY.h2,
    color: UI_COLORS.textPrimary,
  },
  profileSubtitle: {
    ...TYPOGRAPHY.body,
    color: UI_COLORS.textSecondary,
    marginTop: SPACING.xs,
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
  avatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  editNameWrap: {
    gap: SPACING.sm,
  },
  editNameInput: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    backgroundColor: UI_COLORS.surface,
    color: UI_COLORS.textPrimary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    ...TYPOGRAPHY.body,
  },
  inlineButtons: {
    gap: SPACING.sm,
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
