import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UI_COLORS } from '../../constants/ui-theme';
import { SPACING } from '../../theme/spacing';

// ─── Permission denied UI ─────────────────────────────────────────────────────

function PermissionDenied({ onClose }) {
  return (
    <View style={styles.centeredFill}>
      <MaterialIcons name="no-photography" size={56} color={UI_COLORS.textMuted} />
      <Text style={styles.permTitle}>ক্যামেরা অনুমতি নেই</Text>
      <Text style={styles.permBody}>
        সেটিংস থেকে ক্যামেরার অনুমতি দিন এবং আবার চেষ্টা করুন।
      </Text>
      <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
        <Text style={styles.closeBtnText}>বন্ধ করুন</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * CustomerPhotoCapture
 *
 * Props:
 *   visible      {boolean}  Modal open/close
 *   onClose      {function} Called when user dismisses without a photo
 *   onPhotoCaptured {function(uri: string)} Called with local file URI
 */
export default function CustomerPhotoCapture({ visible, onClose, onPhotoCaptured }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState('back');
  const [capturing, setCapturing] = useState(false);
  const cameraRef = useRef(null);

  const handleRequestPermission = async () => {
    const result = await requestPermission();
    if (!result.granted) {
      Alert.alert(
        'অনুমতি দরকার',
        'ক্যামেরা ব্যবহার করতে অনুমতি দিন।',
        [{ text: 'ঠিক আছে' }],
      );
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current || capturing) return;
    try {
      setCapturing(true);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        skipProcessing: Platform.OS === 'android',
      });
      onPhotoCaptured(photo.uri);
    } catch {
      Alert.alert('ত্রুটি', 'ছবি তোলা যায়নি। আবার চেষ্টা করুন।');
    } finally {
      setCapturing(false);
    }
  };

  const handlePickFromGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('অনুমতি দরকার', 'গ্যালারি অ্যাক্সেস করতে অনুমতি দিন।');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.7,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        onPhotoCaptured(result.assets[0].uri);
      }
    } catch {
      Alert.alert('ত্রুটি', 'গ্যালারি খোলা যায়নি।');
    }
  };

  const flipCamera = () => setFacing((f) => (f === 'back' ? 'front' : 'back'));

  const renderContent = () => {
    // Permission not yet requested / unknown state
    if (!permission) {
      return (
        <View style={styles.centeredFill}>
          <ActivityIndicator size="large" color={UI_COLORS.primary} />
        </View>
      );
    }

    // Permission denied
    if (!permission.granted) {
      if (permission.canAskAgain) {
        return (
          <View style={styles.centeredFill}>
            <MaterialIcons name="camera-alt" size={56} color={UI_COLORS.textMuted} />
            <Text style={styles.permTitle}>ক্যামেরা অনুমতি দরকার</Text>
            <Text style={styles.permBody}>
              কাস্টমারের ছবি তুলতে ক্যামেরার অনুমতি দিন।
            </Text>
            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: UI_COLORS.primary }]}
              onPress={handleRequestPermission}
              activeOpacity={0.8}
            >
              <Text style={[styles.closeBtnText, { color: '#fff' }]}>অনুমতি দিন</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.closeBtn, { marginTop: SPACING.sm }]} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.closeBtnText}>বাতিল</Text>
            </TouchableOpacity>
          </View>
        );
      }
      return <PermissionDenied onClose={onClose} />;
    }

    // Camera ready
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing={facing}>
          {/* Top bar */}
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.iconBtn} onPress={onClose} activeOpacity={0.8}>
              <MaterialIcons name="close" size={26} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.topBarTitle}>ছবি তুলুন</Text>
            <TouchableOpacity style={styles.iconBtn} onPress={flipCamera} activeOpacity={0.8}>
              <MaterialIcons name="flip-camera-android" size={26} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Guide frame */}
          <View style={styles.guideFrame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>

          {/* Bottom controls */}
          <View style={styles.bottomBar}>
            {/* Gallery picker */}
            <TouchableOpacity
              style={styles.galleryBtn}
              onPress={handlePickFromGallery}
              activeOpacity={0.8}
            >
              <MaterialIcons name="photo-library" size={28} color="#fff" />
              <Text style={styles.galleryBtnText}>গ্যালারি</Text>
            </TouchableOpacity>

            {/* Shutter */}
            <TouchableOpacity
              style={[styles.shutter, capturing && styles.shutterActive]}
              onPress={handleCapture}
              disabled={capturing}
              activeOpacity={0.85}
            >
              {capturing
                ? <ActivityIndicator size="small" color={UI_COLORS.primary} />
                : <View style={styles.shutterInner} />}
            </TouchableOpacity>

            {/* Spacer to balance layout */}
            <View style={styles.galleryBtn} />
          </View>
        </CameraView>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalRoot} edges={['top', 'bottom']}>
        {renderContent()}
      </SafeAreaView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CORNER_SIZE = 22;
const CORNER_WIDTH = 3;

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    backgroundColor: '#000',
  },
  centeredFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
    gap: SPACING.md,
    backgroundColor: UI_COLORS.background,
  },
  permTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
    textAlign: 'center',
  },
  permBody: {
    fontSize: 14,
    color: UI_COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  closeBtn: {
    marginTop: SPACING.md,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 10,
    backgroundColor: UI_COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
    textAlign: 'center',
  },

  // Camera
  cameraContainer: { flex: 1 },
  camera: { flex: 1 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  topBarTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Guide frame overlay (4 corners)
  guideFrame: {
    position: 'absolute',
    top: '20%',
    left: '12%',
    right: '12%',
    bottom: '25%',
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH },
  cornerTR: { top: 0, right: 0, borderTopWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH },

  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xxl,
    paddingTop: SPACING.lg,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  galleryBtn: {
    width: 64,
    alignItems: 'center',
    gap: 4,
  },
  galleryBtnText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
  },
  shutterActive: { opacity: 0.7 },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#fff',
  },
});
