import { Picker } from '@react-native-picker/picker';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { UI_COLORS } from '../constants/ui-theme';
import { AppButton, AppInput, AppCard } from './ui';

const formatMoney = (value) => `৳${Number(value || 0).toFixed(2)}`;

export default function ProductSelector({
  products = [],
  selectedProductId = '',
  onSelectProductId,
  quantity = '1',
  onChangeQuantity,
  unitPrice = '',
  onChangeUnitPrice,
  onAddItem,
  recentProducts = [],
  onQuickAddRecent,
}) {
  const [searchText, setSearchText] = useState('');

  const filteredProducts = useMemo(() => {
    const token = String(searchText || '').trim().toLowerCase();
    if (!token) {
      return products;
    }

    return products.filter((item) => String(item.name || '').toLowerCase().includes(token));
  }, [products, searchText]);

  const pickerSource = filteredProducts.length ? filteredProducts : products;

  return (
    <AppCard style={styles.card}>
      <Text style={styles.heading}>Quick Sell</Text>

      <Text style={styles.label}>Repeat Items</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
        {recentProducts.length === 0 ? (
          <Text style={styles.emptyHint}>No recent products yet.</Text>
        ) : (
          recentProducts.map((item) => (
            <TouchableOpacity
              key={`recent-product-${item.product_id}`}
              style={styles.quickChip}
              onPress={() => onQuickAddRecent?.(item)}
            >
              <Text style={styles.quickChipName} numberOfLines={1}>
                {item.product_name}
              </Text>
              <Text style={styles.quickChipMeta}>{formatMoney(item.last_unit_price)}</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <Text style={styles.label}>Search Product</Text>
      <AppInput value={searchText} onChangeText={setSearchText} placeholder="Type product name" />

      <Text style={styles.label}>Product</Text>
      <View style={styles.pickerWrap}>
        <Picker selectedValue={selectedProductId} onValueChange={(value) => onSelectProductId?.(String(value))}>
          {pickerSource.map((item) => (
            <Picker.Item
              key={`sales-product-${item.id}`}
              label={`${item.name} (Stock: ${item.quantity})`}
              value={String(item.id)}
            />
          ))}
        </Picker>
      </View>

      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.label}>Qty</Text>
          <AppInput value={quantity} onChangeText={onChangeQuantity} keyboardType="number-pad" placeholder="1" />
        </View>
        <View style={styles.col}>
          <Text style={styles.label}>Price</Text>
          <AppInput value={unitPrice} onChangeText={onChangeUnitPrice} keyboardType="decimal-pad" placeholder="Auto" />
        </View>
      </View>

      <AppButton title="Add To Cart" onPress={onAddItem} />
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 8,
  },
  heading: {
    fontSize: 18,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  label: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: UI_COLORS.textSecondary,
  },
  quickRow: {
    gap: 8,
    paddingRight: 6,
    minHeight: 44,
  },
  quickChip: {
    width: 120,
    borderWidth: 1,
    borderColor: UI_COLORS.borderInfo,
    backgroundColor: UI_COLORS.surfaceInfo,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  quickChipName: {
    fontSize: 12,
    fontWeight: '700',
    color: UI_COLORS.primary,
  },
  quickChipMeta: {
    marginTop: 2,
    fontSize: 11,
    color: UI_COLORS.textSecondary,
  },
  emptyHint: {
    fontSize: 12,
    color: UI_COLORS.textMuted,
    marginTop: 8,
  },
  pickerWrap: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: UI_COLORS.surface,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  col: {
    flex: 1,
    gap: 4,
  },
});
