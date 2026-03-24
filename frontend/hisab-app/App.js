import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { registerRootComponent } from 'expo';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { AppDataContext } from './context/AppDataContext';
import {
  addBaki as dbAddBaki,
  addCustomer as dbAddCustomer,
  createTables,
  fetchBakiWithCustomer,
  fetchCustomers,
  fetchProducts,
  insertProduct,
} from './database/db';
import AddBakiScreen from './screens/AddBakiScreen';
import AddCustomerScreen from './screens/AddCustomerScreen';
import AddProductScreen from './screens/AddProductScreen';
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

export default function App() {
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

  const addCustomer = useCallback(
    async ({ name, phone, address }) => {
      const saved = await dbAddCustomer({ name, phone, address });
      await refreshAll();
      return saved;
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

  const contextValue = useMemo(
    () => ({
      booting,
      refreshing,
      products,
      customers,
      bakiRows,
      refreshAll,
      addProduct,
      addCustomer,
      addBaki,
    }),
    [booting, refreshing, products, customers, bakiRows, refreshAll, addProduct, addCustomer, addBaki]
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
              height: 64,
              borderTopWidth: 0,
              elevation: 12,
              shadowColor: UI_COLORS.textPrimary,
              shadowOpacity: 0.08,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: -3 },
              paddingBottom: 8,
              paddingTop: 8,
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
            component={AddProductScreen}
            options={{
              title: 'Products',
              headerTitle: 'Product Manager',
            }}
          />
          <Tab.Screen
            name="Customers"
            component={AddCustomerScreen}
            options={{
              title: 'Customers',
              headerTitle: 'Customer Manager',
            }}
          />
          <Tab.Screen
            name="Baki"
            component={AddBakiScreen}
            options={{
              title: 'Baki',
              headerTitle: 'Baki Manager',
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </AppDataContext.Provider>
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
