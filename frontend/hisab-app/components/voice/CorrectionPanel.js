import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../ui';
import { UI_COLORS } from '../../constants/ui-theme';

export default function CorrectionPanel({
  title = 'ভুল হলে ঠিক করুন',
  suggestions = [],
  onSuggestionPress,
  onRetryVoice,
  onChangeName,
  onChangeAmount,
  onChangeDate,
}) {
  const hasSuggestions = Array.isArray(suggestions) && suggestions.length > 0;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>

      {hasSuggestions ? (
        <View style={styles.row}>
          {suggestions.slice(0, 3).map((item) => (
            <AppButton
              key={item}
              variant="secondary"
              title={item}
              onPress={() => onSuggestionPress?.(item)}
              style={styles.smallButton}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.row}>
        <AppButton
          variant="secondary"
          title="আবার বলুন"
          onPress={onRetryVoice}
          style={styles.smallButton}
        />
        {onChangeName ? (
          <AppButton
            variant="secondary"
            title="নাম বদলান"
            onPress={onChangeName}
            style={styles.smallButton}
          />
        ) : null}
        {onChangeAmount ? (
          <AppButton
            variant="secondary"
            title="পরিমাণ বদলান"
            onPress={onChangeAmount}
            style={styles.smallButton}
          />
        ) : null}
        {onChangeDate ? (
          <AppButton
            variant="secondary"
            title="তারিখ বদলান"
            onPress={onChangeDate}
            style={styles.smallButton}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 12,
    backgroundColor: UI_COLORS.surface,
    padding: 12,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  smallButton: {
    minHeight: 42,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
});
