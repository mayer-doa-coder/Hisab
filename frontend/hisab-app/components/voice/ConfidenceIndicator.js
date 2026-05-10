import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, Text, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';

const clamp = (v) => Math.max(0, Math.min(1, Number(v) || 0));

const getTone = (score) => {
  if (score >= 0.8) return { label: 'বোঝা গেছে', icon: 'check-circle',  color: UI_COLORS.textSuccess };
  if (score >= 0.55) return { label: 'আবার বলুন?', icon: 'help-outline', color: UI_COLORS.textWarning };
  return               { label: 'বোঝা যায়নি',  icon: 'cancel',         color: UI_COLORS.textDanger };
};

export default function ConfidenceIndicator({ score = 0 }) {
  const normalized = clamp(score);
  if (normalized === 0) return null;
  const tone = getTone(normalized);

  return (
    <View style={styles.row}>
      <MaterialIcons name={tone.icon} size={14} color={tone.color} />
      <Text style={[styles.label, { color: tone.color }]}>{tone.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  label: { fontSize: 12, fontWeight: '700' },
});
