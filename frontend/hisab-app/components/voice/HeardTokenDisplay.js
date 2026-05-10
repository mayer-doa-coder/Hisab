import { StyleSheet, Text, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';
import ConfidenceIndicator from './ConfidenceIndicator';

export default function HeardTokenDisplay({ heardText, acceptedToken, confidence = 0 }) {
  const visibleText = String(acceptedToken || heardText || '').trim();
  if (!visibleText) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>আপনি বলেছেন</Text>
      <Text style={styles.value}>{visibleText}</Text>
      <ConfidenceIndicator score={confidence} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
    borderRadius: 12,
    padding: 12,
    backgroundColor: UI_COLORS.surfaceSoft,
  },
  title: {
    fontSize: 11,
    fontWeight: '700',
    color: UI_COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 20,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
});
