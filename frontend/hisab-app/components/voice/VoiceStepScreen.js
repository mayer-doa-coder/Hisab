import { StyleSheet, Text, View } from 'react-native';

import { AppCard } from '../ui';
import { UI_COLORS } from '../../constants/ui-theme';

function parseStep(label) {
  const match = String(label || '').match(/(\d+)\s*\/\s*(\d+)/);
  return match ? { current: Number(match[1]), total: Number(match[2]) } : null;
}

function StepDots({ current, total }) {
  return (
    <View style={dotStyles.row}>
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
        <View
          key={n}
          style={[
            dotStyles.dot,
            n < current  && dotStyles.dotDone,
            n === current && dotStyles.dotActive,
          ]}
        />
      ))}
    </View>
  );
}

export default function VoiceStepScreen({
  stepLabel,
  promptBn,
  promptEn,
  feedback,
  children,
}) {
  const step = parseStep(stepLabel);

  return (
    <AppCard style={styles.card}>
      {step ? <StepDots current={step.current} total={step.total} /> : null}
      <Text style={styles.promptBn}>{promptBn}</Text>
      {promptEn ? <Text style={styles.promptEn}>{promptEn}</Text> : null}
      {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
      <View style={styles.content}>{children}</View>
    </AppCard>
  );
}

const dotStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    marginBottom: 2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: UI_COLORS.borderSoft,
    backgroundColor: 'transparent',
  },
  dotDone: {
    backgroundColor: UI_COLORS.primary,
    borderColor: UI_COLORS.primary,
    opacity: 0.45,
  },
  dotActive: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: UI_COLORS.primary,
    borderColor: UI_COLORS.primary,
    opacity: 1,
  },
});

const styles = StyleSheet.create({
  card: {
    gap: 10,
  },
  promptBn: {
    fontSize: 24,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  promptEn: {
    fontSize: 13,
    color: UI_COLORS.textSecondary,
  },
  feedback: {
    fontSize: 13,
    color: UI_COLORS.textWarning,
    fontWeight: '600',
  },
  content: {
    gap: 10,
  },
});
