import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CartItem from '../components/CartItem';
import CustomerQuickAddModal from '../components/customers/CustomerQuickAddModal';
import SalesHistoryItem from '../components/SalesHistoryItem';
import { UI_COLORS } from '../constants/ui-theme';
import { useAppData } from '../context/AppDataContext';
import { useLanguage } from '../context/LanguageContext';

const parseAmount = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// Payment method keys — labels resolved via t() inside the component
const PAYMENT_METHOD_KEYS = [
  { key: 'CASH',  labelKey: 'payment.method.cash',  icon: 'payments' },
  { key: 'BKASH', labelKey: 'payment.method.bkash', icon: 'phone-iphone' },
  { key: 'NAGAD', labelKey: 'payment.method.nagad', icon: 'smartphone' },
  { key: 'MIXED', labelKey: 'payment.method.mixed', icon: 'call-split' },
];

export default function SalesScreen() {
  const navigation = useNavigation();
  const { t, fmtCurrency } = useLanguage();
  const {
    products,
    customers,
    addCustomer,
    createSale,
    getSalesHistory,
    getRecentSoldProducts,
    validateSalesMovementConsistency,
    refreshAll,
  } = useAppData();

  // Resolved payment methods with translated labels — rebuilds on language change
  const PAYMENT_METHODS = useMemo(
    () => PAYMENT_METHOD_KEYS.map((m) => ({ ...m, label: t(m.labelKey) })),
    [t]
  );

  // ── Flow ──────────────────────────────────────────────
  const [step, setStep] = useState(1);

  // ── Step 1: product selection ─────────────────────────
  const [productSearch, setProductSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');

  // ── Cart ──────────────────────────────────────────────
  const [cartItems, setCartItems] = useState([]);
  const [cartExpanded, setCartExpanded] = useState(false);

  // ── Step 2: payment ───────────────────────────────────
  const [customerId, setCustomerId] = useState('');
  const [paymentMode, setPaymentMode] = useState('CASH');
  const [splitPayments, setSplitPayments] = useState({ cash: '', bkash: '', nagad: '' });
  const [showNote, setShowNote] = useState(false);
  const [saleNote, setSaleNote] = useState('');

  // ── History ───────────────────────────────────────────
  const [salesRows, setSalesRows] = useState([]);
  const [recentProducts, setRecentProducts] = useState([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [recordingSale, setRecordingSale] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [consistency, setConsistency] = useState(null);

  // ── Derived ───────────────────────────────────────────
  const cartTotal = useMemo(
    () => cartItems.reduce((s, r) => s + Number(r.subtotal || 0), 0),
    [cartItems],
  );

  const filteredProducts = useMemo(() => {
    const token = productSearch.trim().toLowerCase();
    if (!token) return products;
    return products.filter((p) => String(p.name || '').toLowerCase().includes(token));
  }, [products, productSearch]);

  const selectedProduct = useMemo(
    () => products.find((p) => String(p.id) === String(selectedProductId)),
    [products, selectedProductId],
  );

  const mixedTotal =
    parseAmount(splitPayments.cash) +
    parseAmount(splitPayments.bkash) +
    parseAmount(splitPayments.nagad);
  const mixedDue = Number((cartTotal - mixedTotal).toFixed(2));
  const mixedValid = Math.abs(mixedDue) <= 0.009;

  // ── Cart operations ───────────────────────────────────
  const getCartQuantityForProduct = useCallback(
    (productId, skipKey = null) =>
      cartItems.reduce((sum, item) => {
        if (skipKey && item.key === skipKey) return sum;
        if (Number(item.product_id) === Number(productId)) return sum + Number(item.quantity || 0);
        return sum;
      }, 0),
    [cartItems],
  );

  const addItemToCart = useCallback(
    ({ productId, quantityValue, unitPriceValue }) => {
      const product = products.find((p) => Number(p.id) === Number(productId));
      if (!product) {
        Alert.alert('পণ্য নেই', 'প্রথমে একটি পণ্য বেছে নিন।');
        return;
      }

      const normalizedQty = Number(quantityValue);
      if (!Number.isInteger(normalizedQty) || normalizedQty <= 0) {
        Alert.alert('ভুল পরিমাণ', 'পরিমাণ অবশ্যই একটি ধনাত্মক পূর্ণসংখ্যা হতে হবে।');
        return;
      }

      const effectivePrice =
        unitPriceValue === '' || unitPriceValue == null
          ? Number(product.price || 0)
          : Number(unitPriceValue);

      if (!Number.isFinite(effectivePrice) || effectivePrice < 0) {
        Alert.alert('ভুল দাম', 'দাম অবশ্যই একটি বৈধ সংখ্যা হতে হবে।');
        return;
      }

      const inCart = getCartQuantityForProduct(product.id);
      const inStock = Number(product.quantity || 0);
      if (inCart + normalizedQty > inStock) {
        Alert.alert(
          'স্টক শেষ',
          `${product.name} এর জন্য আর মাত্র ${Math.max(0, inStock - inCart)} টি পাওয়া যাবে।`,
        );
        return;
      }

      const roundedPrice = Number(effectivePrice.toFixed(2));

      setCartItems((prev) => {
        const idx = prev.findIndex(
          (item) =>
            Number(item.product_id) === Number(product.id) &&
            Number(item.unit_price) === roundedPrice,
        );
        if (idx >= 0) {
          const next = [...prev];
          const existing = next[idx];
          const nextQty = Number(existing.quantity || 0) + normalizedQty;
          next[idx] = {
            ...existing,
            quantity: nextQty,
            subtotal: Number((nextQty * roundedPrice).toFixed(2)),
          };
          return next;
        }
        return [
          ...prev,
          {
            key: `${product.id}-${Date.now()}-${Math.random()}`,
            product_id: Number(product.id),
            product_name: String(product.name || ''),
            quantity: normalizedQty,
            unit_price: roundedPrice,
            subtotal: Number((normalizedQty * roundedPrice).toFixed(2)),
          },
        ];
      });

      setQuantity('1');
      setUnitPrice('');
    },
    [getCartQuantityForProduct, products],
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
    [addItemToCart],
  );

  const handleIncrementItem = useCallback(
    (itemKey) => {
      setCartItems((prev) => {
        const idx = prev.findIndex((item) => item.key === itemKey);
        if (idx < 0) return prev;
        const row = prev[idx];
        const product = products.find((p) => Number(p.id) === Number(row.product_id));
        if (!product) return prev;
        const inStock = Number(product.quantity || 0);
        const inCartOther = getCartQuantityForProduct(row.product_id, row.key);
        const nextQty = Number(row.quantity || 0) + 1;
        if (nextQty + inCartOther > inStock) {
          Alert.alert('স্টক শেষ', `${product.name} এর আর স্টক নেই।`);
          return prev;
        }
        const next = [...prev];
        next[idx] = {
          ...row,
          quantity: nextQty,
          subtotal: Number((nextQty * Number(row.unit_price || 0)).toFixed(2)),
        };
        return next;
      });
    },
    [getCartQuantityForProduct, products],
  );

  const handleDecrementItem = useCallback((itemKey) => {
    setCartItems((prev) => {
      const idx = prev.findIndex((item) => item.key === itemKey);
      if (idx < 0) return prev;
      const row = prev[idx];
      const nextQty = Number(row.quantity || 0) - 1;
      if (nextQty <= 0) return prev.filter((item) => item.key !== itemKey);
      const next = [...prev];
      next[idx] = {
        ...row,
        quantity: nextQty,
        subtotal: Number((nextQty * Number(row.unit_price || 0)).toFixed(2)),
      };
      return next;
    });
  }, []);

  const handleRemoveItem = useCallback((itemKey) => {
    setCartItems((prev) => prev.filter((item) => item.key !== itemKey));
  }, []);

  // ── Data ──────────────────────────────────────────────
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

  // ── Sale recording ────────────────────────────────────
  const buildPaymentsPayload = useCallback(() => {
    if (paymentMode !== 'MIXED') {
      return [{ amount: Number(cartTotal.toFixed(2)), method: paymentMode, status: 'PAID' }];
    }
    const rows = [
      { method: 'CASH',  amount: parseAmount(splitPayments.cash) },
      { method: 'BKASH', amount: parseAmount(splitPayments.bkash) },
      { method: 'NAGAD', amount: parseAmount(splitPayments.nagad) },
    ].filter((r) => r.amount > 0);
    if (!rows.length) throw new Error('মিক্স পেমেন্টের জন্য পরিমাণ দিন।');
    const sum = rows.reduce((acc, r) => acc + r.amount, 0);
    if (Math.abs(sum - cartTotal) > 0.009)
      throw new Error('মিক্স পরিমাণের যোগফল মোটের সমান হতে হবে।');
    return rows.map((r) => ({
      amount: Number(r.amount.toFixed(2)),
      method: r.method,
      status: 'PAID',
    }));
  }, [cartTotal, paymentMode, splitPayments]);

  const handleRecordSale = useCallback(async () => {
    if (!cartItems.length) {
      Alert.alert('কার্ট খালি', 'প্রথমে পণ্য যোগ করুন।');
      return;
    }
    if (recordingSale) return;

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
      setCustomerId('');
      setStep(1);
      setCartExpanded(false);

      await refreshAll();
      await loadRecentSalesRows();

      Alert.alert(
        'বিক্রি সম্পন্ন',
        `${result.receipt_id} | ${formatMoney(result.total_amount)}`,
        [
          { text: 'রিসিট দেখুন', onPress: () => navigation.navigate('Receipt', { saleId: result.id }) },
          { text: 'ঠিক আছে', style: 'cancel' },
        ],
      );
    } catch (error) {
      Alert.alert('রেকর্ড ব্যর্থ', error?.message || 'এখন বিক্রি রেকর্ড করা যাচ্ছে না।');
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

  // ── Step bar ──────────────────────────────────────────
  const renderStepBar = () => (
    <View style={styles.stepBar}>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => setStep(1)}
        disabled={step === 1}
        activeOpacity={0.75}
      >
        <MaterialIcons
          name="arrow-back"
          size={22}
          color={step === 2 ? UI_COLORS.primary : 'transparent'}
        />
      </TouchableOpacity>

      <View style={styles.stepIndicator}>
        <View style={[styles.stepDot, step === 1 && styles.stepDotActive]}>
          <Text style={[styles.stepDotText, step === 1 && styles.stepDotTextActive]}>1</Text>
        </View>
        <View style={[styles.stepConnector, step === 2 && styles.stepConnectorActive]} />
        <View style={[styles.stepDot, step === 2 && styles.stepDotActive]}>
          <Text style={[styles.stepDotText, step === 2 && styles.stepDotTextActive]}>2</Text>
        </View>
      </View>

      <Text style={styles.stepTitle}>
        {step === 1 ? 'পণ্য বেছে নিন' : 'পেমেন্ট'}
      </Text>
    </View>
  );

  // ── Step 1: product selection ─────────────────────────
  const renderStep1 = () => (
    <View style={styles.stepContent}>
      {/* Recent / quick-add chips */}
      {recentProducts.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>সম্প্রতি বিক্রি</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {recentProducts.map((item) => (
              <TouchableOpacity
                key={`recent-${item.product_id}`}
                style={styles.recentChip}
                onPress={() => handleQuickAddRecent(item)}
                activeOpacity={0.78}
              >
                <Text style={styles.recentChipName} numberOfLines={1}>
                  {item.product_name}
                </Text>
                <Text style={styles.recentChipPrice}>
                  {formatMoney(item.last_unit_price)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Search */}
      <View style={styles.searchRow}>
        <MaterialIcons name="search" size={18} color={UI_COLORS.textMuted} />
        <TextInput
          value={productSearch}
          onChangeText={setProductSearch}
          placeholder="পণ্য খুঁজুন..."
          placeholderTextColor={UI_COLORS.textMuted}
          style={styles.searchInput}
        />
        {productSearch ? (
          <TouchableOpacity onPress={() => setProductSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={16} color={UI_COLORS.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Product list */}
      <View style={styles.productList}>
        {filteredProducts.length === 0 ? (
          <Text style={styles.emptyHint}>কোনো পণ্য পাওয়া যায়নি।</Text>
        ) : (
          filteredProducts.map((product, index) => {
            const isSelected = String(product.id) === String(selectedProductId);
            const inCartCount = getCartQuantityForProduct(product.id);
            const inStock = Number(product.quantity || 0);
            const remaining = inStock - inCartCount;
            const outOfStock = remaining <= 0;
            const isLast = index === filteredProducts.length - 1;

            return (
              <TouchableOpacity
                key={`prod-${product.id}`}
                style={[
                  styles.productRow,
                  isSelected && styles.productRowSelected,
                  outOfStock && styles.productRowDisabled,
                  isLast && styles.productRowLast,
                ]}
                onPress={() => {
                  if (outOfStock) return;
                  setSelectedProductId(String(product.id));
                  setQuantity('1');
                  setUnitPrice('');
                }}
                activeOpacity={outOfStock ? 1 : 0.78}
              >
                <View style={styles.productInfo}>
                  <Text
                    style={[styles.productName, isSelected && styles.productNameSelected]}
                    numberOfLines={1}
                  >
                    {product.name}
                  </Text>
                  <Text style={[styles.productStock, outOfStock && styles.productStockOut]}>
                    স্টক: {remaining}
                    {inCartCount > 0 ? `  (${inCartCount} কার্টে)` : ''}
                  </Text>
                </View>
                <View style={styles.productRight}>
                  <Text
                    style={[styles.productPrice, isSelected && styles.productPriceSelected]}
                  >
                    {formatMoney(product.price)}
                  </Text>
                  {outOfStock ? (
                    <Text style={styles.outOfStockBadge}>শেষ</Text>
                  ) : isSelected ? (
                    <MaterialIcons name="check-circle" size={18} color={UI_COLORS.primary} />
                  ) : (
                    <MaterialIcons
                      name="add-circle-outline"
                      size={18}
                      color={UI_COLORS.textMuted}
                    />
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* Add panel — appears when a product is selected */}
      {selectedProduct && (
        <View style={styles.addPanel}>
          <Text style={styles.addPanelTitle} numberOfLines={1}>
            {selectedProduct.name}
          </Text>
          <View style={styles.addPanelRow}>
            <View style={styles.addPanelField}>
              <Text style={styles.fieldLabel}>পরিমাণ</Text>
              <TextInput
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="number-pad"
                style={styles.addPanelInput}
                placeholder="১"
                placeholderTextColor={UI_COLORS.textMuted}
              />
            </View>
            <View style={styles.addPanelField}>
              <Text style={styles.fieldLabel}>দাম (ঐচ্ছিক)</Text>
              <TextInput
                value={unitPrice}
                onChangeText={setUnitPrice}
                keyboardType="decimal-pad"
                style={styles.addPanelInput}
                placeholder={formatMoney(selectedProduct.price)}
                placeholderTextColor={UI_COLORS.textMuted}
              />
            </View>
            <TouchableOpacity style={styles.addBtn} onPress={handleAddItem} activeOpacity={0.84}>
              <MaterialIcons name="add-shopping-cart" size={20} color={UI_COLORS.textOnPrimary} />
              <Text style={styles.addBtnText}>যোগ</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

  // ── Step 2: payment ───────────────────────────────────
  const renderStep2 = () => (
    <View style={styles.stepContent}>
      {/* Cart summary (collapsible) */}
      <TouchableOpacity
        style={styles.cartSummary}
        onPress={() => setCartExpanded((v) => !v)}
        activeOpacity={0.82}
      >
        <View style={styles.cartSummaryLeft}>
          <MaterialIcons name="shopping-cart" size={18} color={UI_COLORS.primary} />
          <Text style={styles.cartSummaryItems}>{cartItems.length} পণ্য</Text>
        </View>
        <View style={styles.cartSummaryRight}>
          <Text style={styles.cartSummaryTotal}>{formatMoney(cartTotal)}</Text>
          <MaterialIcons
            name={cartExpanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
            size={20}
            color={UI_COLORS.primary}
          />
        </View>
      </TouchableOpacity>

      {cartExpanded && (
        <View style={styles.cartItemList}>
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

      {/* Customer selection */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>কাস্টমার (ঐচ্ছিক)</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          <TouchableOpacity
            style={[styles.customerChip, !customerId && styles.customerChipActive]}
            onPress={() => setCustomerId('')}
            activeOpacity={0.78}
          >
            <Text
              style={[styles.customerChipText, !customerId && styles.customerChipTextActive]}
            >
              ওয়াক-ইন
            </Text>
          </TouchableOpacity>
          {customers.slice(0, 6).map((c) => (
            <TouchableOpacity
              key={`cust-${c.id}`}
              style={[
                styles.customerChip,
                customerId === String(c.id) && styles.customerChipActive,
              ]}
              onPress={() => setCustomerId(String(c.id))}
              activeOpacity={0.78}
            >
              <Text
                style={[
                  styles.customerChipText,
                  customerId === String(c.id) && styles.customerChipTextActive,
                ]}
                numberOfLines={1}
              >
                {c.name}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.addCustomerChip}
            onPress={() => setShowQuickAdd(true)}
            activeOpacity={0.78}
          >
            <MaterialIcons name="add" size={14} color={UI_COLORS.success} />
            <Text style={styles.addCustomerChipText}>নতুন কাস্টমার</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Payment method — 2×2 big buttons */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>পেমেন্ট পদ্ধতি</Text>
        <View style={styles.paymentGrid}>
          {PAYMENT_METHODS.map((m) => {
            const isActive = paymentMode === m.key;
            return (
              <TouchableOpacity
                key={m.key}
                style={[styles.paymentBtn, isActive && styles.paymentBtnActive]}
                onPress={() => setPaymentMode(m.key)}
                activeOpacity={0.82}
              >
                <MaterialIcons
                  name={m.icon}
                  size={28}
                  color={isActive ? UI_COLORS.textOnPrimary : UI_COLORS.primary}
                />
                <Text style={[styles.paymentBtnLabel, isActive && styles.paymentBtnLabelActive]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Mixed split inputs */}
      {paymentMode === 'MIXED' && (
        <View style={styles.splitPanel}>
          {[
            { key: 'cash',  label: 'নগদ' },
            { key: 'bkash', label: 'বিকাশ' },
            { key: 'nagad', label: 'নগাদ' },
          ].map(({ key, label }) => (
            <View key={key} style={styles.splitRow}>
              <Text style={styles.splitLabel}>{label}</Text>
              <TextInput
                value={splitPayments[key]}
                onChangeText={(v) => setSplitPayments((p) => ({ ...p, [key]: v }))}
                keyboardType="decimal-pad"
                placeholder="০"
                placeholderTextColor={UI_COLORS.textMuted}
                style={styles.splitInput}
              />
            </View>
          ))}
          <Text style={[styles.splitDue, !mixedValid && styles.splitDueWarn]}>
            বাকি: {formatMoney(mixedDue)}
          </Text>
        </View>
      )}

      {/* Note (collapsible) */}
      <TouchableOpacity
        style={styles.noteToggle}
        onPress={() => setShowNote((v) => !v)}
        activeOpacity={0.75}
      >
        <MaterialIcons
          name={showNote ? 'expand-less' : 'expand-more'}
          size={16}
          color={UI_COLORS.textSecondary}
        />
        <Text style={styles.noteToggleText}>
          নোট {showNote ? 'বন্ধ করুন' : 'যোগ করুন'}
        </Text>
      </TouchableOpacity>
      {showNote && (
        <TextInput
          value={saleNote}
          onChangeText={setSaleNote}
          placeholder="ঐচ্ছিক নোট..."
          placeholderTextColor={UI_COLORS.textMuted}
          multiline
          numberOfLines={3}
          style={styles.noteInput}
        />
      )}

      {/* Movement consistency */}
      {consistency ? (
        <Text
          style={[styles.consistencyText, !consistency.is_consistent && styles.consistencyWarn]}
        >
          মুভমেন্ট চেক:{' '}
          {consistency.is_consistent ? 'ঠিক আছে' : `মিল নেই (${consistency.difference})`}
        </Text>
      ) : null}

      {/* Record sale CTA */}
      <TouchableOpacity
        style={[
          styles.recordBtn,
          (recordingSale || !cartItems.length) && styles.recordBtnDisabled,
        ]}
        onPress={handleRecordSale}
        disabled={recordingSale || !cartItems.length}
        activeOpacity={0.84}
      >
        <MaterialIcons name="receipt-long" size={22} color={UI_COLORS.textOnPrimary} />
        <Text style={styles.recordBtnText}>
          {recordingSale
            ? 'রেকর্ড হচ্ছে...'
            : `বিক্রি রেকর্ড করুন · ${formatMoney(cartTotal)}`}
        </Text>
      </TouchableOpacity>

      {/* History header */}
      <View style={styles.historyHeader}>
        <Text style={styles.sectionTitle}>সাম্প্রতিক বিক্রি</Text>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={loadRecentSalesRows}
          activeOpacity={0.75}
        >
          <MaterialIcons name="refresh" size={16} color={UI_COLORS.textSecondary} />
          <Text style={styles.refreshBtnText}>রিফ্রেশ</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── Cart bar (Step 1, always visible) ─────────────────
  const empty = cartItems.length === 0;
  const renderCartBar = () => (
    <View style={[styles.cartBar, empty && styles.cartBarEmpty]}>
      <View style={styles.cartBarLeft}>
        <MaterialIcons
          name="shopping-cart"
          size={20}
          color={empty ? UI_COLORS.textMuted : UI_COLORS.textOnPrimary}
        />
        {empty ? (
          <Text style={styles.cartBarEmptyText}>কার্ট খালি</Text>
        ) : (
          <View>
            <Text style={styles.cartBarCount}>{cartItems.length} পণ্য</Text>
            <Text style={styles.cartBarTotal}>{formatMoney(cartTotal)}</Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={[styles.cartBarCta, empty && styles.cartBarCtaDisabled]}
        onPress={() => setStep(2)}
        disabled={empty}
        activeOpacity={0.84}
      >
        <Text style={[styles.cartBarCtaText, empty && styles.cartBarCtaTextDisabled]}>
          পেমেন্টে যান
        </Text>
        <MaterialIcons
          name="arrow-forward"
          size={18}
          color={empty ? UI_COLORS.textMuted : UI_COLORS.textOnPrimary}
        />
      </TouchableOpacity>
    </View>
  );

  // ── Render ────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.flex}>
        <FlatList
          data={step === 2 ? salesRows : []}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[
            styles.container,
            step === 1 && { paddingBottom: 90 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={loadingRows}
              onRefresh={loadRecentSalesRows}
              tintColor={UI_COLORS.primary}
            />
          }
          ListHeaderComponent={
            <View>
              {renderStepBar()}
              {step === 1 ? renderStep1() : renderStep2()}
            </View>
          }
          ListEmptyComponent={
            step === 2 ? (
              <Text style={styles.emptyHint}>
                {loadingRows ? 'লোড হচ্ছে...' : 'কোনো বিক্রি নেই।'}
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <SalesHistoryItem
              item={item}
              onOpenReceipt={() => navigation.navigate('Receipt', { saleId: item.id })}
              onReprint={() =>
                navigation.navigate('Receipt', { saleId: item.id, autoShare: true })
              }
            />
          )}
        />

        {/* Persistent cart bar — only Step 1 */}
        {step === 1 && renderCartBar()}
      </View>
          <CustomerQuickAddModal
        visible={showQuickAdd}
        onDismiss={() => setShowQuickAdd(false)}
        onAdded={(id) => { setCustomerId(id); setShowQuickAdd(false); }}
      />
      </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: UI_COLORS.background },
  flex: { flex: 1 },
  container: { padding: 14, gap: 10 },

  // ── Step bar ────────────────────────────────────────
  stepBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
    marginBottom: 4,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: UI_COLORS.borderSoft,
    backgroundColor: UI_COLORS.surfaceSubtle,
  },
  stepDotActive: {
    backgroundColor: UI_COLORS.primary,
    borderColor: UI_COLORS.primary,
  },
  stepDotText: {
    fontSize: 12,
    fontWeight: '800',
    color: UI_COLORS.textMuted,
  },
  stepDotTextActive: { color: UI_COLORS.textOnPrimary },
  stepConnector: {
    width: 20,
    height: 2,
    backgroundColor: UI_COLORS.borderSoft,
  },
  stepConnectorActive: { backgroundColor: UI_COLORS.primary },
  stepTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    color: UI_COLORS.textPrimary,
  },

  // ── Shared section ───────────────────────────────────
  stepContent: { gap: 12 },
  section: { gap: 8 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: UI_COLORS.textSecondary,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  chipRow: { gap: 8, paddingVertical: 2 },
  emptyHint: {
    fontSize: 13,
    color: UI_COLORS.textMuted,
    padding: 14,
  },

  // ── Recent chips ────────────────────────────────────
  recentChip: {
    width: 120,
    borderWidth: 1,
    borderColor: UI_COLORS.borderInfo,
    backgroundColor: UI_COLORS.surfaceInfo,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  recentChipName: {
    fontSize: 12,
    fontWeight: '700',
    color: UI_COLORS.primary,
  },
  recentChipPrice: {
    marginTop: 2,
    fontSize: 11,
    color: UI_COLORS.textSecondary,
  },

  // ── Search ───────────────────────────────────────────
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: UI_COLORS.surface,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: UI_COLORS.textPrimary,
    paddingVertical: 0,
  },

  // ── Product list ─────────────────────────────────────
  productList: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: UI_COLORS.surface,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.borderSoft,
    gap: 8,
  },
  productRowSelected: { backgroundColor: UI_COLORS.surfaceInfo },
  productRowDisabled: { opacity: 0.45 },
  productRowLast: { borderBottomWidth: 0 },
  productInfo: { flex: 1, gap: 2 },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: UI_COLORS.textPrimary,
  },
  productNameSelected: { color: UI_COLORS.primary, fontWeight: '700' },
  productStock: { fontSize: 11, color: UI_COLORS.textMuted },
  productStockOut: { color: UI_COLORS.textDanger },
  productRight: { alignItems: 'flex-end', gap: 4 },
  productPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: UI_COLORS.textSecondary,
  },
  productPriceSelected: { color: UI_COLORS.primary },
  outOfStockBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: UI_COLORS.textDanger,
    backgroundColor: UI_COLORS.surfaceDanger,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    overflow: 'hidden',
  },

  // ── Add panel ────────────────────────────────────────
  addPanel: {
    borderWidth: 2,
    borderColor: UI_COLORS.primary,
    borderRadius: 12,
    padding: 12,
    backgroundColor: UI_COLORS.surface,
    gap: 10,
  },
  addPanelTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: UI_COLORS.primary,
  },
  addPanelRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  addPanelField: { flex: 1, gap: 4 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: UI_COLORS.textSecondary,
  },
  addPanelInput: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 15,
    color: UI_COLORS.textPrimary,
    backgroundColor: UI_COLORS.surface,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: UI_COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  addBtnText: { color: UI_COLORS.textOnPrimary, fontSize: 14, fontWeight: '700' },

  // ── Cart bar (Step 1) ────────────────────────────────
  cartBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: UI_COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  cartBarEmpty: { backgroundColor: UI_COLORS.surfaceMuted },
  cartBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cartBarCount: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.75)',
  },
  cartBarTotal: {
    fontSize: 18,
    fontWeight: '800',
    color: UI_COLORS.textOnPrimary,
  },
  cartBarEmptyText: { fontSize: 14, color: UI_COLORS.textMuted },
  cartBarCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  cartBarCtaDisabled: {
    backgroundColor: UI_COLORS.borderSoft,
    borderColor: UI_COLORS.borderSoft,
  },
  cartBarCtaText: { color: UI_COLORS.textOnPrimary, fontSize: 14, fontWeight: '700' },
  cartBarCtaTextDisabled: { color: UI_COLORS.textMuted },

  // ── Cart summary (Step 2) ────────────────────────────
  cartSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: UI_COLORS.surface,
  },
  cartSummaryLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cartSummaryItems: {
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  cartSummaryRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cartSummaryTotal: {
    fontSize: 17,
    fontWeight: '800',
    color: UI_COLORS.primary,
  },
  cartItemList: { gap: 6 },

  // ── Customer chips ───────────────────────────────────
  customerChip: {
    borderRadius: 99,
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
    backgroundColor: UI_COLORS.surfaceSubtle,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxWidth: 140,
  },
  customerChipActive: {
    backgroundColor: UI_COLORS.primary,
    borderColor: UI_COLORS.primary,
  },
  customerChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: UI_COLORS.textSecondary,
  },
  customerChipTextActive: { color: UI_COLORS.textOnPrimary },

  // ── Payment grid ─────────────────────────────────────
  paymentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  paymentBtn: {
    width: '47%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 20,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: UI_COLORS.borderSoft,
    backgroundColor: UI_COLORS.surfaceSubtle,
  },
  paymentBtnActive: {
    backgroundColor: UI_COLORS.primary,
    borderColor: UI_COLORS.primary,
  },
  paymentBtnLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: UI_COLORS.textSecondary,
  },
  paymentBtnLabelActive: { color: UI_COLORS.textOnPrimary },

  // ── Mixed split ──────────────────────────────────────
  splitPanel: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 12,
    padding: 12,
    gap: 10,
    backgroundColor: UI_COLORS.surface,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  splitLabel: {
    width: 52,
    fontSize: 13,
    fontWeight: '700',
    color: UI_COLORS.textSecondary,
  },
  splitInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 16,
    color: UI_COLORS.textPrimary,
    backgroundColor: UI_COLORS.surface,
  },
  splitDue: {
    fontSize: 13,
    fontWeight: '700',
    color: UI_COLORS.textSuccess,
    textAlign: 'right',
  },
  splitDueWarn: { color: UI_COLORS.textDanger },

  // ── Note ─────────────────────────────────────────────
  noteToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  noteToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: UI_COLORS.textSecondary,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
    color: UI_COLORS.textPrimary,
    minHeight: 72,
    textAlignVertical: 'top',
    backgroundColor: UI_COLORS.surface,
  },

  // ── CTA ──────────────────────────────────────────────
  recordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: UI_COLORS.success,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 4,
  },
  recordBtnDisabled: { opacity: 0.5 },
  recordBtnText: {
    color: UI_COLORS.textOnPrimary,
    fontSize: 16,
    fontWeight: '800',
  },

  // ── Consistency ──────────────────────────────────────
  consistencyText: {
    fontSize: 12,
    fontWeight: '700',
    color: UI_COLORS.textSuccess,
  },
  consistencyWarn: { color: UI_COLORS.textDanger },

  // ── History ──────────────────────────────────────────
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 8,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    backgroundColor: UI_COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  refreshBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: UI_COLORS.textSecondary,
  },
  addCustomerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderColor: UI_COLORS.success,
    borderRadius: 10,
    borderStyle: 'dashed',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: UI_COLORS.surfaceSuccess,
    minWidth: 72,
  },
  addCustomerChipText: { fontSize: 12, fontWeight: '700', color: UI_COLORS.success },
});
