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
    outputRange: [-16, 10],
  });

  const sideBlobShift = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [18, -14],
  });

  const stripeShift = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 28],
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
          <View style={styles.glassCard}>
            <Text style={styles.eyebrow}>{eyebrow}</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
            <View style={styles.formColumn}>{children}</View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export const AUTH_FORM_STYLES = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: '#E5E9EF',
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.86)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#1A1C1E',
    fontSize: 15,
    fontWeight: '600',
  },
  primaryButton: {
    marginTop: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#375DFB',
    backgroundColor: '#2F66E5',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    minHeight: 48,
    shadowColor: '#375DFB',
    shadowOpacity: 0.35,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  primaryButtonDisabled: {
    opacity: 0.75,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D8E1F1',
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: '#1D4ED8',
    fontSize: 13,
    fontWeight: '700',
  },
  linkButton: {
    marginTop: 8,
    alignItems: 'center',
  },
  linkText: {
    color: '#4D81E7',
    fontSize: 12,
    fontWeight: '700',
  },
  checkboxRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#9AA6B2',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  checkboxActive: {
    backgroundColor: '#375DFB',
    borderColor: '#375DFB',
  },
  checkboxTick: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  checkboxText: {
    color: '#6C7278',
    fontSize: 12,
    fontWeight: '600',
  },
  noticeStrip: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: 'rgba(254,226,226,0.84)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  noticeText: {
    color: '#991B1B',
    fontSize: 12,
    fontWeight: '700',
  },
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#E9DAC6',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 24,
    flexGrow: 1,
    justifyContent: 'center',
  },
  glassCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: 'rgba(255,255,255,0.6)',
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 20,
    shadowColor: '#8C93A3',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
    overflow: 'hidden',
  },
  backdropLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  blobWarm: {
    position: 'absolute',
    width: 520,
    height: 520,
    borderRadius: 260,
    backgroundColor: '#E5D0B4',
    top: -290,
    left: -180,
    opacity: 0.7,
  },
  blobCool: {
    position: 'absolute',
    width: 780,
    height: 780,
    borderRadius: 390,
    backgroundColor: '#C5B7EB',
    bottom: -520,
    right: -410,
    opacity: 0.9,
  },
  blobSun: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: '#D6C4F0',
    top: 140,
    left: -150,
    opacity: 0.45,
  },
  ribbon: {
    position: 'absolute',
    width: 480,
    height: 60,
    backgroundColor: '#AEB6FF',
    opacity: 0.09,
    top: 245,
    left: -120,
    borderRadius: 30,
  },
  eyebrow: {
    marginTop: 2,
    textAlign: 'center',
    fontSize: 12,
    color: '#4D81E7',
    letterSpacing: 0.2,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 6,
    textAlign: 'center',
    fontSize: 42,
    lineHeight: 46,
    color: '#111827',
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 10,
    textAlign: 'center',
    color: '#6C7278',
    fontSize: 13,
    lineHeight: 18,
  },
  formColumn: {
    marginTop: 20,
    gap: 9,
  },
});
