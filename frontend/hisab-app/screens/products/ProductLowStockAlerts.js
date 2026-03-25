import { StyleSheet, Text, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';

export default function ProductLowStockAlerts({ lowStockProducts }) {
  const lowStockCount = lowStockProducts.length;

  return (
    <View style={styles.wrap}>
      <View style={styles.badgeWrap}>
        <Text style={styles.badgeText}>{lowStockCount} items low stock</Text>
      </View>

      <Text style={styles.sectionHeading}>Low Stock Alerts</Text>
      {lowStockCount === 0 ? (
        <Text style={styles.emptyText}>No low stock products right now.</Text>
      ) : (
        lowStockProducts.map((product) => (
          <View key={`low-stock-${product.id}`} style={styles.rowCard}>
            <Text style={styles.rowTitle}>{product.name}</Text>
            <Text style={styles.rowMeta}>
              Qty: {product.quantity} / Threshold: {product.low_stock_threshold}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: UI_COLORS.surface,
    gap: 8,
  },
  badgeWrap: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF4E5',
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: { color: '#B45309', fontSize: 12, fontWeight: '700' },
  sectionHeading: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  emptyText: { color: UI_COLORS.textMuted, fontSize: 13 },
  rowCard: {
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#FFFBEB',
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  rowMeta: {
    marginTop: 2,
    fontSize: 12,
    color: UI_COLORS.textSecondary,
  },
});
