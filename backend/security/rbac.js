const ROLES = Object.freeze({
  OWNER: 'OWNER',
  CASHIER: 'CASHIER',
  STOCK_MANAGER: 'STOCK_MANAGER',
  ACCOUNTANT: 'ACCOUNTANT',
});

const ACTIONS = Object.freeze({
  PRODUCTS_VIEW: 'products.view',
  CUSTOMERS_VIEW: 'customers.view',
  SALES_CREATE: 'sales.create',
  STOCK_MANAGE: 'stock.manage',
  PURCHASE_MANAGE: 'purchase.manage',
  EXPENSES_MANAGE: 'expenses.manage',
  REPORTS_VIEW: 'reports.view',
  AUDIT_VIEW: 'audit.view',
  TRANSACTIONS_CREATE: 'transactions.create',
  TRANSACTIONS_VIEW: 'transactions.view',
  VOID_SALE_REQUEST: 'void_sale.request',
  VOID_SALE_APPROVE: 'void_sale.approve',
  RETURN_PRODUCT_REQUEST: 'return_product.request',
  RETURN_PRODUCT_APPROVE: 'return_product.approve',
  DISCOUNT_OVERRIDE_REQUEST: 'discount_override.request',
  DISCOUNT_OVERRIDE_APPROVE: 'discount_override.approve',
  APPROVAL_REQUEST_CREATE: 'approval.request.create',
  APPROVAL_REVIEW: 'approval.review',
  BRANCH_MANAGE: 'branch.manage',
  TEAM_USER_MANAGE: 'team_user.manage',
  SYNC_READ: 'sync.read',
  SYNC_WRITE: 'sync.write',
});

const ROLE_ALIASES = Object.freeze({
  owner: ROLES.OWNER,
  admin: ROLES.OWNER,
  manager: ROLES.STOCK_MANAGER,
  auditor: ROLES.ACCOUNTANT,
  user: ROLES.CASHIER,
  cashier: ROLES.CASHIER,
  stock_manager: ROLES.STOCK_MANAGER,
  stockmanager: ROLES.STOCK_MANAGER,
  accountant: ROLES.ACCOUNTANT,
  OWNER: ROLES.OWNER,
  CASHIER: ROLES.CASHIER,
  STOCK_MANAGER: ROLES.STOCK_MANAGER,
  ACCOUNTANT: ROLES.ACCOUNTANT,
});

const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.OWNER]: new Set(['*']),
  [ROLES.CASHIER]: new Set([
    ACTIONS.PRODUCTS_VIEW,
    ACTIONS.CUSTOMERS_VIEW,
    ACTIONS.SALES_CREATE,
    ACTIONS.TRANSACTIONS_CREATE,
    ACTIONS.TRANSACTIONS_VIEW,
    ACTIONS.VOID_SALE_REQUEST,
    ACTIONS.RETURN_PRODUCT_REQUEST,
    ACTIONS.DISCOUNT_OVERRIDE_REQUEST,
    ACTIONS.APPROVAL_REQUEST_CREATE,
    ACTIONS.SYNC_READ,
    ACTIONS.SYNC_WRITE,
  ]),
  [ROLES.STOCK_MANAGER]: new Set([
    ACTIONS.PRODUCTS_VIEW,
    ACTIONS.CUSTOMERS_VIEW,
    ACTIONS.STOCK_MANAGE,
    ACTIONS.PURCHASE_MANAGE,
    ACTIONS.TRANSACTIONS_VIEW,
    ACTIONS.VOID_SALE_REQUEST,
    ACTIONS.VOID_SALE_APPROVE,
    ACTIONS.RETURN_PRODUCT_REQUEST,
    ACTIONS.RETURN_PRODUCT_APPROVE,
    ACTIONS.DISCOUNT_OVERRIDE_REQUEST,
    ACTIONS.DISCOUNT_OVERRIDE_APPROVE,
    ACTIONS.APPROVAL_REQUEST_CREATE,
    ACTIONS.APPROVAL_REVIEW,
    ACTIONS.AUDIT_VIEW,
    ACTIONS.SYNC_READ,
    ACTIONS.SYNC_WRITE,
  ]),
  [ROLES.ACCOUNTANT]: new Set([
    ACTIONS.PRODUCTS_VIEW,
    ACTIONS.CUSTOMERS_VIEW,
    ACTIONS.REPORTS_VIEW,
    ACTIONS.EXPENSES_MANAGE,
    ACTIONS.TRANSACTIONS_CREATE,
    ACTIONS.TRANSACTIONS_VIEW,
    ACTIONS.AUDIT_VIEW,
    ACTIONS.SYNC_READ,
    ACTIONS.SYNC_WRITE,
  ]),
});

const canonicalizeRole = (value, fallback = ROLES.CASHIER) => {
  const token = String(value || '').trim();
  if (!token) {
    return fallback;
  }

  return ROLE_ALIASES[token] || ROLE_ALIASES[token.toLowerCase()] || fallback;
};

const getPermissionsForRole = (role) => {
  const canonicalRole = canonicalizeRole(role);
  return ROLE_PERMISSIONS[canonicalRole] || new Set();
};

const checkPermission = (role, action) => {
  const normalizedAction = String(action || '').trim();
  if (!normalizedAction) {
    return false;
  }

  const permissions = getPermissionsForRole(role);
  return permissions.has('*') || permissions.has(normalizedAction);
};

const listPermissions = (role) => {
  const permissions = getPermissionsForRole(role);
  return permissions.has('*') ? ['*'] : [...permissions];
};

module.exports = {
  ROLES,
  ACTIONS,
  canonicalizeRole,
  checkPermission,
  listPermissions,
};
