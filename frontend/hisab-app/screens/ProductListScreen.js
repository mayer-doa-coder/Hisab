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
import ProductListItem from './products/ProductListItem';
import ProductSummaryCards from './products/ProductSummaryCards';

export default function ProductListScreen() {
  const { products, addProduct, updateProduct, deleteProduct, refreshAll, refreshing } = useAppData();

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [search, setSearch] = useState('');
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

    if (!query) {
      return products;
    }

    return products.filter((product) => {
      const byName = String(product.name || '').toLowerCase().includes(query);
      const byId = String(product.id).includes(query);
      return byName || byId;
    });
  }, [products, search]);

  const resetForm = () => {
    setName('');
    setQuantity('');
    setPrice('');
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
          quantity: Number(quantity),
          price: Number(price),
        });
        Alert.alert('Success', 'Product updated successfully.');
      } else {
        await addProduct({
          name,
          quantity: Number(quantity),
          price: Number(price),
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

              <ProductForm
                editingId={editingId}
                name={name}
                quantity={quantity}
                price={price}
                setName={setName}
                setQuantity={setQuantity}
                setPrice={setPrice}
                onSave={handleSave}
                onCancel={resetForm}
                saving={saving}
                refreshing={refreshing}
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
