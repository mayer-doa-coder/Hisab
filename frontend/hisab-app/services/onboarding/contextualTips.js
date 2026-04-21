export const SHOP_TYPE_OPTIONS = Object.freeze([
  { key: 'grocery', label: 'Grocery' },
  { key: 'pharmacy', label: 'Pharmacy' },
  { key: 'general_store', label: 'General Store' },
]);

const FEATURE_TIPS = Object.freeze({
  sales: 'Tip: Keep product names short and searchable to reduce checkout time.',
  inventory: 'Tip: Set reorder levels for top-selling SKUs first; tune later.',
  credit: 'Tip: Record payment on receipt, not end-of-day, to keep baki accurate.',
  reports: 'Tip: Review daily report with shop owner before closing shift.',
});

export const getContextualTip = (feature) => {
  const key = String(feature || '').trim().toLowerCase();
  return FEATURE_TIPS[key] || FEATURE_TIPS.sales;
};

export const getShopTypeStarterTemplate = (shopType) => {
  const key = String(shopType || '').trim().toLowerCase();

  if (key === 'pharmacy') {
    return {
      title: 'Pharmacy Starter',
      focus: 'expiry tracking emphasis',
      steps: [
        'Add medicine batches with expiry date.',
        'Enable low-stock + expiry alerts.',
        'Run expiry report at opening and before close.',
      ],
    };
  }

  if (key === 'grocery') {
    return {
      title: 'Grocery Starter',
      focus: 'fast POS setup',
      steps: [
        'Add top 50 fast-moving items first.',
        'Verify barcode or quick-search behavior.',
        'Train cashier on sale-create and payment flow.',
      ],
    };
  }

  return {
    title: 'General Store Starter',
    focus: 'balanced setup',
    steps: [
      'Configure products, customers, and payment methods.',
      'Set credit terms for recurring customers.',
      'Validate daily dashboard and report exports.',
    ],
  };
};

export const getDashboardTip = ({ period = 'daily', totalCustomers = 0, isOnline = false } = {}) => {
  if (!isOnline) {
    return 'You are offline. Continue recording sales and sync once internet returns.';
  }

  if (String(period) === 'daily') {
    return 'Daily habit: review digital sales ratio before closing and coach any operator below target.';
  }

  if (Number(totalCustomers) < 10) {
    return 'Add repeat buyers as customers early; retention metrics improve with cleaner customer history.';
  }

  return 'Weekly habit: compare DAO trend with feedback categories to find adoption friction quickly.';
};
