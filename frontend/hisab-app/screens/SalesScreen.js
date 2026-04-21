import { Picker } from '@react-native-picker/picker';
import { useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CartItem from '../components/CartItem';
import PaymentSelector from '../components/PaymentSelector';
import ProductSelector from '../components/ProductSelector';
import SalesHistoryItem from '../components/SalesHistoryItem';
import { AppButton, AppCard, AppInput } from '../components/ui';
import { UI_COLORS } from '../constants/ui-theme';
import { useAppData } from '../context/AppDataContext';

const formatMoney = (value) => `৳${Number(value || 0).toFixed(2)}`;

export default function SalesScreen() {
  const navigation = useNavigation();
  const {
    products,
    customers,
    createSale,
    getSalesHistory,
    getRecentSoldProducts,
    validateSalesMovementConsistency,
    refreshAll,
  } = useAppData();

  const [customerId, setCustomerId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [saleNote, setSaleNote] = useState('');
  const [paymentMode, setPaymentMode] = useState('CASH');
  const [splitPayments, setSplitPayments] = useState({ cash: '', bkash: '', nagad: '' });
  const [cartItems, setCartItems] = useState([]);
  const [salesRows, setSalesRows] = useState([]);
  const [recentProducts, setRecentProducts] = useState([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [recordingSale, setRecordingSale] = useState(false);
  const [consistency, setConsistency] = useState(null);

  useEffect(() => {
    if (!products.length) {
      setSelectedProductId('');
      return;
    }

    if (!selectedProductId || !products.some((item) => Number(item.id) === Number(selectedProductId))) {
      setSelectedProductId(String(products[0].id));
    }
  }, [products, selectedProductId]);

  const cartTotal = useMemo(() => cartItems.reduce((sum, row) => sum + Number(row.subtotal || 0), 0), [cartItems]);

  const getCartQuantityForProduct = useCallback(
    (productId, skipKey = null) => {
      return cartItems.reduce((sum, item) => {
        if (skipKey && item.key === skipKey) {
          return sum;
        }

        if (Number(item.product_id) === Number(productId)) {
          return sum + Number(item.quantity || 0);
        }

        return sum;
      }, 0);
    },
    [cartItems]
  );

  const addItemToCart = useCallback(
    ({ productId, quantityValue, unitPriceValue }) => {
      const product = products.find((item) => Number(item.id) === Number(productId));
      if (!product) {
        Alert.alert('Missing Product', 'Please select a product first.');
        return;
      }

      const normalizedQuantity = Number(quantityValue);
      if (!Number.isInteger(normalizedQuantity) || normalizedQuantity <= 0) {
        Alert.alert('Invalid Quantity', 'Quantity must be a positive integer.');
        return;
      }

      const effectiveUnitPrice = unitPriceValue === '' || unitPriceValue === null || unitPriceValue === undefined
        ? Number(product.price || 0)
        : Number(unitPriceValue);

      if (!Number.isFinite(effectiveUnitPrice) || effectiveUnitPrice < 0) {
        Alert.alert('Invalid Price', 'Unit price must be a valid non-negative number.');
        return;
      }

      const inCart = getCartQuantityForProduct(product.id);
      const inStock = Number(product.quantity || 0);
      if (inCart + normalizedQuantity > inStock) {
        Alert.alert('Stock Limit', `Only ${Math.max(0, inStock - inCart)} more unit(s) available for ${product.name}.`);
        return;
      }

      const roundedPrice = Number(effectiveUnitPrice.toFixed(2));

      setCartItems((prev) => {
        const existingIndex = prev.findIndex(
          (item) => Number(item.product_id) === Number(product.id) && Number(item.unit_price) === roundedPrice
        );

        if (existingIndex >= 0) {
          const next = [...prev];
          const existing = next[existingIndex];
          const nextQuantity = Number(existing.quantity || 0) + normalizedQuantity;
          next[existingIndex] = {
            ...existing,
            quantity: nextQuantity,
            subtotal: Number((nextQuantity * roundedPrice).toFixed(2)),
          };
          return next;
        }

        return [
          ...prev,
          {
            key: `${product.id}-${Date.now()}-${Math.random()}`,
            product_id: Number(product.id),
            product_name: String(product.name || ''),
            quantity: normalizedQuantity,
            unit_price: roundedPrice,
            subtotal: Number((normalizedQuantity * roundedPrice).toFixed(2)),
          },
        ];
      });

      setQuantity('1');
      setUnitPrice('');
      setSelectedProductId(String(product.id));
    },
    [getCartQuantityForProduct, products]
  );

  const handleAddItem = useCallback(() => {
    addItemToCart({
      productId: Number(selectedProductId),
      quantityValue: quantity,
      unitPriceValue: unitPrice,
    });
  }, [addItemToCart, quantity, selectedProductId, unitPrice]);

  const handleQuickAddRecent = useCallback(
    (recent) => {
      addItemToCart({
        productId: Number(recent.product_id),
        quantityValue: 1,
        unitPriceValue: Number(recent.last_unit_price || 0),
      });
    },
    [addItemToCart]
  );

  const handleIncrementItem = useCallback(
    (itemKey) => {
      setCartItems((prev) => {
        const idx = prev.findIndex((item) => item.key === itemKey);
        if (idx < 0) {
          return prev;
        }

        const row = prev[idx];
        const product = products.find((item) => Number(item.id) === Number(row.product_id));
        if (!product) {
          return prev;
        }

        const inStock = Number(product.quantity || 0);
        const inCartOther = getCartQuantityForProduct(row.product_id, row.key);
        const nextQuantity = Number(row.quantity || 0) + 1;

        if (nextQuantity + inCartOther > inStock) {
          Alert.alert('Stock Limit', `No more stock available for ${product.name}.`);
          return prev;
        }

        const next = [...prev];
        next[idx] = {
          ...row,
          quantity: nextQuantity,
          subtotal: Number((nextQuantity * Number(row.unit_price || 0)).toFixed(2)),
        };
        return next;
      });
    },
    [getCartQuantityForProduct, products]
  );

  const handleDecrementItem = useCallback((itemKey) => {
    setCartItems((prev) => {
      const idx = prev.findIndex((item) => item.key === itemKey);
      if (idx < 0) {
        return prev;
      }

      const row = prev[idx];
      const nextQuantity = Number(row.quantity || 0) - 1;
      if (nextQuantity <= 0) {
        return prev.filter((item) => item.key !== itemKey);
      }

      const next = [...prev];
      next[idx] = {
        ...row,
        quantity: nextQuantity,
        subtotal: Number((nextQuantity * Number(row.unit_price || 0)).toFixed(2)),
      };
      return next;
    });
  }, []);

  const handleRemoveItem = useCallback((itemKey) => {
    setCartItems((prev) => prev.filter((item) => item.key !== itemKey));
  }, []);

  const loadRecentSalesRows = useCallback(async () => {
    try {
      setLoadingRows(true);
      const [historyRows, hotProducts, consistencyRow] = await Promise.all([
        getSalesHistory({ limit: 25 }),
        getRecentSoldProducts({ limit: 10 }),
        validateSalesMovementConsistency({}),
      ]);
      setSalesRows(historyRows);
      setRecentProducts(hotProducts);
      setConsistency(consistencyRow);
    } finally {
      setLoadingRows(false);
    }
  }, [getRecentSoldProducts, getSalesHistory, validateSalesMovementConsistency]);

  useEffect(() => {
    loadRecentSalesRows();
  }, [loadRecentSalesRows]);

  const buildPaymentsPayload = useCallback(() => {
    if (paymentMode !== 'MIXED') {
      return [
        {
          amount: Number(cartTotal.toFixed(2)),
          method: paymentMode,
          status: 'PAID',
        },
      ];
    }

    const paymentRows = [
      { method: 'CASH', amount: Number(splitPayments.cash || 0) },
      { method: 'BKASH', amount: Number(splitPayments.bkash || 0) },
      { method: 'NAGAD', amount: Number(splitPayments.nagad || 0) },
    ].filter((item) => Number(item.amount) > 0);

    if (!paymentRows.length) {
      throw new Error('Enter split amounts before recording a mixed payment.');
    }

    const sum = paymentRows.reduce((acc, item) => acc + Number(item.amount || 0), 0);
    if (Math.abs(sum - cartTotal) > 0.009) {
      throw new Error('Split payment amounts must match total exactly.');
    }

    return paymentRows.map((item) => ({
      amount: Number(item.amount.toFixed(2)),
      method: item.method,
      status: 'PAID',
    }));
  }, [cartTotal, paymentMode, splitPayments.bkash, splitPayments.cash, splitPayments.nagad]);

  const handleRecordSale = useCallback(async () => {
    if (!cartItems.length) {
      Alert.alert('Empty Cart', 'Add item(s) to cart first.');
      return;
    }

    if (recordingSale) {
      return;
    }

    try {
      setRecordingSale(true);
      const payments = buildPaymentsPayload();
      const result = await createSale({
        customerId: customerId ? Number(customerId) : null,
        items: cartItems.map((item) => ({
          productId: Number(item.product_id),
          quantity: Number(item.quantity),
          unitPrice: Number(item.unit_price),
        })),
        payments,
        paymentMode,
        note: saleNote || null,
      });

      setCartItems([]);
      setSaleNote('');
      setSplitPayments({ cash: '', bkash: '', nagad: '' });

      await refreshAll();
      await loadRecentSalesRows();

      Alert.alert('Sale Recorded', `${result.receipt_id} | ${formatMoney(result.total_amount)}`, [
        {
          text: 'View Receipt',
          onPress: () => navigation.navigate('Receipt', { saleId: result.id }),
        },
        { text: 'Done', style: 'cancel' },
      ]);
    } catch (error) {
      Alert.alert('Record Failed', error?.message || 'Unable to record sale right now.');
    } finally {
      setRecordingSale(false);
    }
  }, [
    buildPaymentsPayload,
    cartItems,
    createSale,
    customerId,
    loadRecentSalesRows,
    navigation,
    paymentMode,
    recordingSale,
    refreshAll,
    saleNote,
  ]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={salesRows}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={loadingRows} onRefresh={loadRecentSalesRows} tintColor={UI_COLORS.primary} />}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>Point Of Sale</Text>
            <Text style={styles.subtitle}>Tap repeat item, confirm payment, print/share receipt.</Text>

            <AppCard style={styles.card}>
              <Text style={styles.label}>Customer (Optional)</Text>
              <View style={styles.pickerWrap}>
                <Picker selectedValue={customerId} onValueChange={(value) => setCustomerId(String(value))}>
                  <Picker.Item label="Walk-in Customer" value="" />
                  {customers.map((item) => (
                    <Picker.Item key={`sales-customer-${item.id}`} label={String(item.name || '')} value={String(item.id)} />
                  ))}
                </Picker>
              </View>
            </AppCard>

            <ProductSelector
              products={products}
              selectedProductId={selectedProductId}
              onSelectProductId={setSelectedProductId}
              quantity={quantity}
              onChangeQuantity={setQuantity}
              unitPrice={unitPrice}
              onChangeUnitPrice={setUnitPrice}
              onAddItem={handleAddItem}
              recentProducts={recentProducts}
              onQuickAddRecent={handleQuickAddRecent}
            />

            <AppCard style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.sectionTitle}>Cart</Text>
                <Text style={styles.cartTotal}>Total: {formatMoney(cartTotal)}</Text>
              </View>

              {cartItems.length === 0 ? (
                <Text style={styles.emptyText}>No items yet. Use quick chips for repeat sales in under 5 taps.</Text>
              ) : (
                <View style={styles.cartList}>
                  {cartItems.map((item) => (
                    <CartItem
                      key={item.key}
                      item={item}
                      onIncrement={() => handleIncrementItem(item.key)}
                      onDecrement={() => handleDecrementItem(item.key)}
                      onRemove={() => handleRemoveItem(item.key)}
                    />
                  ))}
                </View>
              )}

              <Text style={styles.label}>Sale Note (Optional)</Text>
              <AppInput
                value={saleNote}
                onChangeText={setSaleNote}
                placeholder="Optional note"
                multiline
                numberOfLines={2}
                style={styles.noteInput}
              />
            </AppCard>

            <PaymentSelector
              totalAmount={cartTotal}
              paymentMode={paymentMode}
              onPaymentModeChange={setPaymentMode}
              splitPayments={splitPayments}
              onSplitPaymentsChange={setSplitPayments}
            />

            <View style={styles.actionRow}>
              <AppButton
                title={recordingSale ? 'Recording...' : 'Record Sale'}
                onPress={handleRecordSale}
                disabled={recordingSale || cartItems.length === 0}
                style={styles.flexButton}
              />
              <AppButton
                title="History"
                onPress={() => navigation.navigate('SalesHistory')}
                variant="secondary"
                style={styles.flexButton}
              />
            </View>

            {consistency ? (
              <Text style={[styles.consistencyText, !consistency.is_consistent ? styles.consistencyWarn : null]}>
                Movement Check: {consistency.is_consistent ? 'Consistent' : `Mismatch (${consistency.difference})`}
              </Text>
            ) : null}

            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>Recent Sales</Text>
              <AppButton title="Refresh" onPress={loadRecentSalesRows} variant="secondary" style={styles.refreshButton} />
            </View>
          </View>
        }
        ListEmptyComponent={<Text style={styles.emptyText}>{loadingRows ? 'Loading sales...' : 'No sales yet.'}</Text>}
        renderItem={({ item }) => (
          <SalesHistoryItem
            item={item}
            onOpenReceipt={() => navigation.navigate('Receipt', { saleId: item.id })}
            onReprint={() => navigation.navigate('Receipt', { saleId: item.id, autoShare: true })}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: UI_COLORS.background,
  },
  container: {
    padding: 14,
    paddingBottom: 20,
    gap: 10,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: UI_COLORS.textPrimary,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 10,
    fontSize: 13,
    color: UI_COLORS.textSecondary,
  },
  card: {
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: UI_COLORS.textSecondary,
  },
  pickerWrap: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: UI_COLORS.surface,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  cartList: {
    gap: 8,
  },
  cartTotal: {
    fontSize: 15,
    fontWeight: '800',
    color: UI_COLORS.primary,
  },
  emptyText: {
    fontSize: 13,
    color: UI_COLORS.textMuted,
    marginTop: 4,
  },
  noteInput: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  flexButton: {
    flex: 1,
  },
  consistencyText: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: UI_COLORS.textSuccess,
  },
  consistencyWarn: {
    color: UI_COLORS.textDanger,
  },
  refreshButton: {
    minHeight: 40,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
});
