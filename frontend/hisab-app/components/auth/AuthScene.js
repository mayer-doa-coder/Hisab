import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AuthScene({ eyebrow = 'Hisab Secure', title, subtitle, children }) {
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 4800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 4800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => {
      loop.stop();
    };
  }, [drift]);

  const topBlobShift = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [-10, 14],
  });

  const sideBlobShift = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [12, -12],
  });

  const stripeShift = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 22],
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <View pointerEvents="none" style={styles.backdropLayer}>
        <Animated.View style={[styles.blobWarm, { transform: [{ translateY: topBlobShift }] }]} />
        <Animated.View style={[styles.blobCool, { transform: [{ translateX: sideBlobShift }] }]} />
        <Animated.View style={[styles.blobSun, { transform: [{ translateY: sideBlobShift }] }]} />
        <Animated.View style={[styles.ribbon, { transform: [{ translateX: stripeShift }, { rotate: '-14deg' }] }]} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <View style={styles.formColumn}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export const AUTH_FORM_STYLES = StyleSheet.create({
  input: {
    borderBottomWidth: 2,
    borderBottomColor: '#16324F',
    backgroundColor: 'transparent',
    paddingHorizontal: 2,
    paddingVertical: 13,
    color: '#102A43',
    fontSize: 16,
    fontWeight: '600',
  },
  primaryButton: {
    marginTop: 14,
    borderRadius: 999,
    backgroundColor: '#16324F',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    minHeight: 52,
    shadowColor: '#16324F',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  primaryButtonDisabled: {
    opacity: 0.75,
  },
  primaryButtonText: {
    color: '#FFF8EE',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  secondaryButton: {
    marginTop: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#16324F',
    backgroundColor: '#F4F9FF',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: '#16324F',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  linkButton: {
    marginTop: 8,
    alignItems: 'center',
  },
  linkText: {
    color: '#0A9396',
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  checkboxRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#16324F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: '#0A9396',
    borderColor: '#0A9396',
  },
  checkboxTick: {
    color: '#FFF8EE',
    fontSize: 12,
    fontWeight: '900',
  },
  checkboxText: {
    color: '#1E293B',
    fontSize: 13,
    fontWeight: '700',
  },
  noticeStrip: {
    marginTop: 6,
    borderLeftWidth: 3,
    borderColor: '#C96B1E',
    backgroundColor: '#FFF3DD',
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 8,
  },
  noticeText: {
    color: '#78350F',
    fontSize: 12,
    fontWeight: '700',
  },
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFF9F1',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 24,
    flexGrow: 1,
    justifyContent: 'center',
  },
  backdropLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  blobWarm: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 120,
    backgroundColor: '#FFB084',
    top: -60,
    right: -70,
    opacity: 0.38,
  },
  blobCool: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 90,
    backgroundColor: '#7AD8E6',
    bottom: 120,
    left: -60,
    opacity: 0.34,
  },
  blobSun: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FFD166',
    bottom: 40,
    right: 12,
    opacity: 0.28,
  },
  ribbon: {
    position: 'absolute',
    width: 360,
    height: 42,
    backgroundColor: '#0A9396',
    opacity: 0.08,
    top: 150,
    left: -80,
    borderRadius: 26,
  },
  eyebrow: {
    fontSize: 12,
    color: '#0A9396',
    letterSpacing: 2,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 6,
    fontSize: 40,
    lineHeight: 44,
    color: '#16324F',
    fontWeight: '900',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: undefined }),
  },
  subtitle: {
    marginTop: 8,
    color: '#334E68',
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 340,
  },
  formColumn: {
    marginTop: 22,
    gap: 8,
  },
});
