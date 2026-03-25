import { StyleSheet, Text, View } from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';

const formatDateSafe = (dateString) => {
  if (!dateString) {
    return 'N/A';
  }

  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) {
    return 'Invalid date';
  }

  return parsed.toISOString().slice(0, 10);
};

function ProductExpiryRow({ item, tone = 'warning' }) {
  const isDanger = tone === 'danger';

  return (
    <View style={[styles.rowCard, isDanger ? styles.rowCardDanger : styles.rowCardWarning]}>
      <Text style={styles.rowTitle}>{item.name}</Text>
      <Text style={styles.rowMeta}>Qty: {item.quantity}</Text>
      <Text style={styles.rowMeta}>Expiry: {formatDateSafe(item.expiry_date)}</Text>
    </View>
  );
}

export default function ProductExpiryAlerts({ expiringSoonProducts, expiredProducts }) {
  const expiringSoonCount = expiringSoonProducts.length;

  return (
    <View style={styles.wrap}>
      <View style={styles.badgeWrap}>
        <Text style={styles.badgeText}>{expiringSoonCount} items expiring soon</Text>
      </View>

      <Text style={styles.sectionHeading}>Expiring Soon (next 7 days)</Text>
      {expiringSoonCount === 0 ? (
        <Text style={styles.emptyText}>No products expiring soon.</Text>
      ) : (
        expiringSoonProducts.map((product) => (
          <ProductExpiryRow key={`soon-${product.id}`} item={product} tone="warning" />
        ))
      )}

      <Text style={styles.sectionHeading}>Expired Products</Text>
      {expiredProducts.length === 0 ? (
        <Text style={styles.emptyText}>No expired products.</Text>
      ) : (
        expiredProducts.map((product) => <ProductExpiryRow key={`expired-${product.id}`} item={product} tone="danger" />)
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
    backgroundColor: '#E7EEFF',
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: { color: UI_COLORS.primary, fontSize: 12, fontWeight: '700' },
  sectionHeading: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  emptyText: { color: UI_COLORS.textMuted, fontSize: 13 },
  rowCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  rowCardWarning: {
    borderColor: '#FCD34D',
    backgroundColor: '#FFFBEB',
  },
  rowCardDanger: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
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
