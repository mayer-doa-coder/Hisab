import { registerRootComponent } from 'expo';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  addBaki,
  addCustomer,
  createTables,
  fetchBakiWithCustomer,
  fetchCustomers,
  fetchProducts,
  insertProduct,
} from './database/db';

export default function App() {
  const [customers, setCustomers] = useState([]);
  const [bakiRows, setBakiRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSection, setActiveSection] = useState('products');

  const [productName, setProductName] = useState('');
  const [productQuantity, setProductQuantity] = useState('');
  const [productPrice, setProductPrice] = useState('');

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');

  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [bakiAmount, setBakiAmount] = useState('');
  const [bakiNote, setBakiNote] = useState('');
  const [bakiStatus, setBakiStatus] = useState('unpaid');

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId) || null,
    [customers, selectedCustomerId]
  );

  const loadData = useCallback(async () => {
    try {
      const [customerRows, bakiHistoryRows, productRows] = await Promise.all([
        fetchCustomers(),
        fetchBakiWithCustomer(),
        fetchProducts(),
      ]);

      setCustomers(customerRows);
      setBakiRows(bakiHistoryRows);
      setProducts(productRows);
      if (!selectedCustomerId && customerRows.length > 0) {
        setSelectedCustomerId(customerRows[0].id);
      }

      console.log('[APP] customers loaded:', customerRows);
      console.log('[APP] baki history loaded:', bakiHistoryRows);
      console.log('[APP] products loaded:', productRows);
    } catch (error) {
      console.error('[APP] load data failed:', error);
    }
  }, [selectedCustomerId]);

  useEffect(() => {
    const init = async () => {
      try {
        await createTables();
        await loadData();
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleAddProduct = async () => {
    try {
      await insertProduct({
        name: productName,
        quantity: Number(productQuantity),
        price: Number(productPrice),
      });
      setProductName('');
      setProductQuantity('');
      setProductPrice('');
      await loadData();
      Alert.alert('Success', 'Product added successfully.');
    } catch (error) {
      Alert.alert('Add Product Failed', error?.message || 'Unable to add product.');
    }
  };

  const handleAddCustomer = async () => {
    try {
      const saved = await addCustomer({
        name: customerName,
        phone: customerPhone,
        address: customerAddress,
      });
      setCustomerName('');
      setCustomerPhone('');
      setCustomerAddress('');
      setSelectedCustomerId(saved.id);
      await loadData();
      Alert.alert('Success', 'Customer added successfully.');
    } catch (error) {
      Alert.alert('Add Customer Failed', error?.message || 'Unable to add customer.');
    }
  };

  const handleAddBaki = async () => {
    try {
      await addBaki({
        customerId: selectedCustomerId,
        amount: Number(bakiAmount),
        note: bakiNote,
        status: bakiStatus,
      });
      setBakiAmount('');
      setBakiNote('');
      setBakiStatus('unpaid');
      await loadData();
      Alert.alert('Success', 'Baki added successfully.');
    } catch (error) {
      Alert.alert('Add Baki Failed', error?.message || 'Unable to add baki.');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading customers and baki history...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={null}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Hisab Dashboard</Text>
        <Text style={styles.subtitle}>Manage Products, Customers, and Baki from one screen</Text>

        <View style={styles.sectionHeaderRow}>
          <View style={styles.segmentWrap}>
            {['products', 'customers', 'baki'].map((section) => {
              const selected = activeSection === section;
              return (
                <TouchableOpacity
                  key={section}
                  onPress={() => setActiveSection(section)}
                  style={[styles.segmentButton, selected && styles.segmentButtonSelected]}>
                  <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                    {section.charAt(0).toUpperCase() + section.slice(1)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh}>
            <Text style={styles.refreshButtonText}>{refreshing ? 'Refreshing...' : 'Refresh'}</Text>
          </TouchableOpacity>
        </View>

        {activeSection === 'products' && (
          <View>
            <Text style={styles.sectionTitle}>Add Product</Text>
            <TextInput
              style={styles.input}
              placeholder="Product name"
              value={productName}
              onChangeText={setProductName}
            />
            <TextInput
              style={styles.input}
              placeholder="Quantity"
              value={productQuantity}
              onChangeText={setProductQuantity}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              placeholder="Price"
              value={productPrice}
              onChangeText={setProductPrice}
              keyboardType="decimal-pad"
            />
            <TouchableOpacity style={styles.primaryButton} onPress={handleAddProduct}>
              <Text style={styles.primaryButtonText}>Add Product</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>Product List ({products.length})</Text>
            {products.length === 0 ? <Text style={styles.emptyText}>No products found.</Text> : null}
            {products.map((product) => (
              <View key={`product-${product.id}`} style={styles.card}>
                <Text style={styles.cardTitle}>{product.name}</Text>
                <Text style={styles.meta}>Quantity: {product.quantity}</Text>
                <Text style={styles.meta}>Price: ৳{Number(product.price).toFixed(2)}</Text>
              </View>
            ))}
          </View>
        )}

        {activeSection === 'customers' && (
          <View>
            <Text style={styles.sectionTitle}>Add Customer</Text>
            <TextInput
              style={styles.input}
              placeholder="Customer name"
              value={customerName}
              onChangeText={setCustomerName}
            />
            <TextInput
              style={styles.input}
              placeholder="Phone"
              value={customerPhone}
              onChangeText={setCustomerPhone}
              keyboardType="phone-pad"
            />
            <TextInput
              style={styles.input}
              placeholder="Address"
              value={customerAddress}
              onChangeText={setCustomerAddress}
            />
            <TouchableOpacity style={styles.primaryButton} onPress={handleAddCustomer}>
              <Text style={styles.primaryButtonText}>Add Customer</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>Customer List ({customers.length})</Text>
            {customers.length === 0 ? <Text style={styles.emptyText}>No customers found.</Text> : null}
            {customers.map((customer) => (
              <View key={`customer-${customer.id}`} style={styles.card}>
                <Text style={styles.cardTitle}>{customer.name}</Text>
                <Text style={styles.meta}>Phone: {customer.phone || 'N/A'}</Text>
                <Text style={styles.meta}>Address: {customer.address || 'N/A'}</Text>
                <Text style={styles.due}>Total Due: ৳{Number(customer.total_due || 0).toFixed(2)}</Text>
              </View>
            ))}
          </View>
        )}

        {activeSection === 'baki' && (
          <View>
            <Text style={styles.sectionTitle}>Add Baki</Text>
            <Text style={styles.meta}>Select Customer</Text>
            <View style={styles.chipWrap}>
              {customers.map((customer) => {
                const selected = selectedCustomerId === customer.id;
                return (
                  <TouchableOpacity
                    key={`chip-${customer.id}`}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => setSelectedCustomerId(customer.id)}>
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {customer.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              style={styles.input}
              placeholder="Amount"
              value={bakiAmount}
              onChangeText={setBakiAmount}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              placeholder="Note (optional)"
              value={bakiNote}
              onChangeText={setBakiNote}
            />

            <View style={styles.chipWrap}>
              {['unpaid', 'partial', 'paid'].map((status) => {
                const selected = bakiStatus === status;
                return (
                  <TouchableOpacity
                    key={`status-${status}`}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => setBakiStatus(status)}>
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{status}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, !selectedCustomer && styles.buttonDisabled]}
              disabled={!selectedCustomer}
              onPress={handleAddBaki}>
              <Text style={styles.primaryButtonText}>Add Baki</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>Baki History ({bakiRows.length})</Text>
            {bakiRows.length === 0 ? <Text style={styles.emptyText}>No baki entries found.</Text> : null}
            {bakiRows.map((item) => (
              <View key={`baki-${item.id}`} style={styles.card}>
                <Text style={styles.cardTitle}>{item.customer_name}</Text>
                <Text style={styles.meta}>Status: {item.status}</Text>
                <Text style={styles.meta}>Amount: ৳{Number(item.amount).toFixed(2)}</Text>
                <Text style={styles.meta}>Due: ৳{Number(item.due_amount).toFixed(2)}</Text>
                <Text style={styles.meta}>Note: {item.note || 'N/A'}</Text>
                <Text style={styles.date}>Created: {item.created_at}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

registerRootComponent(App);

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#4b5563',
  },
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    color: '#111827',
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 14,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 10,
    fontSize: 14,
    color: '#6b7280',
  },
  sectionHeaderRow: {
    marginTop: 14,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  segmentWrap: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  segmentButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 999,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  segmentButtonSelected: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  segmentText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '600',
  },
  segmentTextSelected: {
    color: '#fff',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginTop: 6,
    marginBottom: 8,
  },
  refreshButton: {
    backgroundColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  refreshButtonText: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 13,
    marginBottom: 8,
  },
  customerCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  due: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '700',
    color: '#b91c1c',
  },
  bakiCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  bakiName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  meta: {
    marginTop: 3,
    fontSize: 13,
    color: '#4b5563',
  },
  date: {
    marginTop: 6,
    fontSize: 12,
    color: '#6b7280',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 999,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipSelected: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  chipText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: '#fff',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
