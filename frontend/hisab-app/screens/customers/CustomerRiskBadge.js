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
    backgroundColor: '#ECFDF3',
    borderColor: '#BBF7D0',
  },
  lowText: {
    color: '#166534',
  },
  mediumWrap: {
    backgroundColor: '#FEF9C3',
    borderColor: '#FDE68A',
  },
  mediumText: {
    color: '#A16207',
  },
  highWrap: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  highText: {
    color: UI_COLORS.danger,
  },
});
