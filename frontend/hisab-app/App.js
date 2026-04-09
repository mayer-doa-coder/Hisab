import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { registerRootComponent } from 'expo';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppDataContext } from './context/AppDataContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import {
  addBaki as dbAddBaki,
  addPayment as dbAddPayment,
  addCustomer as dbAddCustomer,
  createTables,
  deleteCustomer as dbDeleteCustomer,
  deleteProduct as dbDeleteProduct,
  fetchBakiWithCustomer,
  fetchCustomers,
  fetchCustomersBasic,
  fetchProducts,
  getCustomerRiskMetrics as dbGetCustomerRiskMetrics,
  getExpiredProducts as dbGetExpiredProducts,
  getExpiringSoonProducts as dbGetExpiringSoonProducts,
  getLowStockProducts as dbGetLowStockProducts,
  getCustomerLedger as dbGetCustomerLedger,
  getBakiKpiSummary as dbGetBakiKpiSummary,
  getDashboardKpiSummary as dbGetDashboardKpiSummary,
  getDashboardTopActiveCustomers as dbGetDashboardTopActiveCustomers,
  getAuditLogs as dbGetAuditLogs,
  getProductSalesDailyAggregation as dbGetProductSalesDailyAggregation,
  getStockMovements as dbGetStockMovements,
  getStockMovementCountInRange as dbGetStockMovementCountInRange,
  insertProduct,
  addStockMovement as dbAddStockMovement,
  updateCustomer as dbUpdateCustomer,
  updateProduct as dbUpdateProduct,
} from './database/db';
import BakiListScreen from './screens/BakiListScreen';
import CustomerLedgerScreen from './screens/CustomerLedgerScreen';
import CustomerListScreen from './screens/CustomerListScreen';
import ProductDetailsScreen from './screens/ProductDetailsScreen.js';
import ProductListScreen from './screens/ProductListScreen';
import StockMovementScreen from './screens/StockMovementScreen.js';
import DashboardScreen from './screens/DashboardScreen';
import AuditHistoryScreen from './screens/AuditHistoryScreen';
import LoginScreen from './screens/auth/LoginScreen';
import SignupScreen from './screens/auth/SignupScreen';
import { applyCustomerRiskClassification, createCustomerRiskModel } from './services/customers/customerRiskEngine';
import { createReorderPredictor } from './services/reorder/reorderSuggestionEngine.js';
import { runDataSync } from './services/sync/dataSync';
import { UI_COLORS } from './constants/ui-theme';

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();
const AuthStack = createNativeStackNavigator();
const MainStack = createNativeStackNavigator();

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

function BootLoading({ title = 'Preparing Hisab', subtitle = 'Loading products, customers, and baki data...' }) {
  return (
    <SafeAreaView style={styles.loadingSafeArea}>
      <View style={styles.loadingCard}>
        <ActivityIndicator size="large" color={UI_COLORS.primary} />
        <Text style={styles.loadingTitle}>{title}</Text>
        <Text style={styles.loadingSubtitle}>{subtitle}</Text>
      </View>
    </SafeAreaView>
  );
}

function MainTabs() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      initialRouteName="Dashboard"
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

          if (route.name === 'Ledger') {
            return <MaterialIcons name="receipt-long" size={size} color={color} />;
          }

          if (route.name === 'Movement') {
            return <MaterialIcons name="swap-horiz" size={size} color={color} />;
          }

          if (route.name === 'Details') {
            return <MaterialIcons name="info-outline" size={size} color={color} />;
          }

          if (route.name === 'Dashboard') {
            return <MaterialIcons name="dashboard" size={size} color={color} />;
          }

          if (route.name === 'Audit') {
            return <MaterialIcons name="history" size={size} color={color} />;
          }

          return <MaterialIcons name="account-balance-wallet" size={size} color={color} />;
        },
      })}>
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: 'Dashboard',
          headerTitle: 'Business Dashboard',
        }}
      />
      <Tab.Screen
        name="Audit"
        component={AuditHistoryScreen}
        options={{
          title: 'Audit',
          headerTitle: 'Audit History',
        }}
      />
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
        name="Ledger"
        component={CustomerLedgerScreen}
        options={{
          title: 'Ledger',
          headerTitle: 'Customer Ledger',
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
      <Tab.Screen
        name="Movement"
        component={StockMovementScreen}
        options={{
          title: 'Movement',
          headerTitle: 'Stock Movement',
        }}
      />
      <Tab.Screen
        name="Details"
        component={ProductDetailsScreen}
        options={{
          title: 'Details',
          headerTitle: 'Product Details',
        }}
      />
    </Tab.Navigator>
  );
}

function MainStackNavigator() {
  return (
    <MainStack.Navigator screenOptions={{ headerShown: false }}>
      <MainStack.Screen name="MainTabs" component={MainTabs} />
    </MainStack.Navigator>
  );
}

