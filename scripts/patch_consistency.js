const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, 'frontend', 'hisab-app');
const f = (rel) => path.join(BASE, ...rel.split('/'));

function patch(rel, pairs) {
  const file = f(rel);
  let src = fs.readFileSync(file, 'utf8');
  let changed = false;
  for (const [from, to] of pairs) {
    if (src.includes(from)) {
      src = src.split(from).join(to);
      changed = true;
      process.stdout.write('  ✓ ' + JSON.stringify(from).slice(0, 70) + '\n');
    } else {
      process.stdout.write('  ✗ NOT FOUND: ' + JSON.stringify(from).slice(0, 70) + '\n');
    }
  }
  if (changed) fs.writeFileSync(file, src, 'utf8');
}

// ══════════════════════════════════════════════════════════════════════════════
// StockMovementScreen.js
// ══════════════════════════════════════════════════════════════════════════════
console.log('\nStockMovementScreen.js');
patch('screens/StockMovementScreen.js', [
  // Movement type labels
  ["{ label: 'Stock In (+)', value: 'in' }", "{ label: 'স্টক ইন (+)', value: 'in' }"],
  ["{ label: 'Stock Out (-)', value: 'out' }", "{ label: 'স্টক আউট (-)', value: 'out' }"],
  ["{ label: 'Adjust (+/-)', value: 'adjust' }", "{ label: 'সমন্বয় (+/-)', value: 'adjust' }"],
  // Reason/category labels
  ["{ label: 'Damage', value: 'DAMAGE' }", "{ label: 'ক্ষতি', value: 'DAMAGE' }"],
  ["{ label: 'Expiry', value: 'EXPIRY' }", "{ label: 'মেয়াদ শেষ', value: 'EXPIRY' }"],
  ["{ label: 'Adjustment', value: 'ADJUSTMENT' }", "{ label: 'সমন্বয়', value: 'ADJUSTMENT' }"],
  // Picker item label
  ["label={`${item.name} (Qty: ${item.quantity})`}", "label={`${item.name} (পরিমাণ: ${item.quantity})`}"],
  // Current quantity hint
  ["Current Quantity: {selectedProduct.quantity}", "বর্তমান পরিমাণ: {selectedProduct.quantity}"],
  // Buttons
  ["saving ? 'Saving...' : 'Save Movement'", "saving ? 'সেভ হচ্ছে...' : 'মুভমেন্ট সেভ করুন'"],
  ["loadingHistory ? 'Loading...' : 'Reload'", "loadingHistory ? 'লোড হচ্ছে...' : 'পুনরায় লোড'"],
  // Empty + loading states
  ["loadingHistory ? 'Loading movement history...' : 'No movement found.'",
   "loadingHistory ? 'মুভমেন্ট ইতিহাস লোড হচ্ছে...' : 'কোনো মুভমেন্ট পাওয়া যায়নি।'"],
  // History row labels
  ["Before: {item.quantity_before} | After: {item.quantity_after}",
   "আগে: {item.quantity_before} | পরে: {item.quantity_after}"],
  ["Date: {formatDateTime(item.created_at)}", "তারিখ: {formatDateTime(item.created_at)}"],
]);

// ══════════════════════════════════════════════════════════════════════════════
// PurchaseOrderScreen.js
// ══════════════════════════════════════════════════════════════════════════════
console.log('\nPurchaseOrderScreen.js');
patch('screens/PurchaseOrderScreen.js', [
  ["'Please select a product first.'", "'আগে একটি পণ্য বেছে নিন।'"],
  [">Order Total: {formatMoney(orderTotal)}<", ">অর্ডার মোট: {formatMoney(orderTotal)}<"],
  ["saving ? 'Creating...' : 'Create Purchase Order'",
   "saving ? 'তৈরি হচ্ছে...' : 'ক্রয় আদেশ তৈরি করুন'"],
  ["refreshing ? 'Refreshing...' : 'Refresh'", "refreshing ? 'রিফ্রেশ হচ্ছে...' : 'রিফ্রেশ'"],
  ["loadingHistory ? 'লোড হচ্ছে...' : 'No purchase orders yet.'",
   "loadingHistory ? 'লোড হচ্ছে...' : 'এখনো কোনো ক্রয় আদেশ নেই।'"],
  ["Ordered: {item.ordered_qty_total} | Received: {item.received_qty_total}",
   "অর্ডার: {item.ordered_qty_total} | গৃহীত: {item.received_qty_total}"],
  ["Total: {formatMoney(item.total_amount)} | Paid: {formatMoney(item.paid_amount)} | Due: {formatMoney(item.due_amount)}",
   "মোট: {formatMoney(item.total_amount)} | পরিশোধ: {formatMoney(item.paid_amount)} | বাকি: {formatMoney(item.due_amount)}"],
]);

