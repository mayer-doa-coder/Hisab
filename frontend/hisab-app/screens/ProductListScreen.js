import { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

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
        Alert.alert('Success', 'Product updated successfully.');
      } else {
        await addProduct({
          name,
          quantity: Number(quantity),
          price: Number(price),
          lowStockThreshold: Number(lowStockThreshold),
          expiryDate,
        });
        Alert.alert('Success', 'Product saved successfully.');
      }

      resetForm();
    } catch (error) {
      Alert.alert('Save Failed', error?.message || 'Unable to save product.');
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
    Alert.alert('Delete Product', `Delete ${product.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteProduct(product.id);
            if (Number(editingId) === Number(product.id)) {
              resetForm();
            }
            Alert.alert('Deleted', 'Product deleted successfully.');
          } catch (error) {
            Alert.alert('Delete Failed', error?.message || 'Unable to delete product.');
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
              <Text style={styles.title}>Inventory List</Text>
              <Text style={styles.subtitle}>Manage product stock, value, and updates in real time.</Text>

              <ProductSummaryCards
                totalItems={productSummary.totalItems}
                totalQuantity={productSummary.totalQuantity}
                stockValue={productSummary.stockValue}
              />

              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search by product name or ID"
                style={styles.input}
              />

              <TouchableOpacity
                style={[styles.filterToggle, lowStockOnly && styles.filterToggleActive]}
                onPress={() => setLowStockOnly((prev) => !prev)}
              >
                <Text style={[styles.filterToggleText, lowStockOnly && styles.filterToggleTextActive]}>
                  {lowStockOnly ? 'Showing: Low Stock Only' : 'Show Low Stock Only'}
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
                <Text style={styles.sectionTitle}>Product Records</Text>
                <TouchableOpacity style={styles.refreshButton} onPress={refreshAll}>
                  <Text style={styles.refreshText}>{refreshing ? 'Refreshing...' : 'Refresh'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          }
          ListEmptyComponent={<Text style={styles.emptyText}>No product found.</Text>}
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
    backgroundColor: '#F1F5F9',
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterToggleActive: {
    backgroundColor: '#FFF4E5',
  },
  filterToggleText: {
    color: UI_COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  filterToggleTextActive: {
    color: '#B45309',
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
    backgroundColor: '#E7EEFF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  refreshText: { color: UI_COLORS.primary, fontSize: 12, fontWeight: '600' },
  emptyText: { fontSize: 14, color: UI_COLORS.textMuted },
});