function AuthStackNavigator() {
  return (
    <AuthStack.Navigator
      initialRouteName="Login"
      screenOptions={{
        headerStyle: { backgroundColor: UI_COLORS.textPrimary },
        headerTintColor: UI_COLORS.surface,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: UI_COLORS.background },
      }}>
      <AuthStack.Screen name="Login" component={LoginScreen} options={{ title: 'Login' }} />
      <AuthStack.Screen name="Signup" component={SignupScreen} options={{ title: 'Signup' }} />
    </AuthStack.Navigator>
  );
}

function MainDataShell() {
  const { user, session, isOnline } = useAuth();
  const customerRiskModel = useMemo(() => createCustomerRiskModel('rule-based'), []);
  const reorderPredictor = useMemo(() => createReorderPredictor('rule-based'), []);
  const reorderRuleConfig = useMemo(
    () => ({
      windowDays: 30,
      leadTimeDays: 3,
      reviewPeriodDays: 7,
      safetyDays: 2,
      minOrderQuantity: 1,
    }),
    []
  );
  const [booting, setBooting] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingData, setSyncingData] = useState(false);
  const syncInFlightRef = useRef(false);
  const [products, setProducts] = useState([]);
  const [expiringSoonProducts, setExpiringSoonProducts] = useState([]);
  const [expiredProducts, setExpiredProducts] = useState([]);
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [bakiRows, setBakiRows] = useState([]);
  const [reorderSuggestions, setReorderSuggestions] = useState([]);

  const loadAllData = useCallback(async () => {
    const [coreProductsResult, coreCustomersResult, coreBakiResult] = await Promise.allSettled([
      fetchProducts(),
      fetchCustomers(),
      fetchBakiWithCustomer(),
    ]);

    const productRows = coreProductsResult.status === 'fulfilled' ? coreProductsResult.value : [];
    let customerRows = coreCustomersResult.status === 'fulfilled' ? coreCustomersResult.value : [];

    if (coreCustomersResult.status !== 'fulfilled') {
      try {
        customerRows = await fetchCustomersBasic();
        console.warn('[APP] using fallback customer query due to primary query failure.');
      } catch (fallbackError) {
        console.error('[APP] fallback customer query failed:', fallbackError);
      }
    }

    const bakiHistoryRows = coreBakiResult.status === 'fulfilled' ? coreBakiResult.value : [];

    const [expiringSoonResult, expiredResult, lowStockResult, salesResult, customerRiskResult] = await Promise.allSettled([
      dbGetExpiringSoonProducts(7),
      dbGetExpiredProducts(),
      dbGetLowStockProducts(),
      dbGetProductSalesDailyAggregation({ days: reorderRuleConfig.windowDays }),
      dbGetCustomerRiskMetrics(),
    ]);

    const expiringSoonRows = expiringSoonResult.status === 'fulfilled' ? expiringSoonResult.value : [];
    const expiredRows = expiredResult.status === 'fulfilled' ? expiredResult.value : [];
    const lowStockRows = lowStockResult.status === 'fulfilled' ? lowStockResult.value : [];
    const salesRows = salesResult.status === 'fulfilled' ? salesResult.value : [];
    const customerRiskRows = customerRiskResult.status === 'fulfilled' ? customerRiskResult.value : [];

    let enrichedCustomers = customerRows;
    try {
      enrichedCustomers = applyCustomerRiskClassification(customerRows, customerRiskRows, customerRiskModel);
    } catch (error) {
      console.error('[APP] customer risk classification failed:', error);
    }

    let nextSuggestions = [];
    try {
      nextSuggestions = reorderPredictor.predict({
        products: productRows,
        salesRows,
        config: reorderRuleConfig,
      });
    } catch (error) {
      console.error('[APP] reorder suggestion calculation failed:', error);
    }

    setProducts(productRows);
    setExpiringSoonProducts(expiringSoonRows);
    setExpiredProducts(expiredRows);
    setLowStockProducts(lowStockRows);
    setCustomers(enrichedCustomers);
    setBakiRows(bakiHistoryRows);
    setReorderSuggestions(nextSuggestions);
  }, [customerRiskModel, reorderPredictor, reorderRuleConfig]);

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

  const runOnlineSync = useCallback(async () => {
    if (!isOnline || !session?.access_token || !user?.id) {
      return { synced: 0, appliedServerChanges: 0, skipped: true };
    }

    if (syncInFlightRef.current) {
      return { synced: 0, appliedServerChanges: 0, skipped: true };
    }

    syncInFlightRef.current = true;
    setSyncingData(true);
    try {
      const result = await runDataSync({
        userId: Number(user.id),
        accessToken: session.access_token,
      });

      if (Number(result?.synced || 0) > 0 || Number(result?.appliedServerChanges || 0) > 0) {
        await loadAllData();
      }

      return result;
    } catch (error) {
      console.warn('[APP] data sync skipped or failed:', error?.message || error);
      return { synced: 0, appliedServerChanges: 0, skipped: true };
    } finally {
      syncInFlightRef.current = false;
      setSyncingData(false);
    }
  }, [isOnline, loadAllData, session?.access_token, user?.id]);

  useEffect(() => {
    if (!isOnline || !session?.access_token || !user?.id) {
      return undefined;
    }

    let disposed = false;

    const run = async () => {
      if (disposed) {
        return;
      }

      await runOnlineSync();
    };

    run();
    const timer = setInterval(run, 20000);

    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [isOnline, runOnlineSync, session?.access_token, user?.id]);

  const addProduct = useCallback(
    async ({ name, quantity, price, expiryDate, lowStockThreshold }) => {
      const saved = await insertProduct({ name, quantity, price, expiryDate, lowStockThreshold });
      await refreshAll();
      return saved;
    },
    [refreshAll]
  );

  const updateProduct = useCallback(
    async ({ id, name, quantity, price, expiryDate, lowStockThreshold }) => {
      const updated = await dbUpdateProduct({ id, name, quantity, price, expiryDate, lowStockThreshold });
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

  const addStockMovement = useCallback(
    async ({ productId, movementType, quantity, note }) => {
      const saved = await dbAddStockMovement({ productId, movementType, quantity, note });
      await refreshAll();
      return saved;
    },
    [refreshAll]
  );

  const getStockMovementHistory = useCallback(async ({ productId = null, limit = 100 } = {}) => {
    return dbGetStockMovements({ productId, limit });
  }, []);

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
    async ({ customerId, amount, note }) => {
      const saved = await dbAddBaki({ customerId, amount, note });
      await refreshAll();
      return saved;
    },
    [refreshAll]
  );

  const addBakiPayment = useCallback(
    async ({ customerId, amount, note, paymentMethod }) => {
      const saved = await dbAddPayment({ customerId, amount, note, paymentMethod });
      await refreshAll();
      return saved;
    },
    [refreshAll]
  );

  const getCustomerLedger = useCallback(async (customerId) => {
    return dbGetCustomerLedger(customerId);
  }, []);

  const getBakiKpiSummary = useCallback(async ({ startDateIso, endDateIso, rangeDays }) => {
    return dbGetBakiKpiSummary({ startDateIso, endDateIso, rangeDays });
  }, []);

  const getDashboardKpiSummary = useCallback(async ({ startDateIso, endDateIso, transactionType }) => {
    return dbGetDashboardKpiSummary({ startDateIso, endDateIso, transactionType });
  }, []);

  const getDashboardTopActiveCustomers = useCallback(async ({ startDateIso, endDateIso, transactionType, limit }) => {
    return dbGetDashboardTopActiveCustomers({ startDateIso, endDateIso, transactionType, limit });
  }, []);

  const getStockMovementCountInRange = useCallback(async ({ startDateIso, endDateIso }) => {
    return dbGetStockMovementCountInRange({ startDateIso, endDateIso });
  }, []);

  const getAuditLogs = useCallback(async ({ entityType, action, searchText, limit } = {}) => {
    return dbGetAuditLogs({ entityType, action, searchText, limit });
  }, []);

  const contextValue = useMemo(
    () => ({
      booting,
      refreshing,
      syncingData,
      products,
      expiringSoonProducts,
      expiredProducts,
      lowStockProducts,
      reorderSuggestions,
      reorderRuleConfig,
      customers,
      bakiRows,
      refreshAll,
      addProduct,
      updateProduct,
      deleteProduct,
      addStockMovement,
      getStockMovementHistory,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      addBaki,
      addBakiPayment,
      getCustomerLedger,
      getBakiKpiSummary,
      getDashboardKpiSummary,
      getDashboardTopActiveCustomers,
      getStockMovementCountInRange,
      getAuditLogs,
      runOnlineSync,
    }),
    [
      booting,
      refreshing,
      syncingData,
      products,
      expiringSoonProducts,
      expiredProducts,
      lowStockProducts,
      reorderSuggestions,
      reorderRuleConfig,
      customers,
      bakiRows,
      refreshAll,
      addProduct,
      updateProduct,
      deleteProduct,
      addStockMovement,
      getStockMovementHistory,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      addBaki,
      addBakiPayment,
      getCustomerLedger,
      getBakiKpiSummary,
      getDashboardKpiSummary,
      getDashboardTopActiveCustomers,
      getStockMovementCountInRange,
      getAuditLogs,
      runOnlineSync,
    ]
  );

  if (booting) {
    return <BootLoading title="Preparing Hisab" subtitle="Loading products, customers, and baki data..." />;
  }

  return (
    <AppDataContext.Provider value={contextValue}>
      <MainStackNavigator />
    </AppDataContext.Provider>
  );
}

function RootNavigator() {
  const { authBooting, isAuthenticated } = useAuth();

  if (authBooting) {
    return <BootLoading title="Checking Session" subtitle="Restoring saved login state..." />;
  }

  return (
    <NavigationContainer theme={AppTheme}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <RootStack.Screen name="MainStack" component={MainDataShell} />
        ) : (
          <RootStack.Screen name="AuthStack" component={AuthStackNavigator} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
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