// ══════════════════════════════════════════════════════════════════════════════
// PurchaseHistoryScreen.js
// ══════════════════════════════════════════════════════════════════════════════
console.log('\nPurchaseHistoryScreen.js');
patch('screens/PurchaseHistoryScreen.js', [
  // Status filter options
  ["{ label: 'All Status', value: '' }", "{ label: 'সব অবস্থা', value: '' }"],
  ["{ label: 'Pending', value: 'pending' }", "{ label: 'অপেক্ষাধীন', value: 'pending' }"],
  ["{ label: 'Partial', value: 'partial' }", "{ label: 'আংশিক', value: 'partial' }"],
  ["{ label: 'Received', value: 'received' }", "{ label: 'গৃহীত', value: 'received' }"],
  ["{ label: 'Cancelled', value: 'cancelled' }", "{ label: 'বাতিল', value: 'cancelled' }"],
  // Buttons
  ["loading ? 'লোড হচ্ছে...' : 'Apply Filters'", "loading ? 'লোড হচ্ছে...' : 'ফিল্টার প্রয়োগ করুন'"],
  ["refreshing ? 'Refreshing...' : 'রিফ্রেশ'", "refreshing ? 'রিফ্রেশ হচ্ছে...' : 'রিফ্রেশ'"],
  // Summary text
  ["Rows: {rows.length} | Due in view: {formatMoney(totalDueInView)}",
   "রেকর্ড: {rows.length} | মোট বাকি: {formatMoney(totalDueInView)}"],
  // Post payment button
  ["savingPayment ? 'Posting...' : 'Post Payment'",
   "savingPayment ? 'জমা হচ্ছে...' : 'পেমেন্ট জমা দিন'"],
  // Integrity check label
  ["Purchase Received Qty: {consistency.purchase_received_quantity}",
   "গৃহীত পরিমাণ: {consistency.purchase_received_quantity}"],
  // Empty state
  ["loading ? 'লোড হচ্ছে...' : 'No purchase rows found.'",
   "loading ? 'লোড হচ্ছে...' : 'কোনো ক্রয় রেকর্ড পাওয়া যায়নি।'"],
  // History row labels
  ["Ordered: {item.ordered_qty_total} | Received: {item.received_qty_total}",
   "অর্ডার: {item.ordered_qty_total} | গৃহীত: {item.received_qty_total}"],
  // "No phone" in customer picker label
  ["row.phone || 'No phone'", "row.phone || 'ফোন নেই'"],
]);

// ══════════════════════════════════════════════════════════════════════════════
// GoodsReceiveScreen.js
// ══════════════════════════════════════════════════════════════════════════════
console.log('\nGoodsReceiveScreen.js');
patch('screens/GoodsReceiveScreen.js', [
  ["'Select a purchase order first.'", "'প্রথমে একটি ক্রয় আদেশ বেছে নিন।'"],
  ["'Enter quantity for at least one pending item.'", "'অন্তত একটি মুলতুবি আইটেমের পরিমাণ লিখুন।'"],
  ["'Stock updated and movement entries were recorded automatically.'",
   "'স্টক আপডেট হয়েছে এবং মুভমেন্ট স্বয়ংক্রিয়ভাবে রেকর্ড হয়েছে।'"],
  ["submitting ? 'Posting...' : 'Receive Selected Qty'",
   "submitting ? 'জমা হচ্ছে...' : 'নির্বাচিত পরিমাণ গ্রহণ করুন'"],
  ["refreshing || loading ? 'Refreshing...' : 'Refresh'",
   "refreshing || loading ? 'রিফ্রেশ হচ্ছে...' : 'রিফ্রেশ'"],
  ["loading ? 'Loading...' : 'No pending receive items for selected order.'",
   "loading ? 'লোড হচ্ছে...' : 'নির্বাচিত অর্ডারে কোনো মুলতুবি আইটেম নেই।'"],
  ["Ordered: {item.ordered_qty} | Received: {item.received_qty} | Pending: {item.pending_qty}",
   "অর্ডার: {item.ordered_qty} | গৃহীত: {item.received_qty} | মুলতুবি: {item.pending_qty}"],
]);

