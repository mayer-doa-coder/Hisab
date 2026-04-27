'use strict';

// Bangladesh seasonal model for customer payment behavior.
// Key events that materially shift credit/collection patterns for small shops.

// ─── Known Eid dates (month is 1-indexed) ────────────────────────────────────

const EID_UL_FITR = [
  { year: 2024, month: 4,  day: 10 },
  { year: 2025, month: 3,  day: 30 },
  { year: 2026, month: 3,  day: 20 },
  { year: 2027, month: 3,  day:  9 },
  { year: 2028, month: 2,  day: 27 },
];

const EID_UL_ADHA = [
  { year: 2024, month: 6,  day: 16 },
  { year: 2025, month: 6,  day:  6 },
  { year: 2026, month: 5,  day: 26 },
  { year: 2027, month: 5,  day: 16 },
  { year: 2028, month: 5,  day:  5 },
];

// Lunar calendar shifts ~11 days earlier per Gregorian year
const LUNAR_SHIFT_DAYS = 10.875;

// ─── Season keys ─────────────────────────────────────────────────────────────

const SEASON = Object.freeze({
  NORMAL:          'NORMAL',
  PRE_RAMADAN:     'PRE_RAMADAN',
  RAMADAN:         'RAMADAN',
  EID_FITR:        'EID_FITR',
  POST_EID_DEBT:   'POST_EID_DEBT',
  EID_ADHA:        'EID_ADHA',
  HARVEST_BORO:    'HARVEST_BORO',   // rice harvest May 15–Jun 15
  HARVEST_AMAN:    'HARVEST_AMAN',   // rice harvest Nov 15–Dec 15
  POHELA_BOISHAKH: 'POHELA_BOISHAKH',// Bengali New Year Apr 14 ±3 days
});

// ─── Season labels (Bengali) ──────────────────────────────────────────────────

const SEASON_LABELS = Object.freeze({
  NORMAL:          'সাধারণ সময়',
  PRE_RAMADAN:     'রমজানের আগে',
  RAMADAN:         'রমজান মাস',
  EID_FITR:        'ঈদুল ফিতর',
  POST_EID_DEBT:   'ঈদ পরবর্তী ঋণ পরিশোধ',
  EID_ADHA:        'ঈদুল আযহা',
  HARVEST_BORO:    'বোরো ফসল তোলা',
  HARVEST_AMAN:    'আমন ফসল তোলা',
  POHELA_BOISHAKH: 'পহেলা বৈশাখ',
});

// ─── Multiplicative adjustments per season, per destination state ─────────────
// Values > 1 increase the probability of ending up in that state.
// Values < 1 decrease it. Applied to distribution then renormalized.

