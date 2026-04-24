import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { registerRootComponent } from 'expo';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

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
  getCustomerFeatureSourceRows as dbGetCustomerFeatureSourceRows,
  getExpiredProducts as dbGetExpiredProducts,
  getExpiringSoonProducts as dbGetExpiringSoonProducts,
  getLowStockProducts as dbGetLowStockProducts,
  getInventoryBatches as dbGetInventoryBatches,
  selectBatchForSale as dbSelectBatchForSale,
  getInventoryAlerts as dbGetInventoryAlerts,
  refreshInventoryAlerts as dbRefreshInventoryAlerts,
  getDeadStockProducts as dbGetDeadStockProducts,
  getInventoryHealthInsights as dbGetInventoryHealthInsights,
  getCycleCounts as dbGetCycleCounts,
  recordCycleCount as dbRecordCycleCount,
  validateInventoryBatchConsistency as dbValidateInventoryBatchConsistency,
  getCustomerLedger as dbGetCustomerLedger,
  getBakiKpiSummary as dbGetBakiKpiSummary,
  getCollectionsDashboard as dbGetCollectionsDashboard,
  getCustomerStatement as dbGetCustomerStatement,
  buildCustomerStatementCsv as dbBuildCustomerStatementCsv,
  scheduleCollectionReminder as dbScheduleCollectionReminder,
  getCollectionReminders as dbGetCollectionReminders,
  createPaymentPromise as dbCreatePaymentPromise,
  getPaymentPromises as dbGetPaymentPromises,
  updatePaymentPromiseStatus as dbUpdatePaymentPromiseStatus,
  getDashboardKpiSummary as dbGetDashboardKpiSummary,
  getDashboardTopActiveCustomers as dbGetDashboardTopActiveCustomers,
  getAuditLogs as dbGetAuditLogs,
  getProductSalesDailyAggregation as dbGetProductSalesDailyAggregation,
  getStockMovements as dbGetStockMovements,
  getStockMovementCountInRange as dbGetStockMovementCountInRange,
  insertProduct,
  addStockMovement as dbAddStockMovement,
  createSale as dbCreateSale,
  getSalesHistory as dbGetSalesHistory,
  getRecentSoldProducts as dbGetRecentSoldProducts,
  getSaleReceipt as dbGetSaleReceipt,
  validateSalesMovementConsistency as dbValidateSalesMovementConsistency,
  addSupplier as dbAddSupplier,
  updateSupplier as dbUpdateSupplier,
  deleteSupplier as dbDeleteSupplier,
  listSuppliers as dbListSuppliers,
  createPurchaseOrder as dbCreatePurchaseOrder,
  getPurchaseHistory as dbGetPurchaseHistory,
  getOpenPurchaseOrders as dbGetOpenPurchaseOrders,
  getPurchaseOrderDetails as dbGetPurchaseOrderDetails,
  receivePurchaseItems as dbReceivePurchaseItems,
  recordSupplierPayment as dbRecordSupplierPayment,
  getSupplierPayables as dbGetSupplierPayables,
  validatePurchaseMovementConsistency as dbValidatePurchaseMovementConsistency,
  createExpense as dbCreateExpense,
  getExpenses as dbGetExpenses,
  getCashbookEntries as dbGetCashbookEntries,
  getCashflowSummary as dbGetCashflowSummary,
  getProfitReport as dbGetProfitReport,
  getProductMarginReport as dbGetProductMarginReport,
  getDayCloseSnapshot as dbGetDayCloseSnapshot,
  closeBusinessDay as dbCloseBusinessDay,
  getDayCloseReports as dbGetDayCloseReports,
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
import ReportsScreen from './screens/ReportsScreen';
import SyncConflictScreen from './screens/SyncConflictScreen';
import OfflineQueueMonitor from './screens/OfflineQueueMonitor';
import BackupRestoreScreen from './screens/BackupRestoreScreen';
import StockSuggestionsScreen from './screens/StockSuggestionsScreen';
import AuditHistoryScreen from './screens/AuditHistoryScreen';
import SalesScreen from './screens/SalesScreen';
import SalesHistoryScreen from './screens/SalesHistoryScreen';
import ReceiptScreen from './screens/ReceiptScreen';
import SupplierScreen from './screens/SupplierScreen';
import PurchaseOrderScreen from './screens/PurchaseOrderScreen';
import GoodsReceiveScreen from './screens/GoodsReceiveScreen';
import PurchaseHistoryScreen from './screens/PurchaseHistoryScreen';
import CashbookScreen from './screens/CashbookScreen';
import ExpenseScreen from './screens/ExpenseScreen';
import ProfitReportScreen from './screens/ProfitReportScreen';
import DayCloseScreen from './screens/DayCloseScreen';
import InventoryBatchViewScreen from './screens/InventoryBatchViewScreen';
import AlertsScreen from './screens/AlertsScreen';
import CycleCountScreen from './screens/CycleCountScreen';
import ApprovalRequestsScreen from './screens/ApprovalRequestsScreen';
import CustomerCreditScreen from './screens/CustomerCreditScreen';
import CollectionsDashboardScreen from './screens/CollectionsDashboardScreen';
import CustomerStatementScreen from './screens/CustomerStatementScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import HelpCenterScreen from './screens/HelpCenterScreen';
import FeedbackScreen from './screens/FeedbackScreen';
import ProfileScreen from './screens/ProfileScreen';
import VoiceAssistantScreen from './screens/VoiceAssistantScreen';
import VoicePackDownloadScreen from './screens/VoicePackDownloadScreen';
import AccountRecoveryScreen from './screens/auth/AccountRecoveryScreen';
import LoginScreen from './screens/auth/LoginScreen';
import PinLoginScreen from './screens/auth/PinLoginScreen';
import ResetPasswordScreen from './screens/auth/ResetPasswordScreen';
import SetupPinScreen from './screens/auth/SetupPinScreen';
import SignupScreen from './screens/auth/SignupScreen';
import UpdatePasswordScreen from './screens/auth/UpdatePasswordScreen';
import VerifyEmailScreen from './screens/auth/VerifyEmailScreen';
import {
  applyCustomerRiskClassification,
  createCustomerRiskModel,
  TRUST_MODEL_FEATURE_FLAGS,
} from './services/customers/customerRiskEngine';
import { createTrustRolloutController } from './services/customers/trustRolloutControl';
import { createTrustMonitoringEngine } from './services/customers/trustMonitoringEngine';
import { computeFeatureBatch } from './services/features/featureCalculator';
import { createReorderPredictor } from './services/reorder/reorderSuggestionEngine.js';
import { pushTrustMonitoringSnapshotOnline } from './services/backend/trustMonitoringApi';
import { fetchCustomerTrustScoresOnline } from './services/backend/trustApi';
import {
  fetchCollectionsDashboardOnline,
  fetchCustomerStatementOnline,
  exportCustomerStatementCsvOnline,
  createCustomerReminderOnline,
  listCustomerRemindersOnline,
  createPaymentPromiseOnline,
  listPaymentPromisesOnline,
  updatePaymentPromiseStatusOnline,
} from './services/backend/creditApi';
import {
  listApprovalRequestsOnline,
  approveApprovalRequestOnline,
  rejectApprovalRequestOnline,
} from './services/backend/approvalApi';
import { runDataSync } from './services/sync/dataSync';
import { UI_COLORS } from './constants/ui-theme';
import { COLORS } from './theme/colors';
import {
  ACTIONS as RBAC_ACTIONS,
  checkPermission as checkRolePermission,
  canonicalizeRole,
} from './security/rbac';

