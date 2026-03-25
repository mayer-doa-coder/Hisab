export const CUSTOMER_DUE_FILTERS = {
  ALL: 'all',
  DUE_ONLY: 'due-only',
  NO_DUE: 'no-due',
};

export const CUSTOMER_SORT_OPTIONS = {
  RECENT: 'recent',
  NAME_ASC: 'name-asc',
  NAME_DESC: 'name-desc',
  DUE_DESC: 'due-desc',
  DUE_ASC: 'due-asc',
};

export const normalizeDueAmount = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }

  return numeric;
};

const normalizeText = (value) => String(value || '').trim().toLowerCase();

export const applyCustomerSearchFilterSort = (
  fullCustomers,
  {
    searchText = '',
    dueFilter = CUSTOMER_DUE_FILTERS.ALL,
    sortBy = CUSTOMER_SORT_OPTIONS.RECENT,
  } = {}
) => {
  const query = normalizeText(searchText);

  const filtered = (fullCustomers || []).filter((customer) => {
    const due = normalizeDueAmount(customer.total_due);

    if (dueFilter === CUSTOMER_DUE_FILTERS.DUE_ONLY && due <= 0) {
      return false;
    }

    if (dueFilter === CUSTOMER_DUE_FILTERS.NO_DUE && due > 0) {
      return false;
    }

    if (!query) {
      return true;
    }

    const name = normalizeText(customer.name);
    const phone = normalizeText(customer.phone);

    return name.includes(query) || phone.includes(query);
  });

  const sorted = [...filtered].sort((left, right) => {
    const leftDue = normalizeDueAmount(left.total_due);
    const rightDue = normalizeDueAmount(right.total_due);

    if (sortBy === CUSTOMER_SORT_OPTIONS.NAME_ASC) {
      return normalizeText(left.name).localeCompare(normalizeText(right.name));
    }

    if (sortBy === CUSTOMER_SORT_OPTIONS.NAME_DESC) {
      return normalizeText(right.name).localeCompare(normalizeText(left.name));
    }

    if (sortBy === CUSTOMER_SORT_OPTIONS.DUE_DESC) {
      return rightDue - leftDue;
    }

    if (sortBy === CUSTOMER_SORT_OPTIONS.DUE_ASC) {
      return leftDue - rightDue;
    }

    return Number(right.id || 0) - Number(left.id || 0);
  });

  return sorted;
};
