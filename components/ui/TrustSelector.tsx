/**
 * TrustSelector.tsx
 *
 * Reusable 1–5 trust-score pill selector used in both AddCustomer
 * and EditCustomer forms.
 */

import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { FontFamily, Palette, Spacing } from "../../constants/theme";
import { BodyText } from "./Typography";

interface TrustSelectorProps {
  value: number;
  onChange: (v: number) => void;
}

export const TrustSelector: React.FC<TrustSelectorProps> = ({
  value,
  onChange,
}) => (
  <View style={styles.row}>
    {([1, 2, 3, 4, 5] as const).map((n) => (
      <Pressable
        key={n}
        onPress={() => onChange(n)}
        accessibilityRole="radio"
        accessibilityLabel={`Trust score ${n}`}
        accessibilityState={{ selected: value === n }}
        style={[styles.dot, value >= n && styles.dotActive]}
      >
        <BodyText style={[styles.dotText, value >= n && styles.dotTextActive]}>
          {n}
        </BodyText>
      </Pressable>
    ))}
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  dot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Palette.grey200,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Palette.white,
  },
  dotActive: {
    backgroundColor: Palette.primary,
    borderColor: Palette.primary,
  },
  dotText: {
    fontFamily: FontFamily.sans,
    fontWeight: "600",
    color: Palette.grey400,
  },
  dotTextActive: {
    color: Palette.dark,
  },
});
