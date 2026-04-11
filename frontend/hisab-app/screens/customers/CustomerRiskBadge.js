import { StyleSheet, Text, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';
import { CUSTOMER_RISK_LEVELS } from '../../services/customers/customerRiskEngine';

const getRiskStyle = (riskLevel) => {
  if (riskLevel === CUSTOMER_RISK_LEVELS.HIGH) {
    return {
      container: styles.highWrap,
      text: styles.highText,
    };
  }

  if (riskLevel === CUSTOMER_RISK_LEVELS.MEDIUM) {
    return {
      container: styles.mediumWrap,
      text: styles.mediumText,
    };
  }

  return {
    container: styles.lowWrap,
    text: styles.lowText,
  };
};

export default function CustomerRiskBadge({ riskLevel, compact = false }) {
  const normalizedRiskLevel = riskLevel || CUSTOMER_RISK_LEVELS.LOW;
  const riskStyle = getRiskStyle(normalizedRiskLevel);

  return (
    <View style={[styles.baseWrap, riskStyle.container, compact && styles.compactWrap]}>
      <Text style={[styles.baseText, riskStyle.text]}>{normalizedRiskLevel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  baseWrap: {
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  compactWrap: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  baseText: {
    fontSize: 11,
    fontWeight: '800',
  },
  lowWrap: {
    backgroundColor: UI_COLORS.surfaceSuccess,
    borderColor: UI_COLORS.borderSuccess,
  },
  lowText: {
    color: UI_COLORS.textSuccess,
  },
  mediumWrap: {
    backgroundColor: UI_COLORS.surfaceWarning,
    borderColor: UI_COLORS.borderWarning,
  },
  mediumText: {
    color: UI_COLORS.textWarning,
  },
  highWrap: {
    backgroundColor: UI_COLORS.surfaceDanger,
    borderColor: UI_COLORS.borderDanger,
  },
  highText: {
    color: UI_COLORS.textDanger,
  },
});

