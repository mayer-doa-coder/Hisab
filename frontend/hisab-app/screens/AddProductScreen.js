import { useEffect, useState } from 'react';
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

export default function AddProductScreen() {
  const { products, addProduct, refreshAll, refreshing } = useAppData();
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const handleSave = async () => {
    if (saving) {
      return;
    }

    try {
      setSaving(true);

      const savedProduct = await addProduct({
        name,
        quantity: Number(quantity),
        price: Number(price),
      });

      console.log('[DB] product saved:', savedProduct);

      setName('');
      setQuantity('');
      setPrice('');

      Alert.alert('Success', 'Product saved successfully. Check console logs.');
    } catch (error) {
      console.error('[DB] save failed:', error);
      Alert.alert('Save Failed', error?.message || 'Unable to save product.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <FlatList
          data={products}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View>
          <Text style={styles.title}>Add Product</Text>
          <Text style={styles.subtitle}>Fill in product details and save to SQLite.</Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Product Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Rice"
              style={styles.input}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Quantity</Text>
            <TextInput
              value={quantity}
              onChangeText={setQuantity}
              placeholder="e.g. 10"
              style={styles.input}
              keyboardType="numeric"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Price</Text>
            <TextInput
              value={price}
              onChangeText={setPrice}
              placeholder="e.g. 55.5"
              style={styles.input}
              keyboardType="decimal-pad"
            />
          </View>

          <TouchableOpacity
            style={[styles.button, saving && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Save Product'}</Text>
          </TouchableOpacity>

          <View style={styles.listHeaderRow}>
            <Text style={styles.listTitle}>Product List</Text>
            <TouchableOpacity onPress={refreshAll} style={styles.refreshButton}>
              <Text style={styles.refreshText}>{refreshing ? 'Refreshing...' : 'Refresh'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.helpText}>Products are loaded from SQLite and shown below.</Text>
            </View>
          }
          ListEmptyComponent={<Text style={styles.emptyText}>No products yet. Add your first product.</Text>}
          renderItem={({ item }) => (
            <View style={styles.productCard}>
              <Text style={styles.productName}>{item.name}</Text>
              <View style={styles.productMetaRow}>
                <Text style={styles.productMeta}>Qty: {item.quantity}</Text>
                <Text style={styles.productMeta}>Price: ৳{item.price}</Text>
              </View>
            </View>
          )}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: UI_COLORS.background,
  },
  flex: {
    flex: 1,
  },
  container: {
    padding: 20,
    gap: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: UI_COLORS.textSecondary,
    marginBottom: 8,
  },
  formGroup: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: UI_COLORS.textPrimary,
  },
  input: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: UI_COLORS.textPrimary,
    backgroundColor: UI_COLORS.surface,
  },
  button: {
    marginTop: 10,
    backgroundColor: UI_COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  helpText: {
    marginTop: 6,
    marginBottom: 10,
    fontSize: 12,
    color: UI_COLORS.textMuted,
  },
  listHeaderRow: {
    marginTop: 16,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  listTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  refreshButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#E7EEFF',
  },
  refreshText: {
    color: UI_COLORS.primary,
    fontWeight: '600',
    fontSize: 12,
  },
  emptyText: {
    fontSize: 14,
    color: UI_COLORS.textMuted,
    marginTop: 8,
  },
  productCard: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    backgroundColor: UI_COLORS.surface,
  },
  productName: {
    fontSize: 16,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  productMetaRow: {
    marginTop: 6,
    flexDirection: 'row',
    gap: 14,
  },
  productMeta: {
    fontSize: 13,
    color: UI_COLORS.textSecondary,
  },
});
