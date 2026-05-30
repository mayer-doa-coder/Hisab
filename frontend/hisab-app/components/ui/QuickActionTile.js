import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { COLORS } from '../../theme/colors';
import { SPACING } from '../../theme/spacing';
import { TYPOGRAPHY } from '../../theme/typography';

/**
 * QuickActionTile — Large-tap-target card for Dashboard quick actions.
 *
 * Rural-first design rationale:
 *  - Minimum 88dp height (2× WCAG minimum) — operable with one thumb, even
 *    on crowded countertops or while holding something
 *  - Icon is 36dp, always visible, positioned above label (no icon-only buttons)
 *  - High-contrast background tint distinguishes tiles from plain cards
 *  - Optional `badge` number shows a count (e.g., overdue baki count)
 *
 * Usage:
 *   <QuickActionTile icon="point-of-sale" label="বিক্রি" onPress={…} />
 *   <QuickActionTile icon="account-balance" label="বাকি" badge={3} onPress={…} color="#E67E22" />
 */
export default function QuickActionTile({
  icon,
  label,
  onPress,
  badge,
  color = COLORS.primary,
  tintColor,
  style,
}) {
  const bg = tintColor || `${color}18`; // 10% opacity tint of the icon color

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.tile, { backgroundColor: bg }, style]}
    >
      {/* Badge overlay */}
      {badge != null && Number(badge) > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{Number(badge) > 99 ? '99+' : String(badge)}</Text>
        </View>
      ) : null}

      {/* Icon */}
      <View style={[styles.iconRing, { backgroundColor: `${color}22` }]}>
        <MaterialIcons name={icon} size={30} color={color} />
      </View>

      {/* Label */}
      <Text style={[styles.label, { color }]} numberOfLines={2}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minHeight: 96,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    margin: SPACING.xs,
    // Subtle border for definition on varied backgrounds
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  iconRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  label: {
    ...TYPOGRAPHY.button,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  badge: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    backgroundColor: COLORS.danger,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    ...TYPOGRAPHY.small,
    fontSize: 10,
    color: '#fff',
    fontFamily: 'AnekBangla_700Bold',
  },
});
