import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { UI_COLORS } from '../constants/ui-theme';

const formatMoney = (value) => `৳${Number(value || 0).toFixed(2)}`;

export default function CartItem({ item, onIncrement, onDecrement, onRemove }) {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.name} numberOfLines={1}>
          {item.product_name}
        </Text>
        <TouchableOpacity style={styles.removeButton} onPress={onRemove}>
          <MaterialIcons name="delete-outline" size={16} color={UI_COLORS.textDanger} />
          <Text style={styles.removeText}>সরান</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.meta}>{formatMoney(item.unit_price)} প্রতিটি</Text>

      <View style={styles.controlsRow}>
        <View style={styles.quantityPill}>
          <TouchableOpacity style={styles.qtyButton} onPress={onDecrement}>
            <MaterialIcons name="remove" size={18} color={UI_COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.qtyValue}>{Number(item.quantity || 0)}</Text>
          <TouchableOpacity style={styles.qtyButton} onPress={onIncrement}>
            <MaterialIcons name="add" size={18} color={UI_COLORS.primary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.subtotal}>{formatMoney(item.subtotal)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
    borderRadius: 12,
    padding: 10,
    backgroundColor: UI_COLORS.surfaceSubtle,
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  name: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  removeButton: {
    borderWidth: 1,
    borderColor: UI_COLORS.borderDanger,
    backgroundColor: UI_COLORS.surfaceDanger,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  removeText: {
    fontSize: 11,
    fontWeight: '700',
    color: UI_COLORS.textDanger,
  },
  meta: {
    fontSize: 12,
    color: UI_COLORS.textSecondary,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quantityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 999,
    backgroundColor: UI_COLORS.surface,
  },
  qtyButton: {
    width: 34,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValue: {
    minWidth: 24,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  subtotal: {
    fontSize: 15,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
});