const Drawer = createDrawerNavigator();
const RootStack = createNativeStackNavigator();
const AuthStack = createNativeStackNavigator();
const MainStack = createNativeStackNavigator();
const DEFAULT_TRUST_PREDICTION_HORIZON = '1_month';

const RISK_LEVEL_TOKEN_LABELS = Object.freeze({
  LOW: 'কম ঝুঁকি',
  MEDIUM: 'মাঝারি ঝুঁকি',
  HIGH: 'বেশি ঝুঁকি',
});

const ROUTE_REQUIRED_ACTIONS = Object.freeze({
  StockSuggestions: RBAC_ACTIONS.PRODUCTS_VIEW,
  Audit: RBAC_ACTIONS.AUDIT_VIEW,
  ApprovalRequests: RBAC_ACTIONS.APPROVAL_REVIEW,
  Reports: RBAC_ACTIONS.REPORTS_VIEW,
  SyncConflicts: RBAC_ACTIONS.AUDIT_VIEW,
  OfflineQueue: RBAC_ACTIONS.AUDIT_VIEW,
  BackupRestore: RBAC_ACTIONS.AUDIT_VIEW,
  Sales: RBAC_ACTIONS.SALES_CREATE,
  SalesHistory: RBAC_ACTIONS.SALES_CREATE,
  Suppliers: RBAC_ACTIONS.PURCHASE_MANAGE,
  PurchaseOrders: RBAC_ACTIONS.PURCHASE_MANAGE,
  GoodsReceive: RBAC_ACTIONS.PURCHASE_MANAGE,
  PurchaseHistory: RBAC_ACTIONS.PURCHASE_MANAGE,
  Cashbook: RBAC_ACTIONS.EXPENSES_MANAGE,
  Expenses: RBAC_ACTIONS.EXPENSES_MANAGE,
  ProfitReport: RBAC_ACTIONS.REPORTS_VIEW,
  DayClose: RBAC_ACTIONS.EXPENSES_MANAGE,
  InventoryBatches: RBAC_ACTIONS.STOCK_MANAGE,
  Alerts: RBAC_ACTIONS.STOCK_MANAGE,
  CycleCount: RBAC_ACTIONS.STOCK_MANAGE,
  Products: RBAC_ACTIONS.PRODUCTS_VIEW,
  Customers: RBAC_ACTIONS.CUSTOMERS_VIEW,
  Ledger: RBAC_ACTIONS.CUSTOMERS_VIEW,
  Baki: RBAC_ACTIONS.CUSTOMERS_VIEW,
  CustomerCredit: RBAC_ACTIONS.CUSTOMERS_VIEW,
  Collections: RBAC_ACTIONS.REPORTS_VIEW,
  CustomerStatement: RBAC_ACTIONS.REPORTS_VIEW,
  Onboarding: RBAC_ACTIONS.REPORTS_VIEW,
  HelpCenter: RBAC_ACTIONS.REPORTS_VIEW,
  Feedback: RBAC_ACTIONS.REPORTS_VIEW,
  VoiceAssistant: RBAC_ACTIONS.CUSTOMERS_VIEW,
  VoicePackDownload: RBAC_ACTIONS.CUSTOMERS_VIEW,
  Movement: RBAC_ACTIONS.STOCK_MANAGE,
  Details: RBAC_ACTIONS.PRODUCTS_VIEW,
});

const toUiRiskLabel = (value) => {
  const token = String(value || '').trim().toUpperCase();
  return RISK_LEVEL_TOKEN_LABELS[token] || String(value || 'কম ঝুঁকি');
};

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

