import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';
import { SPACING } from '../../theme/spacing';

/**
 * PhotoPreviewBadge
 *
 * Props:
 *   uri      {string}    Local file URI of captured/selected photo
 *   onRemove {function}  Called when user taps the delete button
 */
export default function PhotoPreviewBadge({ uri, onRemove }) {
  if (!uri) return null;

  return (
    <View style={styles.container}>
      <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
      <View style={styles.info}>
        <MaterialIcons name="check-circle" size={16} color={UI_COLORS.textSuccess} />
        <Text style={styles.label}>ছবি সংরক্ষণ হয়েছে</Text>
      </View>
      <TouchableOpacity
        style={styles.removeBtn}
        onPress={onRemove}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        activeOpacity={0.75}
      >
        <MaterialIcons name="close" size={18} color={UI_COLORS.textDanger} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: UI_COLORS.borderSuccess,
    backgroundColor: UI_COLORS.surfaceSuccess,
    padding: SPACING.sm,
    gap: SPACING.sm,
  },
  thumb: {
    width: 56,
    height: 72,
    borderRadius: 8,
    backgroundColor: UI_COLORS.surfaceMuted,
  },
  info: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: UI_COLORS.textSuccess,
  },
  removeBtn: {
    padding: 4,
  },
});
