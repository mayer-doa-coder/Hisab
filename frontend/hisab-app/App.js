import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { registerRootComponent } from 'expo';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppDataContext } from './context/AppDataContext';
import {
  addBaki as dbAddBaki,
  addCustomer as dbAddCustomer,
  createTables,
  deleteBaki as dbDeleteBaki,
  deleteCustomer as dbDeleteCustomer,
  deleteProduct as dbDeleteProduct,
  fetchBakiWithCustomer,
  fetchCustomers,
  fetchProducts,
  insertProduct,
  updateBakiStatus as dbUpdateBakiStatus,
  updateCustomer as dbUpdateCustomer,
  updateProduct as dbUpdateProduct,
} from './database/db';
import BakiListScreen from './screens/BakiListScreen';
import CustomerListScreen from './screens/CustomerListScreen';
import ProductListScreen from './screens/ProductListScreen';
import { UI_COLORS } from './constants/ui-theme';

const Tab = createBottomTabNavigator();

const AppTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: UI_COLORS.background,
    card: UI_COLORS.surface,
    text: UI_COLORS.textPrimary,
    border: UI_COLORS.border,
    primary: UI_COLORS.primary,
  },
};

function BootLoading() {
  return (
    <SafeAreaView style={styles.loadingSafeArea}>
      <View style={styles.loadingCard}>
        <ActivityIndicator size="large" color={UI_COLORS.primary} />
        <Text style={styles.loadingTitle}>Preparing Hisab</Text>
        <Text style={styles.loadingSubtitle}>Loading products, customers, and baki data...</Text>
      </View>
    </SafeAreaView>
  );
}

function AppContent() {
  const insets = useSafeAreaInsets();
  const [booting, setBooting] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [bakiRows, setBakiRows] = useState([]);

  const loadAllData = useCallback(async () => {
    const [productRows, customerRows, bakiHistoryRows] = await Promise.all([
      fetchProducts(),
      fetchCustomers(),
      fetchBakiWithCustomer(),
    ]);

    setProducts(productRows);
    setCustomers(customerRows);
    setBakiRows(bakiHistoryRows);
  }, []);

  useEffect(() => {
    const boot = async () => {
      try {
        await createTables();
        await loadAllData();
      } catch (error) {
        console.error('[APP] boot failed:', error);
      } finally {
        setBooting(false);
      }
    };

    boot();
  }, [loadAllData]);

  const refreshAll = useCallback(async () => {
    try {
      setRefreshing(true);
      await loadAllData();
    } finally {
      setRefreshing(false);
    }
  }, [loadAllData]);

  const addProduct = useCallback(
    async ({ name, quantity, price }) => {
      const saved = await insertProduct({ name, quantity, price });
      await refreshAll();
      return saved;
    },
    [refreshAll]
  );

  const updateProduct = useCallback(
    async ({ id, name, quantity, price }) => {
      const updated = await dbUpdateProduct({ id, name, quantity, price });
      await refreshAll();
      return updated;
    },
    [refreshAll]
  );

  const deleteProduct = useCallback(
    async (id) => {
      const deleted = await dbDeleteProduct(id);
      await refreshAll();
      return deleted;
    },
    [refreshAll]
  );

  const addCustomer = useCallback(
    async ({ name, phone, address }) => {
      const saved = await dbAddCustomer({ name, phone, address });
      await refreshAll();
      return saved;
    },
    [refreshAll]
  );

  const updateCustomer = useCallback(
    async ({ id, name, phone, address }) => {
      const updated = await dbUpdateCustomer({ id, name, phone, address });
      await refreshAll();
      return updated;
    },
    [refreshAll]
  );

  const deleteCustomer = useCallback(
    async (id) => {
      const deleted = await dbDeleteCustomer(id);
      await refreshAll();
      return deleted;
    },
    [refreshAll]
  );

  const addBaki = useCallback(
    async ({ customerId, amount, note, status }) => {
      const saved = await dbAddBaki({ customerId, amount, note, status });
      await refreshAll();
      return saved;
    },
    [refreshAll]
  );

  const updateBakiStatus = useCallback(
    async ({ id, status, paidAmount }) => {
      const updated = await dbUpdateBakiStatus({ id, status, paidAmount });
      await refreshAll();
      return updated;
    },
    [refreshAll]
  );

  const deleteBaki = useCallback(
    async (id) => {
      const deleted = await dbDeleteBaki(id);
      await refreshAll();
      return deleted;
    },
    [refreshAll]
  );

  const contextValue = useMemo(
    () => ({
      booting,
      refreshing,
      products,
      customers,
      bakiRows,
      refreshAll,
      addProduct,
      updateProduct,
      deleteProduct,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      addBaki,
      updateBakiStatus,
      deleteBaki,
    }),
    [
      booting,
      refreshing,
      products,
      customers,
      bakiRows,
      refreshAll,
      addProduct,
      updateProduct,
      deleteProduct,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      addBaki,
      updateBakiStatus,
      deleteBaki,
    ]
  );

  if (booting) {
    return <BootLoading />;
  }

  return (
    <AppDataContext.Provider value={contextValue}>
      <NavigationContainer theme={AppTheme}>
        <Tab.Navigator
          initialRouteName="Products"
          screenOptions={({ route }) => ({
            headerStyle: {
              backgroundColor: UI_COLORS.textPrimary,
            },
            headerTintColor: UI_COLORS.surface,
            headerTitleStyle: {
              fontWeight: '700',
              letterSpacing: 0.2,
            },
            tabBarStyle: {
              height: 64 + Math.max(insets.bottom, 8),
              borderTopWidth: 0,
              elevation: 12,
              shadowColor: UI_COLORS.textPrimary,
              shadowOpacity: 0.08,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: -3 },
              paddingBottom: Math.max(insets.bottom, 8),
              paddingTop: 8,
              marginBottom: Platform.OS === 'android' ? 6 : 0,
              backgroundColor: UI_COLORS.surface,
            },
            tabBarActiveTintColor: UI_COLORS.primary,
            tabBarInactiveTintColor: '#94A3B8',
            tabBarLabelStyle: {
              fontSize: 12,
              fontWeight: '700',
            },
            tabBarIcon: ({ color, size }) => {
              if (route.name === 'Products') {
                return <MaterialIcons name="inventory-2" size={size} color={color} />;
              }

              if (route.name === 'Customers') {
                return <MaterialIcons name="groups" size={size} color={color} />;
              }

              return <MaterialIcons name="account-balance-wallet" size={size} color={color} />;
            },
          })}>
          <Tab.Screen
            name="Products"
            component={ProductListScreen}
            options={{
              title: 'Products',
              headerTitle: 'Inventory Manager',
            }}
          />
          <Tab.Screen
            name="Customers"
            component={CustomerListScreen}
            options={{
              title: 'Customers',
              headerTitle: 'Customer Manager',
            }}
          />
          <Tab.Screen
            name="Baki"
            component={BakiListScreen}
            options={{
              title: 'Baki',
              headerTitle: 'Baki List Manager',
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </AppDataContext.Provider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

registerRootComponent(App);

const styles = StyleSheet.create({
  loadingSafeArea: {
    flex: 1,
    backgroundColor: UI_COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 18,
    backgroundColor: UI_COLORS.surface,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    padding: 20,
    alignItems: 'center',
    shadowColor: UI_COLORS.textPrimary,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  loadingTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  loadingSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: UI_COLORS.textMuted,
    textAlign: 'center',
  },
});
