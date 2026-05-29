import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback } from 'react';
import CustomDrawerContent from '../components/navigation/CustomDrawerContent';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { ACTIONS as RBAC_ACTIONS, checkPermission as checkRolePermission, canonicalizeRole } from '../security/rbac';
import { UI_COLORS } from '../constants/ui-theme';
import { COLORS } from '../theme/colors';
import AlertsScreen from '../screens/AlertsScreen';
import ApprovalRequestsScreen from '../screens/ApprovalRequestsScreen';
import AuditHistoryScreen from '../screens/AuditHistoryScreen';
import BackupRestoreScreen from '../screens/BackupRestoreScreen';
import BakiListScreen from '../screens/BakiListScreen';
import CashbookScreen from '../screens/CashbookScreen';
import CollectionsDashboardScreen from '../screens/CollectionsDashboardScreen';
import CustomerCreditScreen from '../screens/CustomerCreditScreen';
import CustomerLedgerScreen from '../screens/CustomerLedgerScreen';
import CustomerListScreen from '../screens/CustomerListScreen';
import CustomerStatementScreen from '../screens/CustomerStatementScreen';
import CycleCountScreen from '../screens/CycleCountScreen';
import DashboardScreen from '../screens/DashboardScreen';
import DayCloseScreen from '../screens/DayCloseScreen';
import ExpenseScreen from '../screens/ExpenseScreen';
import FeedbackScreen from '../screens/FeedbackScreen';
import GoodsReceiveScreen from '../screens/GoodsReceiveScreen';
import HelpCenterScreen from '../screens/HelpCenterScreen';
import InventoryBatchViewScreen from '../screens/InventoryBatchViewScreen';
import OfflineQueueMonitor from '../screens/OfflineQueueMonitor';
import OnboardingScreen from '../screens/OnboardingScreen';
import ProductDetailsScreen from '../screens/ProductDetailsScreen';
import ProductListScreen from '../screens/ProductListScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ProfitReportScreen from '../screens/ProfitReportScreen';
import PurchaseHistoryScreen from '../screens/PurchaseHistoryScreen';
import PurchaseOrderScreen from '../screens/PurchaseOrderScreen';
import ReportsScreen from '../screens/ReportsScreen';
import SalesHistoryScreen from '../screens/SalesHistoryScreen';
import SalesScreen from '../screens/SalesScreen';
import StockMovementScreen from '../screens/StockMovementScreen';
import StockSuggestionsScreen from '../screens/StockSuggestionsScreen';
import SupplierScreen from '../screens/SupplierScreen';
import SyncConflictScreen from '../screens/SyncConflictScreen';
import VoiceAssistantScreen from '../screens/VoiceAssistantScreen';
import VoicePackDownloadScreen from '../screens/VoicePackDownloadScreen';
import { Drawer } from './navigators';

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