// ══════════════════════════════════════════════════════════════════════════════
// SupplierScreen.js
// ══════════════════════════════════════════════════════════════════════════════
console.log('\nSupplierScreen.js');
patch('screens/SupplierScreen.js', [
  ["'Delete Supplier'", "'সরবরাহকারী মুছুন'"],
  ["{ text: 'Delete',", "{ text: 'মুছুন',"],
]);

// ══════════════════════════════════════════════════════════════════════════════
// CashbookScreen.js
// ══════════════════════════════════════════════════════════════════════════════
console.log('\nCashbookScreen.js');
patch('screens/CashbookScreen.js', [
  [">Inflow: {formatMoney(summary.total_in)}<", ">আয়: {formatMoney(summary.total_in)}<"],
  [">Outflow: {formatMoney(summary.total_out)}<", ">ব্যয়: {formatMoney(summary.total_out)}<"],
  [">Net: {formatMoney(summary.net_cashflow)}<", ">নেট: {formatMoney(summary.net_cashflow)}<"],
  ["loading ? 'লোড হচ্ছে...' : 'No cashbook entries found.'",
   "loading ? 'লোড হচ্ছে...' : 'কোনো ক্যাশবুক এন্ট্রি পাওয়া যায়নি।'"],
  ["item.note || 'No note'", "item.note || 'নোট নেই'"],
]);

// ══════════════════════════════════════════════════════════════════════════════
// DayCloseScreen.js
// ══════════════════════════════════════════════════════════════════════════════
console.log('\nDayCloseScreen.js');
patch('screens/DayCloseScreen.js', [
  ["'Business date is required (YYYY-MM-DD).'",
   "'ব্যবসার তারিখ দিন (বছর-মাস-দিন)।'"],
  ["`Day ${businessDate} closed successfully.`",
   "`${businessDate} দিন সফলভাবে বন্ধ হয়েছে।`"],
  ["closing ? 'Closing...' : 'Close Day'",
   "closing ? 'বন্ধ হচ্ছে...' : 'দিন বন্ধ করুন'"],
  [">Snapshot ({snapshot.business_date})<",
   ">দিনের সারসংক্ষেপ ({snapshot.business_date})<"],
  [">Opening: {formatMoney(snapshot.opening_balance)}<",
   ">খোলা: {formatMoney(snapshot.opening_balance)}<"],
  [">Inflow: {formatMoney(snapshot.total_in)}<",
   ">আয়: {formatMoney(snapshot.total_in)}<"],
  [">Outflow: {formatMoney(snapshot.total_out)}<",
   ">ব্যয়: {formatMoney(snapshot.total_out)}<"],
  [">Expected Closing: {formatMoney(snapshot.closing_balance)}<",
   ">প্রত্যাশিত বন্ধ: {formatMoney(snapshot.closing_balance)}<"],
  ["Closed: {formatMoney(snapshot.existing_close.cash_on_hand)} | Variance: {formatMoney(snapshot.existing_close.variance)}",
   "বন্ধ নগদ: {formatMoney(snapshot.existing_close.cash_on_hand)} | পার্থক্য: {formatMoney(snapshot.existing_close.variance)}"],
  ["loading ? 'Loading...' : 'No day close records yet.'",
   "loading ? 'লোড হচ্ছে...' : 'এখনো কোনো দিন বন্ধ রেকর্ড নেই।'"],
  ["Opening: {formatMoney(item.opening_balance)} | Closing: {formatMoney(item.closing_balance)}",
   "খোলা: {formatMoney(item.opening_balance)} | বন্ধ: {formatMoney(item.closing_balance)}"],
  ["Cash: {formatMoney(item.cash_on_hand)} | Variance: {formatMoney(item.variance)}",
   "নগদ: {formatMoney(item.cash_on_hand)} | পার্থক্য: {formatMoney(item.variance)}"],
  ["Status: {item.status.toUpperCase()}", "অবস্থা: {item.status.toUpperCase()}"],
  ["item.note || 'No note'", "item.note || 'নোট নেই'"],
]);