function BootLoading({
  title = 'Preparing Hisab',
  subtitle = 'Loading products, customers, and baki data...',
  compact = false,
}) {
  if (compact) {
    return (
      <SafeAreaView style={styles.loadingSafeAreaCompact}>
        <ActivityIndicator size="large" color={UI_COLORS.primary} />
      </SafeAreaView>
    );
  }

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

function MainSidebarNavigator() {
  const { user } = useAuth();
  const activeRole = canonicalizeRole(user?.role);
  const canAccessRoute = useCallback((routeName) => {
    const requiredAction = ROUTE_REQUIRED_ACTIONS[routeName] || null;
    if (!requiredAction) {
      return true;
    }

    return checkRolePermission(activeRole, requiredAction);
  }, [activeRole]);

  return (
    <Drawer.Navigator
      initialRouteName="Dashboard"
      screenOptions={({ route }) => ({
        headerStyle: {
          backgroundColor: COLORS.sidebarBackground,
        },
        headerTintColor: COLORS.sidebarActiveText,
        headerTitleStyle: {
          fontWeight: '700',
          letterSpacing: 0.2,
        },
        sceneStyle: {
          backgroundColor: UI_COLORS.background,
        },
        drawerStyle: {
          backgroundColor: COLORS.sidebarBackground,
          width: 274,
        },
        drawerActiveBackgroundColor: COLORS.sidebarActiveBackground,
        drawerActiveTintColor: COLORS.sidebarActiveText,
        drawerInactiveTintColor: COLORS.sidebarText,
        drawerLabelStyle: {
          fontSize: 12,
          fontWeight: '700',
          letterSpacing: 0.2,
        },
        drawerItemStyle: {
          ...(canAccessRoute(route.name)
            ? {
              borderRadius: 10,
              marginHorizontal: 10,
              marginVertical: 4,
            }
            : {
              display: 'none',
              height: 0,
              marginHorizontal: 0,
              marginVertical: 0,
              paddingVertical: 0,
            }),
        },
        drawerIcon: ({ color, size }) => {
          if (route.name === 'Products') {
            return <MaterialIcons name="inventory-2" size={size} color={color} />;
          }

          if (route.name === 'Customers') {
            return <MaterialIcons name="groups" size={size} color={color} />;
          }

          if (route.name === 'Ledger') {
            return <MaterialIcons name="receipt-long" size={size} color={color} />;
          }

          if (route.name === 'CustomerCredit') {
            return <MaterialIcons name="credit-score" size={size} color={color} />;
          }

          if (route.name === 'Collections') {
            return <MaterialIcons name="analytics" size={size} color={color} />;
          }

          if (route.name === 'CustomerStatement') {
            return <MaterialIcons name="description" size={size} color={color} />;
          }

          if (route.name === 'Onboarding') {
            return <MaterialIcons name="school" size={size} color={color} />;
          }

          if (route.name === 'HelpCenter') {
            return <MaterialIcons name="help-center" size={size} color={color} />;
          }

          if (route.name === 'Feedback') {
            return <MaterialIcons name="forum" size={size} color={color} />;
          }

          if (route.name === 'VoiceAssistant') {
            return <MaterialIcons name="keyboard-voice" size={size} color={color} />;
          }

          if (route.name === 'VoicePackDownload') {
            return <MaterialIcons name="download-for-offline" size={size} color={color} />;
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

          if (route.name === 'Reports') {
            return <MaterialIcons name="bar-chart" size={size} color={color} />;
          }

          if (route.name === 'SyncConflicts') {
            return <MaterialIcons name="merge-type" size={size} color={color} />;
          }

          if (route.name === 'OfflineQueue') {
            return <MaterialIcons name="schedule-send" size={size} color={color} />;
          }

          if (route.name === 'BackupRestore') {
            return <MaterialIcons name="backup" size={size} color={color} />;
          }

          if (route.name === 'StockSuggestions') {
            return <MaterialIcons name="insights" size={size} color={color} />;
          }

          if (route.name === 'Audit') {
            return <MaterialIcons name="history" size={size} color={color} />;
          }

          if (route.name === 'ApprovalRequests') {
            return <MaterialIcons name="verified-user" size={size} color={color} />;
          }

          if (route.name === 'Sales') {
            return <MaterialIcons name="point-of-sale" size={size} color={color} />;
          }

          if (route.name === 'SalesHistory') {
            return <MaterialIcons name="history-edu" size={size} color={color} />;
          }

          if (route.name === 'Suppliers') {
            return <MaterialIcons name="local-shipping" size={size} color={color} />;
          }

          if (route.name === 'PurchaseOrders') {
            return <MaterialIcons name="assignment" size={size} color={color} />;
          }

          if (route.name === 'GoodsReceive') {
            return <MaterialIcons name="inventory" size={size} color={color} />;
          }

          if (route.name === 'PurchaseHistory') {
            return <MaterialIcons name="history-toggle-off" size={size} color={color} />;
          }

          if (route.name === 'Cashbook') {
            return <MaterialIcons name="account-balance-wallet" size={size} color={color} />;
          }

          if (route.name === 'Expenses') {
            return <MaterialIcons name="receipt" size={size} color={color} />;
          }

          if (route.name === 'ProfitReport') {
            return <MaterialIcons name="trending-up" size={size} color={color} />;
          }

          if (route.name === 'DayClose') {
            return <MaterialIcons name="event-available" size={size} color={color} />;
          }

          if (route.name === 'InventoryBatches') {
            return <MaterialIcons name="layers" size={size} color={color} />;
          }

          if (route.name === 'Alerts') {
            return <MaterialIcons name="notification-important" size={size} color={color} />;
          }

          if (route.name === 'CycleCount') {
            return <MaterialIcons name="fact-check" size={size} color={color} />;
          }

          if (route.name === 'Profile') {
            return <MaterialIcons name="person" size={size} color={color} />;
          }

          return <MaterialIcons name="account-balance-wallet" size={size} color={color} />;
        },
      })}>
      <Drawer.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={({ navigation }) => ({
          title: 'ড্যাশবোর্ড',
          headerTitle: 'ব্যবসার ড্যাশবোর্ড',
          headerRight: () => (
            <MaterialIcons
              name="account-circle"
              size={26}
              color={COLORS.sidebarActiveText}
              style={{ marginRight: 14 }}
              onPress={() => navigation.navigate('Profile')}
            />
          ),
        })}
      />
      <Drawer.Screen
        name="Reports"
        component={ReportsScreen}
        options={{
          title: 'রিপোর্ট',
          headerTitle: 'রিপোর্ট ও সম্মতি',
        }}
      />
      <Drawer.Screen
        name="SyncConflicts"
        component={SyncConflictScreen}
        options={{
          title: 'সিঙ্ক দ্বন্দ্ব',
          headerTitle: 'সিঙ্ক দ্বন্দ্ব',
        }}
      />
      <Drawer.Screen
        name="OfflineQueue"
        component={OfflineQueueMonitor}
        options={{
          title: 'অফলাইন সারি',
          headerTitle: 'অফলাইন সারি',
        }}
      />
      <Drawer.Screen
        name="BackupRestore"
        component={BackupRestoreScreen}
        options={{
          title: 'ব্যাকআপ',
          headerTitle: 'ব্যাকআপ ও পুনরুদ্ধার',
        }}
      />
      <Drawer.Screen
        name="StockSuggestions"
        component={StockSuggestionsScreen}
        options={{
          title: 'পরামর্শ',
          headerTitle: 'স্টক পরামর্শ',
        }}
      />
      <Drawer.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'প্রোফাইল',
          headerTitle: 'প্রোফাইল ও সেটিংস',
        }}
      />
      <Drawer.Screen
        name="Audit"
        component={AuditHistoryScreen}
        options={{
          title: 'অডিট',
          headerTitle: 'অডিট ইতিহাস',
        }}
      />
      <Drawer.Screen
        name="ApprovalRequests"
        component={ApprovalRequestsScreen}
        options={{
          title: 'অনুমোদন',
          headerTitle: 'অনুমোদনের অনুরোধ',
        }}
      />
      <Drawer.Screen
        name="Sales"
        component={SalesScreen}
        options={{
          title: 'বিক্রি',
          headerTitle: 'বিক্রি ও রসিদ',
        }}
      />
      <Drawer.Screen
        name="SalesHistory"
        component={SalesHistoryScreen}
        options={{
          title: 'বিক্রির ইতিহাস',
          headerTitle: 'বিক্রির ইতিহাস',
        }}
      />
      <Drawer.Screen
        name="Suppliers"
        component={SupplierScreen}
        options={{
          title: 'সরবরাহকারী',
          headerTitle: 'সরবরাহকারী',
        }}
      />
      <Drawer.Screen
        name="PurchaseOrders"
        component={PurchaseOrderScreen}
        options={{
          title: 'ক্রয় আদেশ',
          headerTitle: 'ক্রয় আদেশ',
        }}
      />
      <Drawer.Screen
        name="GoodsReceive"
        component={GoodsReceiveScreen}
        options={{
          title: 'পণ্য গ্রহণ',
          headerTitle: 'পণ্য গ্রহণ',
        }}
      />
      <Drawer.Screen
        name="PurchaseHistory"
        component={PurchaseHistoryScreen}
        options={{
          title: 'ক্রয়ের ইতিহাস',
          headerTitle: 'ক্রয়ের ইতিহাস ও পরিশোধযোগ্য',
        }}
      />
      <Drawer.Screen
        name="Cashbook"
        component={CashbookScreen}
        options={{
          title: 'ক্যাশবুক',
          headerTitle: 'ক্যাশবুক ও জার্নাল',
        }}
      />
      <Drawer.Screen
        name="Expenses"
        component={ExpenseScreen}
        options={{
          title: 'খরচ',
          headerTitle: 'খরচ ব্যবস্থাপনা',
        }}
      />
      <Drawer.Screen
        name="ProfitReport"
        component={ProfitReportScreen}
        options={{
          title: 'লাভ রিপোর্ট',
          headerTitle: 'লাভ ও মার্জিন রিপোর্ট',
        }}
      />
      <Drawer.Screen
        name="DayClose"
        component={DayCloseScreen}
        options={{
          title: 'দিন বন্ধ',
          headerTitle: 'দিন বন্ধের সারসংক্ষেপ',
        }}
      />
      <Drawer.Screen
        name="InventoryBatches"
        component={InventoryBatchViewScreen}
        options={{
          title: 'ইনভেন্টরি ব্যাচ',
          headerTitle: 'ব্যাচ ও মেয়াদ ক্রম',
        }}
      />
      <Drawer.Screen
        name="Alerts"
        component={AlertsScreen}
        options={{
          title: 'সতর্কতা',
          headerTitle: 'স্টক সতর্কতা',
        }}
      />
      <Drawer.Screen
        name="CycleCount"
        component={CycleCountScreen}
        options={{
          title: 'চক্র গণনা',
          headerTitle: 'চক্র গণনা ও সামঞ্জস্য',
        }}
      />
      <Drawer.Screen
        name="Products"
        component={ProductListScreen}
        options={{
          title: 'পণ্য',
          headerTitle: 'পণ্য তালিকা',
        }}
      />
      <Drawer.Screen
        name="Customers"
        component={CustomerListScreen}
        options={{
          title: 'কাস্টমার',
          headerTitle: 'কাস্টমার',
        }}
      />
      <Drawer.Screen
        name="Ledger"
        component={CustomerLedgerScreen}
        options={{
          title: 'খাতা',
          headerTitle: 'কাস্টমার খাতা',
        }}
      />
      <Drawer.Screen
        name="Baki"
        component={BakiListScreen}
        options={{
          title: 'বাকি',
          headerTitle: 'বাকির তালিকা',
        }}
      />
      <Drawer.Screen
        name="CustomerCredit"
        component={CustomerCreditScreen}
        options={{
          title: 'ক্রেডিট',
          headerTitle: 'কাস্টমার ক্রেডিট',
        }}
      />
      <Drawer.Screen
        name="Collections"
        component={CollectionsDashboardScreen}
        options={{
          title: 'সংগ্রহ',
          headerTitle: 'সংগ্রহ ড্যাশবোর্ড',
        }}
      />
      <Drawer.Screen
        name="CustomerStatement"
        component={CustomerStatementScreen}
        options={{
          title: 'বিবৃতি',
          headerTitle: 'কাস্টমার বিবৃতি',
        }}
      />
      <Drawer.Screen
        name="Onboarding"
        component={OnboardingScreen}
        options={{
          title: 'অনবোর্ডিং',
          headerTitle: 'পাইলট অনবোর্ডিং',
        }}
      />
      <Drawer.Screen
        name="HelpCenter"
        component={HelpCenterScreen}
        options={{
          title: 'সাহায্য',
          headerTitle: 'সাহায্য কেন্দ্র',
        }}
      />
      <Drawer.Screen
        name="Feedback"
        component={FeedbackScreen}
        options={{
          title: 'ফিডব্যাক',
          headerTitle: 'ফিডব্যাক',
        }}
      />
      <Drawer.Screen
        name="VoiceAssistant"
        component={VoiceAssistantScreen}
        options={{
          title: 'ভয়েস সহকারী',
          headerTitle: 'ভয়েস কমান্ড',
        }}
      />
      <Drawer.Screen
        name="VoicePackDownload"
        component={VoicePackDownloadScreen}
        options={{
          title: 'ভয়েস প্যাক',
          headerTitle: 'ভয়েস প্যাক ডাউনলোড',
        }}
      />
      <Drawer.Screen
        name="Movement"
        component={StockMovementScreen}
        options={{
          title: 'চলাচল',
          headerTitle: 'স্টক চলাচল',
        }}
      />
      <Drawer.Screen
        name="Details"
        component={ProductDetailsScreen}
        options={{
          title: 'বিবরণ',
          headerTitle: 'পণ্যের বিবরণ',
        }}
      />
    </Drawer.Navigator>
  );
}

