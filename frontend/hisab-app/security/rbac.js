export const ROLES = Object.freeze({
  OWNER: 'OWNER',
  CASHIER: 'CASHIER',
  STOCK_MANAGER: 'STOCK_MANAGER',
  ACCOUNTANT: 'ACCOUNTANT',
});

export const ACTIONS = Object.freeze({
  PRODUCTS_VIEW: 'products.view',
  CUSTOMERS_VIEW: 'customers.view',
  SALES_CREATE: 'sales.create',
  STOCK_MANAGE: 'stock.manage',
  PURCHASE_MANAGE: 'purchase.manage',
  EXPENSES_MANAGE: 'expenses.manage',
  REPORTS_VIEW: 'reports.view',
  AUDIT_VIEW: 'audit.view',
  APPROVAL_REVIEW: 'approval.review',
});

const ROLE_ALIASES = Object.freeze({
  owner: ROLES.OWNER,
  admin: ROLES.OWNER,
  manager: ROLES.STOCK_MANAGER,
  auditor: ROLES.ACCOUNTANT,
  user: ROLES.CASHIER,
  cashier: ROLES.CASHIER,
  stock_manager: ROLES.STOCK_MANAGER,
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
  ]),
  [ROLES.STOCK_MANAGER]: new Set([
    ACTIONS.PRODUCTS_VIEW,
    ACTIONS.CUSTOMERS_VIEW,
    ACTIONS.STOCK_MANAGE,
    ACTIONS.PURCHASE_MANAGE,
    ACTIONS.AUDIT_VIEW,
    ACTIONS.APPROVAL_REVIEW,
  ]),
  [ROLES.ACCOUNTANT]: new Set([
    ACTIONS.PRODUCTS_VIEW,
    ACTIONS.CUSTOMERS_VIEW,
    ACTIONS.EXPENSES_MANAGE,
    ACTIONS.REPORTS_VIEW,
    ACTIONS.AUDIT_VIEW,
  ]),
});

export const canonicalizeRole = (value, fallback = ROLES.CASHIER) => {
  const token = String(value || '').trim();
  if (!token) {
    return fallback;
  }

  return ROLE_ALIASES[token] || ROLE_ALIASES[token.toLowerCase()] || fallback;
};

export const checkPermission = (role, action) => {
  const normalizedRole = canonicalizeRole(role);
  const permissions = ROLE_PERMISSIONS[normalizedRole] || new Set();
  if (permissions.has('*')) {
    return true;
  }

  return permissions.has(String(action || '').trim());
};
