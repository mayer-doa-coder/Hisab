import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UI_COLORS } from '../../constants/ui-theme';

export function BootLoading({
  title = 'Preparing Hisab',
  subtitle = 'Loading products, customers, and baki data...',
  compact = false,
}) {
  if (compact) {
    return (
      <SafeAreaView style={styles.loadingSafeAreaCompact}>
        <ActivityIndicator size="large" color={UI_COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.loadingSafeArea}>
      <View style={styles.loadingCard}>
        <ActivityIndicator size="large" color={UI_COLORS.primary} />
        <Text style={styles.loadingTitle}>{title}</Text>
        <Text style={styles.loadingSubtitle}>{subtitle}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingSafeAreaCompact: {
    flex: 1,
    backgroundColor: UI_COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingSafeArea: {
    flex: 1,
    backgroundColor: UI_COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 18,
    backgroundColor: UI_COLORS.surface,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    padding: 20,
    alignItems: 'center',
    shadowColor: UI_COLORS.textPrimary,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  loadingTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  loadingSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: UI_COLORS.textMuted,
    textAlign: 'center',
  },
});