function MainStackNavigator() {
  return (
    <MainStack.Navigator>
      <MainStack.Screen name="MainSidebar" component={MainSidebarNavigator} options={{ headerShown: false }} />
      <MainStack.Screen
        name="Receipt"
        component={ReceiptScreen}
        options={{
          title: 'রসিদ',
          headerStyle: { backgroundColor: UI_COLORS.textPrimary },
          headerTintColor: UI_COLORS.surface,
          contentStyle: { backgroundColor: UI_COLORS.background },
        }}
      />
      <MainStack.Screen
        name="UpdatePassword"
        component={UpdatePasswordScreen}
        options={{
          title: 'PIN আপডেট',
          headerStyle: { backgroundColor: UI_COLORS.textPrimary },
          headerTintColor: UI_COLORS.surface,
          contentStyle: { backgroundColor: UI_COLORS.background },
        }}
      />
      <MainStack.Screen
        name="SetupPin"
        component={SetupPinScreen}
        options={{
          title: 'PIN সেটআপ',
          headerStyle: { backgroundColor: UI_COLORS.textPrimary },
          headerTintColor: UI_COLORS.surface,
          contentStyle: { backgroundColor: UI_COLORS.background },
        }}
      />
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
      <AuthStack.Screen name="Login" component={LoginScreen} options={{ title: 'লগইন' }} />
      <AuthStack.Screen name="PinLogin" component={PinLoginScreen} options={{ title: 'PIN লগইন' }} />
      <AuthStack.Screen name="Signup" component={SignupScreen} options={{ title: 'নিবন্ধন' }} />
      <AuthStack.Screen name="VerifyEmail" component={VerifyEmailScreen} options={{ title: 'ইমেইল যাচাই' }} />
      <AuthStack.Screen name="AccountRecovery" component={AccountRecoveryScreen} options={{ title: 'অ্যাকাউন্ট পুনরুদ্ধার' }} />
      <AuthStack.Screen name="ResetPassword" component={ResetPasswordScreen} options={{ title: 'PIN রিসেট' }} />
    </AuthStack.Navigator>
  );
}