// ══════════════════════════════════════════════════════════════════════════════
// ReportsScreen.js
// ══════════════════════════════════════════════════════════════════════════════
console.log('\nReportsScreen.js');
patch('screens/ReportsScreen.js', [
  // Report type options
  ["{ key: 'sales', label: 'Sales' }", "{ key: 'sales', label: 'বিক্রি' }"],
  ["{ key: 'inventory', label: 'Inventory' }", "{ key: 'inventory', label: 'ইনভেন্টরি' }"],
  ["{ key: 'finance', label: 'Finance' }", "{ key: 'finance', label: 'আর্থিক' }"],
  ["{ key: 'collections', label: 'Collections' }", "{ key: 'collections', label: 'সংগ্রহ' }"],
  // Period options
  ["{ key: 'daily', label: 'Daily' }", "{ key: 'daily', label: 'দৈনিক' }"],
  ["{ key: 'weekly', label: 'Weekly' }", "{ key: 'weekly', label: 'সাপ্তাহিক' }"],
  ["{ key: 'monthly', label: 'Monthly' }", "{ key: 'monthly', label: 'মাসিক' }"],
  // Buttons
  ["loading ? 'লোড হচ্ছে...' : 'Refresh'", "loading ? 'লোড হচ্ছে...' : 'রিফ্রেশ'"],
  ["snapshotLoading ? 'Capturing...' : 'Capture Snapshot'",
   "snapshotLoading ? 'ক্যাপচার হচ্ছে...' : 'স্ন্যাপশট নিন'"],
  // Financial metric labels
  [">Total Sales: {formatMetricValue(taxSummary.totalSales)}<",
   ">মোট বিক্রি: {formatMetricValue(taxSummary.totalSales)}<"],
  [">Total Expenses: {formatMetricValue(taxSummary.totalExpenses)}<",
   ">মোট খরচ: {formatMetricValue(taxSummary.totalExpenses)}<"],
  [">Net Profit: {formatMetricValue(taxSummary.netProfit)}<",
   ">নেট লাভ: {formatMetricValue(taxSummary.netProfit)}<"],
  [">All Reconciled: {reconciliation.allReconciled ? 'Yes' : 'No'}<",
   ">সব সমন্বিত: {reconciliation.allReconciled ? 'হ্যাঁ' : 'না'}<"],
  // Export buttons
  ["exporting ? 'Exporting...' : 'Export CSV'",
   "exporting ? 'রপ্তানি হচ্ছে...' : 'CSV রপ্তানি'"],
  ["exporting ? 'Exporting...' : 'Export PDF'",
   "exporting ? 'রপ্তানি হচ্ছে...' : 'PDF রপ্তানি'"],
  // Empty / loading
  ["loading ? 'Loading details...' : 'No detailed rows available.'",
   "loading ? 'বিস্তারিত লোড হচ্ছে...' : 'কোনো বিস্তারিত রেকর্ড নেই।'"],
]);

// ══════════════════════════════════════════════════════════════════════════════
// CustomerStatementScreen.js — "No phone" in Picker label
// ══════════════════════════════════════════════════════════════════════════════
console.log('\nCustomerStatementScreen.js');
patch('screens/CustomerStatementScreen.js', [
  ["row.phone || 'No phone'", "row.phone || 'ফোন নেই'"],
]);

// ══════════════════════════════════════════════════════════════════════════════
// ProductListScreen.js — Delete button
// ══════════════════════════════════════════════════════════════════════════════
console.log('\nProductListScreen.js');
patch('screens/ProductListScreen.js', [
  // Check for any remaining English delete-related alerts
  ["{ text: 'Delete',", "{ text: 'মুছুন',"],
]);

console.log('\nDone.');
