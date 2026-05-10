export const LEDGER_FILTERS = {
  ALL: 'all',
  BAKI: 'baki',
  PAYMENTS: 'payments',
};

const roundToTwo = (value) => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value * 100) / 100;
};

export const normalizeLedgerRows = (rows) =>
  (rows || []).map((row) => {
    const amountChange = Number(row.amount_change);
    const normalizedAmountChange = Number.isFinite(amountChange) ? amountChange : 0;

    return {
      ...row,
      event_type: String(row.event_type || '').toLowerCase() === 'payment' ? 'payment' : 'credit',
      amount_change: roundToTwo(normalizedAmountChange),
      event_at: row.event_at || row.created_at || null,
    };
  });

export const applyLedgerFilter = (rows, filterType = LEDGER_FILTERS.ALL) => {
  if (filterType === LEDGER_FILTERS.BAKI) {
    return (rows || []).filter((row) => row.event_type === 'credit');
  }

  if (filterType === LEDGER_FILTERS.PAYMENTS) {
    return (rows || []).filter((row) => row.event_type === 'payment');
  }

  return rows || [];
};

export const buildLedgerTimeline = (rows) => {
  let runningDue = 0;

  return (rows || []).map((row) => {
    runningDue += Number(row.amount_change || 0);

    return {
      ...row,
      running_due: roundToTwo(runningDue),
    };
  });
};

export const getLedgerSummary = (rows) => {
  const totals = (rows || []).reduce(
    (acc, row) => {
      const amount = Number(row.amount_change || 0);

      if (row.event_type === 'credit' && amount > 0) {
        acc.totalBaki += amount;
      }

      if (row.event_type === 'payment' && amount < 0) {
        acc.totalPayments += Math.abs(amount);
      }

      return acc;
    },
    {
      totalBaki: 0,
      totalPayments: 0,
    }
  );

  const closingDue = Math.max(0, totals.totalBaki - totals.totalPayments);

  return {
    totalBaki: roundToTwo(totals.totalBaki),
    totalPayments: roundToTwo(totals.totalPayments),
    closingDue: roundToTwo(closingDue),
  };
};