function MainDataShell() {
  const { user, session, isOnline, ensureValidAccessToken } = useAuth();
  const activeRole = canonicalizeRole(user?.role);
  const trustRolloutController = useMemo(() => createTrustRolloutController({
    config: {
      enable_new_scoring: true,
      rollout_percentage: 5,
      rollout_stage: 'stage_1_canary',
      challenger_enabled: true,
      revert_target: 'champion',
    },
    logger: console.warn,
  }), []);

  const trustMonitoringEngine = useMemo(() => createTrustMonitoringEngine({
    rolloutController: trustRolloutController,
    guardrails: {
      fallback_rate_max: 0.3,
      brier_degradation_max: 0.02,
      error_rate_max: 0.02,
      calibration_shift_max: 0.05,
      feature_mean_shift_max: 0.35,
      feature_variance_shift_max: 0.5,
      prediction_drift_psi_max: 0.25,
      min_samples_for_guardrails: 40,
      min_labeled_samples: 20,
    },
    baseline: {
      performance: {
        brier_score: 0.18,
      },
      prediction_histogram: new Array(10).fill(0.1),
      feature_stats: {},
    },
    logger: console.warn,
  }), [trustRolloutController]);

  const trustRoutingFlags = useMemo(() => {
    const rolloutState = trustRolloutController.getConfig();
    return {
      ...TRUST_MODEL_FEATURE_FLAGS,
      enable_new_scoring: rolloutState.enable_new_scoring,
      rollout_percentage: rolloutState.rollout_percentage,
      use_challenger_model: rolloutState.challenger_enabled,
      shadow_mode: false,
    };
  }, [trustRolloutController]);

  const customerRiskModel = useMemo(() => createCustomerRiskModel('hybrid', {
    featureFlags: trustRoutingFlags,
    useChallengerModel: true,
    rolloutController: trustRolloutController,
    monitoringEngine: trustMonitoringEngine,
    routingConfig: {
      sparseHistoryThreshold: 3,
      richHistoryThreshold: 12,
      highVolatilityThreshold: 45,
      logisticConfidenceMin: 0.1,
      lightgbmConfidenceMin: 0.1,
    },
    logger: console.warn,
    shadowLogger: console.warn,
  }), [trustMonitoringEngine, trustRolloutController, trustRoutingFlags]);
  const reorderPredictor = useMemo(() => createReorderPredictor('markov-chain', {
    accessToken: session?.access_token || null,
    backendEnabled: Boolean(isOnline),
  }), [isOnline, session?.access_token]);
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
  const [initialDataLoading, setInitialDataLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingData, setSyncingData] = useState(false);
  const syncInFlightRef = useRef(false);
  const lastMonitoringUploadMsRef = useRef(0);
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

    const [expiringSoonResult, expiredResult, lowStockResult, salesResult, customerRiskResult, featureSourceResult] = await Promise.allSettled([
      dbGetExpiringSoonProducts(7),
      dbGetExpiredProducts(),
      dbGetLowStockProducts(),
      dbGetProductSalesDailyAggregation({ days: reorderRuleConfig.windowDays }),
      dbGetCustomerRiskMetrics(),
      dbGetCustomerFeatureSourceRows(),
    ]);

    const expiringSoonRows = expiringSoonResult.status === 'fulfilled' ? expiringSoonResult.value : [];
    const expiredRows = expiredResult.status === 'fulfilled' ? expiredResult.value : [];
    const lowStockRows = lowStockResult.status === 'fulfilled' ? lowStockResult.value : [];
    const salesRows = salesResult.status === 'fulfilled' ? salesResult.value : [];
    const customerRiskRows = customerRiskResult.status === 'fulfilled' ? customerRiskResult.value : [];
    const primaryPredictions = customerRiskRows
      .filter((row) => row && Number.isFinite(Number(row.customer_id)))
      .map((row) => ({
        customer_id: Number(row.customer_id),
        probability: row.default_probability ?? row.model_probability ?? row.ml_probability ?? null,
        confidence: row.confidence_score ?? row.model_confidence ?? row.ml_confidence ?? null,
      }))
      .filter((row) => row.probability !== null || row.confidence !== null);
    const featureSourceRows = featureSourceResult.status === 'fulfilled' ? featureSourceResult.value : [];

    let featureBatch = null;
    try {
      featureBatch = computeFeatureBatch(featureSourceRows);
    } catch (error) {
      console.error('[APP] feature batch computation failed:', error);
    }

    let enrichedCustomers = customerRows;
    try {
      enrichedCustomers = applyCustomerRiskClassification(
        customerRows,
        customerRiskRows,
        customerRiskModel,
        featureBatch,
        {
          primaryPredictions,
          monitoringEngine: trustMonitoringEngine,
          autoComputeMonitoringSnapshot: true,
        }
      );
    } catch (error) {
      console.error('[APP] customer risk classification failed:', error);
    }

    if (isOnline && session?.access_token && enrichedCustomers.length > 0) {
      try {
        const onlineTrustByCustomerId = await fetchCustomerTrustScoresOnline({
          accessToken: session.access_token,
          customerIds: enrichedCustomers.map((row) => row.id),
          horizon: DEFAULT_TRUST_PREDICTION_HORIZON,
        });

        enrichedCustomers = enrichedCustomers.map((row) => {
          const onlineTrust = onlineTrustByCustomerId[String(row.id)];
          if (!onlineTrust) {
            return row;
          }

          return {
            ...row,
            trust_score: Number.isFinite(Number(onlineTrust.trust_score))
              ? Number(onlineTrust.trust_score)
              : Number(row.trust_score || 0),
            risk_score: Number.isFinite(Number(onlineTrust.risk_score))
              ? Number(onlineTrust.risk_score)
              : Number(row.risk_score || 0),
            risk_level: toUiRiskLabel(onlineTrust.risk_level || row.risk_level),
            risk_level_token: String(onlineTrust.risk_level || '').trim().toUpperCase() || null,
            risk_reasons: Array.isArray(onlineTrust.risk_reasons)
              ? onlineTrust.risk_reasons
              : Array.isArray(row.risk_reasons)
                ? row.risk_reasons
                : [],
            prediction_horizon: onlineTrust.prediction_horizon || DEFAULT_TRUST_PREDICTION_HORIZON,
            prediction_targets: onlineTrust.prediction_targets || null,
          };
        });
      } catch (error) {
        console.warn('[APP] online trust scoring fetch failed:', error?.message || error);
      }
    }

    let nextSuggestions = [];
    try {
      nextSuggestions = await Promise.resolve(reorderPredictor.predict({
        products: productRows,
        salesRows,
        config: reorderRuleConfig,
        accessToken: session?.access_token || null,
        horizon: '1W',
      }));
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
  }, [
    customerRiskModel,
    isOnline,
    reorderPredictor,
    reorderRuleConfig,
    session?.access_token,
    trustMonitoringEngine,
  ]);

  useEffect(() => {
    let disposed = false;

    const boot = async () => {
      try {
        await createTables();
      } catch (error) {
        console.error('[APP] boot failed:', error);
      } finally {
        if (!disposed) {
          setBooting(false);
        }
      }
    };

    const hydrateAfterPaint = async () => {
      try {
        await loadAllData();
      } catch (error) {
        console.error('[APP] initial data hydration failed:', error);
      } finally {
        if (!disposed) {
          setInitialDataLoading(false);
        }
      }
    };

    boot();

    requestAnimationFrame(() => {
      void hydrateAfterPaint();
    });

    return () => {
      disposed = true;
    };
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
    if (!isOnline || !session?.token || !user?.id) {
      return { synced: 0, appliedServerChanges: 0, skipped: true };
    }

    if (syncInFlightRef.current) {
      return { synced: 0, appliedServerChanges: 0, skipped: true };
    }

    syncInFlightRef.current = true;
    setSyncingData(true);
    try {
      const activeAccessToken = await ensureValidAccessToken({ minValidityMs: 45 * 1000 });
      if (!activeAccessToken) {
        return { synced: 0, appliedServerChanges: 0, skipped: true };
      }

      const syncVerboseLogs = (typeof __DEV__ !== 'undefined' && __DEV__)
        || String(process?.env?.EXPO_PUBLIC_SYNC_VERBOSE || '').trim() === '1';

      const result = await runDataSync({
        userId: Number(user.id),
        accessToken: activeAccessToken,
      });

      if (
        syncVerboseLogs
        || Number(result?.synced || 0) > 0
        || Number(result?.appliedServerChanges || 0) > 0
        || Boolean(result?.hasMoreServerChanges)
      ) {
        console.info('[SYNC][APP][TRIGGERED]', {
          userId: Number(user.id),
          reason: 'interval_or_foreground',
          synced: Number(result?.synced || 0),
          appliedServerChanges: Number(result?.appliedServerChanges || 0),
          hasMoreServerChanges: Boolean(result?.hasMoreServerChanges),
        });
      }

      if (Number(result?.synced || 0) > 0 || Number(result?.appliedServerChanges || 0) > 0) {
        await loadAllData();
      }

      const now = Date.now();
      if (now - lastMonitoringUploadMsRef.current >= 60 * 1000) {
        const requestRows = trustMonitoringEngine.getRecentRequests();
        if (requestRows.length > 0) {
          const snapshot = trustMonitoringEngine.computeSnapshot();
          await pushTrustMonitoringSnapshotOnline({
            accessToken: activeAccessToken,
            source: 'phase8_runtime_react_native',
            appVersion: '1.0.0',
            snapshot: {
              ...snapshot,
              baseline: trustMonitoringEngine.getBaseline(),
              metadata: {
                user_id: Number(user.id),
                rollout_stage: trustRolloutController.getConfig().rollout_stage,
                rollout_percentage: trustRolloutController.getConfig().rollout_percentage,
              },
            },
          });
          lastMonitoringUploadMsRef.current = now;
        }
      }

      return result;
    } catch (error) {
      console.warn('[APP] data sync skipped or failed:', error?.message || error);
      return { synced: 0, appliedServerChanges: 0, skipped: true };
    } finally {
      syncInFlightRef.current = false;
      setSyncingData(false);
    }
  }, [ensureValidAccessToken, isOnline, loadAllData, session?.token, trustMonitoringEngine, trustRolloutController, user?.id]);

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
    async ({ productId, movementType, quantity, note, stockOutReason }) => {
      const saved = await dbAddStockMovement({ productId, movementType, quantity, note, stockOutReason });
      await refreshAll();
      return saved;
    },
    [refreshAll]
  );

  const createSale = useCallback(
    async ({ customerId = null, items = [], payments = [], paymentMode = 'CASH', note = null, timestamp = null } = {}) => {
      const saved = await dbCreateSale({ customerId, items, payments, paymentMode, note, timestamp });
      await refreshAll();
      await runOnlineSync();
      return saved;
    },
    [refreshAll, runOnlineSync]
  );

  const getSalesHistory = useCallback(async ({
    limit = 100,
    fromDateIso = null,
    toDateIso = null,
    customerId = null,
    productId = null,
    paymentMode = null,
    searchText = '',
  } = {}) => {
    return dbGetSalesHistory({
      limit,
      fromDateIso,
      toDateIso,
      customerId,
      productId,
      paymentMode,
      searchText,
    });
  }, []);

  const getRecentSoldProducts = useCallback(async ({ limit = 12 } = {}) => {
    return dbGetRecentSoldProducts({ limit });
  }, []);

  const getSaleReceipt = useCallback(async ({ saleId = null, receiptId = null } = {}) => {
    return dbGetSaleReceipt({ saleId, receiptId });
  }, []);

  const validateSalesMovementConsistency = useCallback(async ({ dateIso = null } = {}) => {
    return dbValidateSalesMovementConsistency({ dateIso });
  }, []);

  const listSuppliers = useCallback(async ({ searchText = '', limit = 200 } = {}) => {
    return dbListSuppliers({ searchText, limit });
  }, []);

  const addSupplier = useCallback(async ({ name, phone, address } = {}) => {
    const saved = await dbAddSupplier({ name, phone, address });
    await refreshAll();
    await runOnlineSync();
    return saved;
  }, [refreshAll, runOnlineSync]);

  const updateSupplier = useCallback(async ({ id, name, phone, address } = {}) => {
    const updated = await dbUpdateSupplier({ id, name, phone, address });
    await refreshAll();
    await runOnlineSync();
    return updated;
  }, [refreshAll, runOnlineSync]);

  const deleteSupplier = useCallback(async (id) => {
    const deleted = await dbDeleteSupplier(id);
    await refreshAll();
    await runOnlineSync();
    return deleted;
  }, [refreshAll, runOnlineSync]);

  const createPurchaseOrder = useCallback(async ({ supplierId, items, note, purchaseDate, paidAmount, paymentMethod } = {}) => {
    const saved = await dbCreatePurchaseOrder({ supplierId, items, note, purchaseDate, paidAmount, paymentMethod });
    await refreshAll();
    await runOnlineSync();
    return saved;
  }, [refreshAll, runOnlineSync]);

  const getPurchaseHistory = useCallback(async ({
    limit = 100,
    fromDateIso = null,
    toDateIso = null,
    supplierId = null,
    status = null,
    searchText = '',
  } = {}) => {
    return dbGetPurchaseHistory({
      limit,
      fromDateIso,
      toDateIso,
      supplierId,
      status,
      searchText,
    });
  }, []);

  const getOpenPurchaseOrders = useCallback(async ({ limit = 100 } = {}) => {
    return dbGetOpenPurchaseOrders({ limit });
  }, []);

  const getPurchaseOrderDetails = useCallback(async ({ purchaseOrderId } = {}) => {
    return dbGetPurchaseOrderDetails({ purchaseOrderId });
  }, []);

  const receivePurchaseItems = useCallback(async ({ purchaseOrderId, items, note, receivedAt } = {}) => {
    const saved = await dbReceivePurchaseItems({ purchaseOrderId, items, note, receivedAt });
    await refreshAll();
    await runOnlineSync();
    return saved;
  }, [refreshAll, runOnlineSync]);

  const recordSupplierPayment = useCallback(async ({
    supplierId,
    amount,
    purchaseOrderId,
    paymentMethod,
    note,
    paidAt,
  } = {}) => {
    const saved = await dbRecordSupplierPayment({
      supplierId,
      amount,
      purchaseOrderId,
      paymentMethod,
      note,
      paidAt,
    });
    await refreshAll();
    await runOnlineSync();
    return saved;
  }, [refreshAll, runOnlineSync]);

  const getSupplierPayables = useCallback(async ({ supplierId = null, limit = 120 } = {}) => {
    return dbGetSupplierPayables({ supplierId, limit });
  }, []);

  const validatePurchaseMovementConsistency = useCallback(async ({ dateIso = null } = {}) => {
    return dbValidatePurchaseMovementConsistency({ dateIso });
  }, []);

  const createExpense = useCallback(async ({ title, amount, category, paymentMethod, note, expenseDate } = {}) => {
    const saved = await dbCreateExpense({ title, amount, category, paymentMethod, note, expenseDate });
    await refreshAll();
    await runOnlineSync();
    return saved;
  }, [refreshAll, runOnlineSync]);

  const getExpenses = useCallback(async ({ fromDateIso, toDateIso, category, searchText, limit } = {}) => {
    return dbGetExpenses({ fromDateIso, toDateIso, category, searchText, limit });
  }, []);

  const getCashbookEntries = useCallback(async ({ fromDateIso, toDateIso, entryType, paymentMethod, limit } = {}) => {
    return dbGetCashbookEntries({ fromDateIso, toDateIso, entryType, paymentMethod, limit });
  }, []);

  const getCashflowSummary = useCallback(async ({ fromDateIso, toDateIso, days } = {}) => {
    return dbGetCashflowSummary({ fromDateIso, toDateIso, days });
  }, []);

  const getProfitReport = useCallback(async ({ fromDateIso, toDateIso, days } = {}) => {
    return dbGetProfitReport({ fromDateIso, toDateIso, days });
  }, []);

  const getProductMarginReport = useCallback(async ({ fromDateIso, toDateIso, days, limit } = {}) => {
    return dbGetProductMarginReport({ fromDateIso, toDateIso, days, limit });
  }, []);

  const getDayCloseSnapshot = useCallback(async ({ businessDate } = {}) => {
    return dbGetDayCloseSnapshot({ businessDate });
  }, []);

  const closeBusinessDay = useCallback(async ({ businessDate, cashOnHand, note } = {}) => {
    const saved = await dbCloseBusinessDay({ businessDate, cashOnHand, note });
    await refreshAll();
    await runOnlineSync();
    return saved;
  }, [refreshAll, runOnlineSync]);

  const getDayCloseReports = useCallback(async ({ limit } = {}) => {
    return dbGetDayCloseReports({ limit });
  }, []);

  const getInventoryBatches = useCallback(async ({ productId = null, includeDepleted = false, limit = 300 } = {}) => {
    return dbGetInventoryBatches({ productId, includeDepleted, limit });
  }, []);

  const selectBatchForSale = useCallback(async ({ productId } = {}) => {
    return dbSelectBatchForSale(productId);
  }, []);

  const getInventoryAlerts = useCallback(async ({ alertType = null, severity = null, activeOnly = true, limit = 200 } = {}) => {
    return dbGetInventoryAlerts({ alertType, severity, activeOnly, limit });
  }, []);

  const refreshInventoryAlerts = useCallback(async ({ expiryAlertDays, deadStockDays } = {}) => {
    const rows = await dbRefreshInventoryAlerts({ expiryAlertDays, deadStockDays });
    await refreshAll();
    return rows;
  }, [refreshAll]);

  const getDeadStockProducts = useCallback(async ({ thresholdDays = 60, limit = 200 } = {}) => {
    return dbGetDeadStockProducts({ thresholdDays, limit });
  }, []);

  const getInventoryHealthInsights = useCallback(async ({ lookbackDays = 30, expiryAlertDays = 7, deadStockDays = 60 } = {}) => {
    return dbGetInventoryHealthInsights({ lookbackDays, expiryAlertDays, deadStockDays });
  }, []);

  const getCycleCounts = useCallback(async ({ productId = null, limit = 120 } = {}) => {
    return dbGetCycleCounts({ productId, limit });
  }, []);

  const recordCycleCount = useCallback(async ({ productId, physicalQuantity, note, timestamp } = {}) => {
    const row = await dbRecordCycleCount({ productId, physicalQuantity, note, timestamp });
    await refreshAll();
    await runOnlineSync();
    return row;
  }, [refreshAll, runOnlineSync]);

  const validateInventoryBatchConsistency = useCallback(async ({ productId = null } = {}) => {
    return dbValidateInventoryBatchConsistency({ productId });
  }, []);

  const getStockMovementHistory = useCallback(async ({ productId = null, limit = 100 } = {}) => {
    return dbGetStockMovements({ productId, limit });
  }, []);

  const addCustomer = useCallback(
    async ({ name, phone, address, creditLimit, dueTermsDays }) => {
      const saved = await dbAddCustomer({ name, phone, address, creditLimit, dueTermsDays });
      await refreshAll();
      await runOnlineSync();
      return saved;
    },
    [refreshAll, runOnlineSync]
  );

  const updateCustomer = useCallback(
    async ({ id, name, phone, address, creditLimit, dueTermsDays, riskLevel }) => {
      const updated = await dbUpdateCustomer({ id, name, phone, address, creditLimit, dueTermsDays, riskLevel });
      await refreshAll();
      await runOnlineSync();
      return updated;
    },
    [refreshAll, runOnlineSync]
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
    async ({ customerId, amount, note, dueDate, dueTermsDays, referenceId }) => {
      const saved = await dbAddBaki({ customerId, amount, note, dueDate, dueTermsDays, referenceId });
      await refreshAll();
      await runOnlineSync();
      return saved;
    },
    [refreshAll, runOnlineSync]
  );

  const addBakiPayment = useCallback(
    async ({ customerId, amount, note, paymentMethod, referenceId }) => {
      const saved = await dbAddPayment({ customerId, amount, note, paymentMethod, referenceId });
      await refreshAll();
      await runOnlineSync();
      return saved;
    },
    [refreshAll, runOnlineSync]
  );

  const getCustomerLedger = useCallback(async (customerId) => {
    return dbGetCustomerLedger(customerId);
  }, []);

  const getBakiKpiSummary = useCallback(async ({ startDateIso, endDateIso, rangeDays }) => {
    return dbGetBakiKpiSummary({ startDateIso, endDateIso, rangeDays });
  }, []);

  const getCollectionsDashboardData = useCallback(async () => {
    if (isOnline && session?.access_token) {
      return fetchCollectionsDashboardOnline({ accessToken: session.access_token });
    }

    return dbGetCollectionsDashboard();
  }, [isOnline, session?.access_token]);

  const getCustomerStatementData = useCallback(async ({ customerId, fromDateIso = null, toDateIso = null } = {}) => {
    if (isOnline && session?.access_token) {
      return fetchCustomerStatementOnline({
        accessToken: session.access_token,
        customerId,
        fromDateIso,
        toDateIso,
      });
    }

    return dbGetCustomerStatement({ customerId, fromDateIso, toDateIso });
  }, [isOnline, session?.access_token]);

  const exportCustomerStatementCsvData = useCallback(async ({ customerId, fromDateIso = null, toDateIso = null } = {}) => {
    if (isOnline && session?.access_token) {
      return exportCustomerStatementCsvOnline({
        accessToken: session.access_token,
        customerId,
        fromDateIso,
        toDateIso,
      });
    }

    const statement = await dbGetCustomerStatement({ customerId, fromDateIso, toDateIso });
    return dbBuildCustomerStatementCsv({ statement });
  }, [isOnline, session?.access_token]);

  const scheduleCustomerReminder = useCallback(async ({
    customerId,
    bakiTransactionId = null,
    channel = 'manual',
    message = null,
    sentAt = null,
    status = 'sent',
    referenceId = null,
  } = {}) => {
    if (isOnline && session?.access_token) {
      const saved = await createCustomerReminderOnline({
        accessToken: session.access_token,
        customerId,
        bakiEntryId: bakiTransactionId,
        channel,
        message,
        sentAt,
        status,
        referenceId,
      });
      await refreshAll();
      await runOnlineSync();
      return saved;
    }

    const saved = await dbScheduleCollectionReminder({
      customerId,
      bakiTransactionId,
      channel,
      message,
      sentAt,
      status,
      referenceId,
    });
    await refreshAll();
    return saved;
  }, [isOnline, refreshAll, runOnlineSync, session?.access_token]);

  const getCustomerReminders = useCallback(async ({ customerId, limit = 100 } = {}) => {
    if (isOnline && session?.access_token) {
      const response = await listCustomerRemindersOnline({ accessToken: session.access_token, customerId, limit });
      return Array.isArray(response?.items) ? response.items : [];
    }

    return dbGetCollectionReminders({ customerId, limit });
  }, [isOnline, session?.access_token]);

  const createCustomerPromise = useCallback(async ({ customerId, promisedAmount, promiseDate, note = null } = {}) => {
    if (isOnline && session?.access_token) {
      const saved = await createPaymentPromiseOnline({
        accessToken: session.access_token,
        customerId,
        promisedAmount,
        promiseDate,
        note,
      });
      await refreshAll();
      await runOnlineSync();
      return saved;
    }

    const saved = await dbCreatePaymentPromise({ customerId, promisedAmount, promiseDate, note });
    await refreshAll();
    return saved;
  }, [isOnline, refreshAll, runOnlineSync, session?.access_token]);

  const getCustomerPromises = useCallback(async ({ customerId = null, status = 'all', limit = 100 } = {}) => {
    if (isOnline && session?.access_token && customerId) {
      const response = await listPaymentPromisesOnline({ accessToken: session.access_token, customerId, status });
      return Array.isArray(response?.items) ? response.items : [];
    }

    return dbGetPaymentPromises({ customerId, status, limit });
  }, [isOnline, session?.access_token]);

  const updateCustomerPromiseStatus = useCallback(async ({ promiseId, status, fulfilledBakiTransactionId = null } = {}) => {
    if (isOnline && session?.access_token) {
      const updated = await updatePaymentPromiseStatusOnline({
        accessToken: session.access_token,
        promiseId,
        status,
      });
      await refreshAll();
      await runOnlineSync();
      return updated;
    }

    const updated = await dbUpdatePaymentPromiseStatus({ promiseId, status, fulfilledBakiTransactionId });
    await refreshAll();
    return updated;
  }, [isOnline, refreshAll, runOnlineSync, session?.access_token]);

  const listApprovalRequests = useCallback(async ({ status = 'PENDING', actionType = null } = {}) => {
    if (!isOnline || !session?.access_token) {
      return [];
    }

    const response = await listApprovalRequestsOnline({
      accessToken: session.access_token,
      status,
      actionType,
    });

    return Array.isArray(response?.items) ? response.items : [];
  }, [isOnline, session?.access_token]);

  const approveApprovalRequest = useCallback(async ({ approvalRequestId, decisionNote = null } = {}) => {
    if (!isOnline || !session?.access_token) {
      throw new Error('Online connection is required to approve requests.');
    }

    const result = await approveApprovalRequestOnline({
      accessToken: session.access_token,
      approvalRequestId,
      decisionNote,
    });
    await refreshAll();
    return result;
  }, [isOnline, refreshAll, session?.access_token]);

  const rejectApprovalRequest = useCallback(async ({ approvalRequestId, decisionNote = null } = {}) => {
    if (!isOnline || !session?.access_token) {
      throw new Error('Online connection is required to reject requests.');
    }

    const result = await rejectApprovalRequestOnline({
      accessToken: session.access_token,
      approvalRequestId,
      decisionNote,
    });
    await refreshAll();
    return result;
  }, [isOnline, refreshAll, session?.access_token]);

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
      initialDataLoading,
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
      createSale,
      getSalesHistory,
      getRecentSoldProducts,
      getSaleReceipt,
      validateSalesMovementConsistency,
      listSuppliers,
      addSupplier,
      updateSupplier,
      deleteSupplier,
      createPurchaseOrder,
      getPurchaseHistory,
      getOpenPurchaseOrders,
      getPurchaseOrderDetails,
      receivePurchaseItems,
      recordSupplierPayment,
      getSupplierPayables,
      validatePurchaseMovementConsistency,
      createExpense,
      getExpenses,
      getCashbookEntries,
      getCashflowSummary,
      getProfitReport,
      getProductMarginReport,
      getDayCloseSnapshot,
      closeBusinessDay,
      getDayCloseReports,
      getInventoryBatches,
      selectBatchForSale,
      getInventoryAlerts,
      refreshInventoryAlerts,
      getDeadStockProducts,
      getInventoryHealthInsights,
      getCycleCounts,
      recordCycleCount,
      validateInventoryBatchConsistency,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      addBaki,
      addBakiPayment,
      getCustomerLedger,
      getBakiKpiSummary,
      getCollectionsDashboardData,
      getCustomerStatementData,
      exportCustomerStatementCsvData,
      scheduleCustomerReminder,
      getCustomerReminders,
      createCustomerPromise,
      getCustomerPromises,
      updateCustomerPromiseStatus,
      getDashboardKpiSummary,
      getDashboardTopActiveCustomers,
      getStockMovementCountInRange,
      getAuditLogs,
      listApprovalRequests,
      approveApprovalRequest,
      rejectApprovalRequest,
      activeRole,
      hasPermission: (action) => checkRolePermission(activeRole, action),
      runOnlineSync,
      getTrustRolloutConfig: () => trustRolloutController.getConfig(),
      setTrustRolloutStage: (stageKey) => trustRolloutController.setRolloutStage(stageKey),
      setTrustRolloutPercentage: (percentage) => trustRolloutController.setRolloutPercentage(percentage),
      getTrustRolloutEvents: () => trustRolloutController.getRecentEvents(),
      getTrustMonitoringSnapshot: () => trustMonitoringEngine.computeSnapshot(),
      getTrustGuardrailAlerts: () => trustMonitoringEngine.getRecentAlerts(),
    }),
    [
      booting,
      initialDataLoading,
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
      createSale,
      getSalesHistory,
      getRecentSoldProducts,
      getSaleReceipt,
      validateSalesMovementConsistency,
      listSuppliers,
      addSupplier,
      updateSupplier,
      deleteSupplier,
      createPurchaseOrder,
      getPurchaseHistory,
      getOpenPurchaseOrders,
      getPurchaseOrderDetails,
      receivePurchaseItems,
      recordSupplierPayment,
      getSupplierPayables,
      validatePurchaseMovementConsistency,
      createExpense,
      getExpenses,
      getCashbookEntries,
      getCashflowSummary,
      getProfitReport,
      getProductMarginReport,
      getDayCloseSnapshot,
      closeBusinessDay,
      getDayCloseReports,
      getInventoryBatches,
      selectBatchForSale,
      getInventoryAlerts,
      refreshInventoryAlerts,
      getDeadStockProducts,
      getInventoryHealthInsights,
      getCycleCounts,
      recordCycleCount,
      validateInventoryBatchConsistency,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      addBaki,
      addBakiPayment,
      getCustomerLedger,
      getBakiKpiSummary,
      getCollectionsDashboardData,
      getCustomerStatementData,
      exportCustomerStatementCsvData,
      scheduleCustomerReminder,
      getCustomerReminders,
      createCustomerPromise,
      getCustomerPromises,
      updateCustomerPromiseStatus,
      getDashboardKpiSummary,
      getDashboardTopActiveCustomers,
      getStockMovementCountInRange,
      getAuditLogs,
      listApprovalRequests,
      approveApprovalRequest,
      rejectApprovalRequest,
      activeRole,
      runOnlineSync,
      trustMonitoringEngine,
      trustRolloutController,
    ]
  );

  if (booting) {
    return <BootLoading title="হিসাব লোড হচ্ছে..." subtitle="পণ্য, কাস্টমার এবং বাকি ডেটা লোড হচ্ছে..." />;
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
    return <BootLoading compact />;
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
  loadingSafeAreaCompact: {
    flex: 1,
    backgroundColor: UI_COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
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