export function MainSidebarNavigator() {
  const { user } = useAuth();
  const { mapText } = useLanguage();
  const activeRole = canonicalizeRole(user?.role);
  const canAccessRoute = useCallback((routeName) => {
    const requiredAction = ROUTE_REQUIRED_ACTIONS[routeName] || null;
    if (!requiredAction) return true;
    return checkRolePermission(activeRole, requiredAction);
  }, [activeRole]);

  return (
    <Drawer.Navigator
      initialRouteName="Dashboard"
      drawerContent={(drawerProps) => <CustomDrawerContent {...drawerProps} canAccess={canAccessRoute} />}
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.sidebarBackground },
        headerTintColor: COLORS.sidebarActiveText,
        headerTitleStyle: { fontFamily: 'AnekBangla_700Bold', letterSpacing: 0.2 },
        sceneStyle: { backgroundColor: UI_COLORS.background },
        drawerStyle: { backgroundColor: COLORS.sidebarBackground, width: 280 },
      }}>
      <Drawer.Screen name="Dashboard" component={DashboardScreen}
        options={({ navigation }) => ({
          title: mapText('ড্যাশবোর্ড'),
          headerTitle: mapText('ব্যবসার ড্যাশবোর্ড'),
          headerRight: () => (
            <MaterialIcons name="account-circle" size={26} color={COLORS.sidebarActiveText}
              style={{ marginRight: 14 }} onPress={() => navigation.navigate('Profile')} />
          ),
        })} />
      <Drawer.Screen name="Reports" component={ReportsScreen}
        options={{ title: mapText('রিপোর্ট'), headerTitle: mapText('রিপোর্ট ও সম্মতি') }} />
      <Drawer.Screen name="SyncConflicts" component={SyncConflictScreen}
        options={{ title: mapText('সিঙ্ক দ্বন্দ্ব'), headerTitle: mapText('সিঙ্ক দ্বন্দ্ব') }} />
      <Drawer.Screen name="OfflineQueue" component={OfflineQueueMonitor}
        options={{ title: mapText('অফলাইন সারি'), headerTitle: mapText('অফলাইন সারি') }} />
      <Drawer.Screen name="BackupRestore" component={BackupRestoreScreen}
        options={{ title: mapText('ব্যাকআপ'), headerTitle: mapText('ব্যাকআপ ও পুনরুদ্ধার') }} />
      <Drawer.Screen name="StockSuggestions" component={StockSuggestionsScreen}
        options={{ title: mapText('পরামর্শ'), headerTitle: mapText('স্টক পরামর্শ') }} />
      <Drawer.Screen name="Profile" component={ProfileScreen}
        options={{ title: mapText('প্রোফাইল'), headerTitle: mapText('প্রোফাইল ও সেটিংস') }} />
      <Drawer.Screen name="Audit" component={AuditHistoryScreen}
        options={{ title: mapText('অডিট'), headerTitle: mapText('অডিট ইতিহাস') }} />
      <Drawer.Screen name="ApprovalRequests" component={ApprovalRequestsScreen}
        options={{ title: mapText('অনুমোদন'), headerTitle: mapText('অনুমোদনের অনুরোধ') }} />
      <Drawer.Screen name="Sales" component={SalesScreen}
        options={{ title: mapText('বিক্রি'), headerTitle: mapText('বিক্রি ও রসিদ') }} />
      <Drawer.Screen name="SalesHistory" component={SalesHistoryScreen}
        options={{ title: mapText('বিক্রির ইতিহাস'), headerTitle: mapText('বিক্রির ইতিহাস') }} />
      <Drawer.Screen name="Suppliers" component={SupplierScreen}
        options={{ title: mapText('সরবরাহকারী'), headerTitle: mapText('সরবরাহকারী') }} />
      <Drawer.Screen name="PurchaseOrders" component={PurchaseOrderScreen}
        options={{ title: mapText('ক্রয় আদেশ'), headerTitle: mapText('ক্রয় আদেশ') }} />
      <Drawer.Screen name="GoodsReceive" component={GoodsReceiveScreen}
        options={{ title: mapText('পণ্য গ্রহণ'), headerTitle: mapText('পণ্য গ্রহণ') }} />
      <Drawer.Screen name="PurchaseHistory" component={PurchaseHistoryScreen}
        options={{ title: mapText('ক্রয়ের ইতিহাস'), headerTitle: mapText('ক্রয়ের ইতিহাস ও পরিশোধযোগ্য') }} />
      <Drawer.Screen name="Cashbook" component={CashbookScreen}
        options={{ title: mapText('ক্যাশবুক'), headerTitle: mapText('ক্যাশবুক ও জার্নাল') }} />
      <Drawer.Screen name="Expenses" component={ExpenseScreen}
        options={{ title: mapText('খরচ'), headerTitle: mapText('খরচ ব্যবস্থাপনা') }} />
      <Drawer.Screen name="ProfitReport" component={ProfitReportScreen}
        options={{ title: mapText('লাভ রিপোর্ট'), headerTitle: mapText('লাভ ও মার্জিন রিপোর্ট') }} />
      <Drawer.Screen name="DayClose" component={DayCloseScreen}
        options={{ title: mapText('দিন বন্ধ'), headerTitle: mapText('দিন বন্ধের সারসংক্ষেপ') }} />
      <Drawer.Screen name="InventoryBatches" component={InventoryBatchViewScreen}
        options={{ title: mapText('ইনভেন্টরি ব্যাচ'), headerTitle: mapText('ব্যাচ ও মেয়াদ ক্রম') }} />
      <Drawer.Screen name="Alerts" component={AlertsScreen}
        options={{ title: mapText('সতর্কতা'), headerTitle: mapText('স্টক সতর্কতা') }} />
      <Drawer.Screen name="CycleCount" component={CycleCountScreen}
        options={{ title: mapText('চক্র গণনা'), headerTitle: mapText('চক্র গণনা ও সামঞ্জস্য') }} />
      <Drawer.Screen name="Products" component={ProductListScreen}
        options={{ title: mapText('পণ্য'), headerTitle: mapText('পণ্য তালিকা') }} />
      <Drawer.Screen name="Customers" component={CustomerListScreen}
        options={{ title: mapText('কাস্টমার'), headerTitle: mapText('কাস্টমার') }} />
      <Drawer.Screen name="Ledger" component={CustomerLedgerScreen}
        options={{ title: mapText('খাতা'), headerTitle: mapText('কাস্টমার খাতা') }} />
      <Drawer.Screen name="Baki" component={BakiListScreen}
        options={{ title: mapText('বাকি'), headerTitle: mapText('বাকির তালিকা') }} />
      <Drawer.Screen name="CustomerCredit" component={CustomerCreditScreen}
        options={{ title: mapText('ক্রেডিট'), headerTitle: mapText('কাস্টমার ক্রেডিট') }} />
      <Drawer.Screen name="Collections" component={CollectionsDashboardScreen}
        options={{ title: mapText('সংগ্রহ'), headerTitle: mapText('সংগ্রহ ড্যাশবোর্ড') }} />
      <Drawer.Screen name="CustomerStatement" component={CustomerStatementScreen}
        options={{ title: mapText('বিবৃতি'), headerTitle: mapText('কাস্টমার বিবৃতি') }} />
      <Drawer.Screen name="Onboarding" component={OnboardingScreen}
        options={{ title: mapText('অনবোর্ডিং'), headerTitle: mapText('পাইলট অনবোর্ডিং') }} />
      <Drawer.Screen name="HelpCenter" component={HelpCenterScreen}
        options={{ title: mapText('সাহায্য'), headerTitle: mapText('সাহায্য কেন্দ্র') }} />
      <Drawer.Screen name="Feedback" component={FeedbackScreen}
        options={{ title: mapText('ফিডব্যাক'), headerTitle: mapText('ফিডব্যাক') }} />
      <Drawer.Screen name="VoiceAssistant" component={VoiceAssistantScreen}
        options={{ title: mapText('ভয়েস সহকারী'), headerTitle: mapText('ভয়েস কমান্ড') }} />
      <Drawer.Screen name="VoicePackDownload" component={VoicePackDownloadScreen}
        options={{ title: mapText('ভয়েস প্যাক'), headerTitle: mapText('ভয়েস প্যাক ডাউনলোড') }} />
      <Drawer.Screen name="Movement" component={StockMovementScreen}
        options={{ title: mapText('চলাচল'), headerTitle: mapText('স্টক চলাচল') }} />
      <Drawer.Screen name="Details" component={ProductDetailsScreen}
        options={{ title: mapText('বিবরণ'), headerTitle: mapText('পণ্যের বিবরণ') }} />
    </Drawer.Navigator>
  );
}