const SEASON_MULTIPLIERS = Object.freeze({
  NORMAL: null,

  PRE_RAMADAN: {
    CHAMPION: 0.95, RELIABLE: 0.95, SLOW_PAYER: 1.10,
    RECOVERING: 0.95, STRAINED: 1.15, AT_RISK: 1.20,
    NEW_CUSTOMER: 1.05, DORMANT: 1.00,
  },

  RAMADAN: {
    // Extended credit, collection harder during fasting month
    CHAMPION: 0.78, RELIABLE: 0.82, SLOW_PAYER: 1.20,
    RECOVERING: 0.75, STRAINED: 1.40, AT_RISK: 1.50,
    NEW_CUSTOMER: 1.15, DORMANT: 0.90,
  },

  EID_FITR: {
    // Bonus cash flows but also heavy spending — net slightly negative for debt
    CHAMPION: 0.88, RELIABLE: 0.90, SLOW_PAYER: 1.15,
    RECOVERING: 1.00, STRAINED: 1.25, AT_RISK: 1.30,
    NEW_CUSTOMER: 1.20, DORMANT: 1.00,
  },

  POST_EID_DEBT: {
    // 3–5 weeks after Eid: strong debt repayment impulse
    CHAMPION: 1.12, RELIABLE: 1.18, SLOW_PAYER: 0.90,
    RECOVERING: 1.40, STRAINED: 0.88, AT_RISK: 0.82,
    NEW_CUSTOMER: 1.00, DORMANT: 0.88,
  },

  EID_ADHA: {
    // Qurbani spending, similar to Eid ul-Fitr but shorter impact window
    CHAMPION: 0.85, RELIABLE: 0.88, SLOW_PAYER: 1.12,
    RECOVERING: 0.88, STRAINED: 1.28, AT_RISK: 1.35,
    NEW_CUSTOMER: 1.10, DORMANT: 1.00,
  },

  HARVEST_BORO: {
    // May–Jun Boro rice harvest: rural customers flush with cash
    CHAMPION: 1.18, RELIABLE: 1.22, SLOW_PAYER: 0.85,
    RECOVERING: 1.45, STRAINED: 0.80, AT_RISK: 0.72,
    NEW_CUSTOMER: 1.10, DORMANT: 0.88,
  },

  HARVEST_AMAN: {
    // Nov–Dec Aman rice harvest: similar cash-in effect
    CHAMPION: 1.12, RELIABLE: 1.15, SLOW_PAYER: 0.90,
    RECOVERING: 1.38, STRAINED: 0.85, AT_RISK: 0.78,
    NEW_CUSTOMER: 1.05, DORMANT: 0.90,
  },

  POHELA_BOISHAKH: {
    // Bengali New Year: debt settlements + new credit cycle
    CHAMPION: 1.12, RELIABLE: 1.08, SLOW_PAYER: 0.95,
    RECOVERING: 1.22, STRAINED: 0.95, AT_RISK: 0.90,
    NEW_CUSTOMER: 1.18, DORMANT: 1.00,
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toJsDate = ({ year, month, day }) =>
  new Date(Date.UTC(year, month - 1, day));

const addDays = (date, n) => new Date(date.getTime() + n * 86400000);

const daysBetween = (a, b) => Math.round((b - a) / 86400000);

// Find the known Eid date closest to (and including) the given year.
// Falls back to linear estimation if outside the known table.
const resolveEidDate = (table, year) => {
  const known = table.find((d) => d.year === year);
  if (known) return toJsDate(known);

  // Estimate by extrapolating from the nearest known year
  const sorted = [...table].sort((a, b) => Math.abs(a.year - year) - Math.abs(b.year - year));
  const anchor = sorted[0];
  const delta = year - anchor.year;
  const base = toJsDate(anchor);
  return addDays(base, Math.round(-delta * LUNAR_SHIFT_DAYS));
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Determine which seasonal period a date falls into.
 * @param {Date|string} date
 * @returns {{ season, label_bn, start, end }}
 */
function getSeasonalPeriod(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) {
    return { season: SEASON.NORMAL, label_bn: SEASON_LABELS.NORMAL, start: null, end: null };
  }

  const year = d.getUTCFullYear();

  // ── Pohela Boishakh (April 14 ±3 days) ──────────────────────────────────
  const boishakh = new Date(Date.UTC(year, 3, 14)); // April 14
  if (Math.abs(daysBetween(boishakh, d)) <= 3) {
    return {
      season: SEASON.POHELA_BOISHAKH,
      label_bn: SEASON_LABELS.POHELA_BOISHAKH,
      start: addDays(boishakh, -3).toISOString(),
      end:   addDays(boishakh,  3).toISOString(),
    };
  }

  // ── Eid ul-Fitr windows ───────────────────────────────────────────────────
  const eidFitr = resolveEidDate(EID_UL_FITR, year);
  const ramadanStart  = addDays(eidFitr, -30); // Ramadan starts ~30 days before Eid
  const preRamadan    = addDays(ramadanStart, -14);
  const eidFitrEnd    = addDays(eidFitr, 5);
  const postEidEnd    = addDays(eidFitr, 35);

  if (d >= preRamadan && d < ramadanStart) {
    return { season: SEASON.PRE_RAMADAN, label_bn: SEASON_LABELS.PRE_RAMADAN,
      start: preRamadan.toISOString(), end: ramadanStart.toISOString() };
  }
  if (d >= ramadanStart && d < eidFitr) {
    return { season: SEASON.RAMADAN, label_bn: SEASON_LABELS.RAMADAN,
      start: ramadanStart.toISOString(), end: eidFitr.toISOString() };
  }
  if (d >= eidFitr && d < eidFitrEnd) {
    return { season: SEASON.EID_FITR, label_bn: SEASON_LABELS.EID_FITR,
      start: eidFitr.toISOString(), end: eidFitrEnd.toISOString() };
  }
  if (d >= eidFitrEnd && d < postEidEnd) {
    return { season: SEASON.POST_EID_DEBT, label_bn: SEASON_LABELS.POST_EID_DEBT,
      start: eidFitrEnd.toISOString(), end: postEidEnd.toISOString() };
  }

  // ── Eid ul-Adha window ────────────────────────────────────────────────────
  const eidAdha    = resolveEidDate(EID_UL_ADHA, year);
  const eidAdhaEnd = addDays(eidAdha, 10);
  if (d >= addDays(eidAdha, -3) && d < eidAdhaEnd) {
    return { season: SEASON.EID_ADHA, label_bn: SEASON_LABELS.EID_ADHA,
      start: addDays(eidAdha, -3).toISOString(), end: eidAdhaEnd.toISOString() };
  }

  // ── Harvest seasons ───────────────────────────────────────────────────────
  const month = d.getUTCMonth() + 1; // 1-indexed
  if (month === 5 || (month === 6 && d.getUTCDate() <= 15)) {
    return { season: SEASON.HARVEST_BORO, label_bn: SEASON_LABELS.HARVEST_BORO,
      start: new Date(Date.UTC(year, 4, 15)).toISOString(),
      end:   new Date(Date.UTC(year, 5, 15)).toISOString() };
  }
  if (month === 11 || (month === 12 && d.getUTCDate() <= 15)) {
    return { season: SEASON.HARVEST_AMAN, label_bn: SEASON_LABELS.HARVEST_AMAN,
      start: new Date(Date.UTC(year, 10, 15)).toISOString(),
      end:   new Date(Date.UTC(year, 11, 15)).toISOString() };
  }

  return { season: SEASON.NORMAL, label_bn: SEASON_LABELS.NORMAL, start: null, end: null };
}

/**
 * Returns raw multipliers for a date (null = no adjustment).
 */
function getSeasonalMultipliers(date) {
  const { season } = getSeasonalPeriod(date);
  return SEASON_MULTIPLIERS[season] || null;
}

/**
 * Apply seasonal multipliers to a next-state probability distribution.
 * Multipliers are applied to each state's probability, then the
 * distribution is renormalized so it still sums to 1.
 *
 * @param {Object} distribution  - { STATE: probability, ... }
 * @param {Date|string} date
 * @param {string[]} states
 * @returns {{ distribution, season, adjustment_applied, label_bn }}
 */
function applySeasonalAdjustment(distribution, date, states) {
  const periodInfo = getSeasonalPeriod(date);
  const multipliers = SEASON_MULTIPLIERS[periodInfo.season];

  if (!multipliers) {
    return {
      distribution,
      season: periodInfo.season,
      label_bn: periodInfo.label_bn,
      adjustment_applied: false,
    };
  }

  const raw = {};
  let total = 0;
  for (const s of states) {
    const p = Math.max(0, Number(distribution[s] || 0));
    const m = Number(multipliers[s] || 1.0);
    raw[s] = p * m;
    total += raw[s];
  }

  const adjusted = {};
  if (total <= 0) {
    const uniform = 1 / Math.max(1, states.length);
    for (const s of states) adjusted[s] = uniform;
  } else {
    for (const s of states) adjusted[s] = Number((raw[s] / total).toFixed(8));
  }

  return {
    distribution: adjusted,
    season: periodInfo.season,
    label_bn: periodInfo.label_bn,
    adjustment_applied: true,
    period_start: periodInfo.start,
    period_end: periodInfo.end,
  };
}

module.exports = {
  SEASON,
  SEASON_LABELS,
  SEASON_MULTIPLIERS,
  getSeasonalPeriod,
  getSeasonalMultipliers,
  applySeasonalAdjustment,
};
