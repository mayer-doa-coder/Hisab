import { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UI_COLORS } from '../constants/ui-theme';
import { useAppData } from '../context/AppDataContext';
import ProductForm from './products/ProductForm';
import ProductExpiryAlerts from './products/ProductExpiryAlerts';
import ProductListItem from './products/ProductListItem';
import ProductLowStockAlerts from './products/ProductLowStockAlerts';
import ProductReorderSuggestions from './products/ProductReorderSuggestions';
import ProductSummaryCards from './products/ProductSummaryCards';

export default function ProductListScreen() {
  const {
    products,
    expiringSoonProducts,
    expiredProducts,
    lowStockProducts,
    reorderSuggestions,
    addProduct,
    updateProduct,
    deleteProduct,
    refreshAll,
    refreshing,
  } = useAppData();

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState('5');
  const [expiryDate, setExpiryDate] = useState('');
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const productSummary = useMemo(() => {
    const totalItems = products.length;
    const totalQuantity = products.reduce((sum, product) => sum + Number(product.quantity || 0), 0);
    const stockValue = products.reduce(
      (sum, product) => sum + Number(product.quantity || 0) * Number(product.price || 0),
      0
    );

    return {
      totalItems,
      totalQuantity,
      stockValue,
    };
  }, [products]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return products.filter((product) => {
      const byName = String(product.name || '').toLowerCase().includes(query);
      const byId = String(product.id).includes(query);
      const quantity = Number(product.quantity || 0);
      const threshold = Number.isFinite(Number(product.low_stock_threshold))
        ? Math.max(0, Math.trunc(Number(product.low_stock_threshold)))
        : 5;
      const byLowStock = !lowStockOnly || quantity <= threshold;
      const byQuery = !query || byName || byId;

      return byQuery && byLowStock;
    });
  }, [products, search, lowStockOnly]);

  const resetForm = () => {
    setName('');
    setQuantity('');
    setPrice('');
    setLowStockThreshold('5');
    setExpiryDate('');
    setEditingId(null);
  };

  const handleSave = async () => {
    if (saving) {
      return;
    }

    try {
      setSaving(true);

      if (editingId) {
        await updateProduct({
          id: editingId,
          name,
          price: Number(price),
          lowStockThreshold: Number(lowStockThreshold),
          expiryDate,
        });
        Alert.alert('সফল', 'পণ্য আপডেট হয়েছে।');
      } else {
        await addProduct({
          name,
          quantity: Number(quantity),
          price: Number(price),
          lowStockThreshold: Number(lowStockThreshold),
          expiryDate,
        });
        Alert.alert('সফল', 'পণ্য সেভ হয়েছে।');
      }

      resetForm();
    } catch (error) {
      Alert.alert('সেভ ব্যর্থ', error?.message || 'পণ্য সেভ করা যায়নি।');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (product) => {
    setEditingId(Number(product.id));
    setName(String(product.name || ''));
    setQuantity(String(product.quantity ?? ''));
    setPrice(String(product.price ?? ''));
    setLowStockThreshold(String(product.low_stock_threshold ?? 5));
    setExpiryDate(String(product.expiry_date || ''));
  };

  const handleDelete = (product) => {
    Alert.alert('পণ্য মুছুন', `${product.name} মুছে ফেলবেন?`, [
      { text: 'বাতিল', style: 'cancel' },
      {
        text: 'মুছুন',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteProduct(product.id);
            if (Number(editingId) === Number(product.id)) {
              resetForm();
            }
            Alert.alert('মুছে ফেলা হয়েছে', 'পণ্য মুছে ফেলা হয়েছে।');
          } catch (error) {
            Alert.alert('মুছতে ব্যর্থ', error?.message || 'পণ্য মুছে ফেলা যায়নি।');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View>
              <Text style={styles.title}>পণ্য তালিকা</Text>
              <Text style={styles.subtitle}>পণ্যের স্টক, মূল্য এবং তথ্য রিয়েল টাইমে পরিচালনা করুন।</Text>

              <ProductSummaryCards
                totalItems={productSummary.totalItems}
                totalQuantity={productSummary.totalQuantity}
                stockValue={productSummary.stockValue}
              />

              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="পণ্যের নাম বা আইডি দিয়ে খুঁজুন"
                style={styles.input}
              />

              <TouchableOpacity
                style={[styles.filterToggle, lowStockOnly && styles.filterToggleActive]}
                onPress={() => setLowStockOnly((prev) => !prev)}
              >
                <Text style={[styles.filterToggleText, lowStockOnly && styles.filterToggleTextActive]}>
                  {lowStockOnly ? 'দেখাচ্ছে: কম স্টক' : 'শুধু কম স্টক দেখুন'}
                </Text>
              </TouchableOpacity>

              <ProductForm
                editingId={editingId}
                name={name}
                quantity={quantity}
                price={price}
                lowStockThreshold={lowStockThreshold}
                expiryDate={expiryDate}
                setName={setName}
                setQuantity={setQuantity}
                setPrice={setPrice}
                setLowStockThreshold={setLowStockThreshold}
                setExpiryDate={setExpiryDate}
                onSave={handleSave}
                onCancel={resetForm}
                saving={saving}
                refreshing={refreshing}
              />

              <ProductLowStockAlerts lowStockProducts={lowStockProducts} />

              <ProductReorderSuggestions suggestions={reorderSuggestions} />

              <ProductExpiryAlerts
                expiringSoonProducts={expiringSoonProducts}
                expiredProducts={expiredProducts}
              />

              <View style={styles.headerRow}>
                <Text style={styles.sectionTitle}>পণ্যের তালিকা</Text>
                <TouchableOpacity style={styles.refreshButton} onPress={refreshAll}>
                  <Text style={styles.refreshText}>{refreshing ? 'রিফ্রেশ হচ্ছে...' : 'রিফ্রেশ'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          }
          ListEmptyComponent={<Text style={styles.emptyText}>কোনো পণ্য পাওয়া যায়নি।</Text>}
          renderItem={({ item }) => <ProductListItem item={item} onEdit={handleEdit} onDelete={handleDelete} />}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: UI_COLORS.background },
  flex: { flex: 1 },
  container: { padding: 16, gap: 12 },
  title: { fontSize: 26, fontWeight: '700', color: UI_COLORS.textPrimary },
  subtitle: { marginTop: 4, fontSize: 13, color: UI_COLORS.textSecondary, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: UI_COLORS.textPrimary,
    backgroundColor: UI_COLORS.surface,
  },
  filterToggle: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: UI_COLORS.surfaceMuted,
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterToggleActive: {
    backgroundColor: UI_COLORS.surfaceWarning,
  },
  filterToggleText: {
    color: UI_COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  filterToggleTextActive: {
    color: UI_COLORS.textWarning,
  },
  headerRow: {
    marginTop: 16,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: { fontSize: 19, fontWeight: '700', color: UI_COLORS.textPrimary },
  refreshButton: {
    backgroundColor: UI_COLORS.surfaceSubtle,
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  refreshText: { color: UI_COLORS.primary, fontSize: 12, fontWeight: '600' },
  emptyText: { fontSize: 14, color: UI_COLORS.textMuted },
});

