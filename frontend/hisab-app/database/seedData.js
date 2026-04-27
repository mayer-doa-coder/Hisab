// Demo data seeder for Hisab app.
// Generates 90 days of realistic Bangladeshi shop data including
// customers, products, baki transactions, and sales with full
// referential integrity and offline/sync-ready structure.
//
// Usage:
//   import { seedDemoData } from './database/seedData';
//   await seedDemoData(userId);   // pass the active userId

import * as SQLite from 'expo-sqlite';

// ─── Seeded RNG (deterministic, seed 1337) ────────────────────────────────────

const createRng = (seed = 1337) => {
  let s = seed >>> 0;
  const next = () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0xFFFFFFFF;
  };
  const int   = (lo, hi) => Math.floor(lo + next() * (hi - lo + 1));
  const pick  = (arr) => arr[Math.floor(next() * arr.length)];
  const bool  = (p = 0.5) => next() < p;
  return { next, int, pick, bool };
};

const rng = createRng(1337);

// ─── Date helpers ─────────────────────────────────────────────────────────────

const TODAY  = new Date('2026-04-27T12:00:00.000Z');
const DAY_MS = 86400000;

const daysAgo  = (n) => new Date(TODAY.getTime() - n * DAY_MS).toISOString();
const addDays  = (iso, n) => new Date(new Date(iso).getTime() + n * DAY_MS).toISOString();
const isoDate  = (n) => daysAgo(n).slice(0, 10);

// Ramadan 2026: Feb 17 – Mar 19. Eid ul-Fitr: Mar 20.
const isRamadan = (iso) => { const d = iso.slice(0, 10); return d >= '2026-02-17' && d <= '2026-03-19'; };
const isPostEid = (iso) => { const d = iso.slice(0, 10); return d >= '2026-03-20' && d <= '2026-04-25'; };

// ─── Products (25 items, prices in BDT) ─────────────────────────────────────

const PRODUCTS = [
  { name: 'আতপ চাল ৫কেজি',         price: 295,  low_stock: 20, initial_qty: 85 },
  { name: 'মিনিকেট চাল ৫কেজি',      price: 345,  low_stock: 20, initial_qty: 70 },
  { name: 'সয়াবিন তেল ১লিটার',      price: 168,  low_stock: 30, initial_qty: 95 },
  { name: 'পাম তেল ১লিটার',          price: 145,  low_stock: 25, initial_qty: 60 },
  { name: 'আটা ১কেজি',               price:  58,  low_stock: 40, initial_qty: 120 },
  { name: 'মসুর ডাল ১কেজি',          price: 135,  low_stock: 20, initial_qty: 55 },
  { name: 'ছোলার ডাল ১কেজি',         price: 120,  low_stock: 15, initial_qty: 40 },
  { name: 'চিনি ১কেজি',              price: 122,  low_stock: 30, initial_qty: 90 },
  { name: 'লবণ ৫০০গ্রাম',            price:  22,  low_stock: 50, initial_qty: 150 },
  { name: 'হলুদ গুঁড়া ১০০গ্রাম',     price:  38,  low_stock: 25, initial_qty: 70 },
  { name: 'মরিচ গুঁড়া ১০০গ্রাম',     price:  48,  low_stock: 25, initial_qty: 65 },
  { name: 'পেঁয়াজ ১কেজি',            price:  62,  low_stock: 30, initial_qty: 80 },
  { name: 'চা পাতা ২০০গ্রাম',         price:  98,  low_stock: 20, initial_qty: 55 },
  { name: 'ব্রিটানিয়া বিস্কুট',       price:  22,  low_stock: 60, initial_qty: 200 },
  { name: 'সেমাই ২০০গ্রাম',           price:  40,  low_stock: 20, initial_qty: 90 }, // popular Ramadan
  { name: 'সাবান (বার)',              price:  40,  low_stock: 40, initial_qty: 110 },
  { name: 'ওয়াশিং পাউডার ৫০০গ্রাম',  price:  88,  low_stock: 20, initial_qty: 60 },
  { name: 'টুথপেস্ট',                price:  55,  low_stock: 20, initial_qty: 50 },
  { name: 'শ্যাম্পু স্যাচেট',          price:   8,  low_stock: 80, initial_qty: 250 },
  { name: 'ডিম (পিস)',               price:  12,  low_stock: 100, initial_qty: 300 },
  { name: 'ব্রেড (লোফ)',             price:  45,  low_stock: 15, initial_qty: 45 },
  { name: 'ঘি ১০০মিলি',              price: 125,  low_stock: 10, initial_qty: 30 },
  { name: 'কোকাকোলা ৩৩০মিলি',       price:  48,  low_stock: 30, initial_qty: 80 },
  { name: 'ম্যাচ বাক্স',             price:   8,  low_stock: 100, initial_qty: 300 },
  { name: 'নারিকেল তেল ২০০মিলি',     price:  95,  low_stock: 15, initial_qty: 45 },
];

// ─── Customers (15, realistic Bangladeshi profiles) ──────────────────────────

const CUSTOMERS = [
  // id (1-indexed), name, phone, behavior, credit_limit, due_terms_days
  { name: 'রহিম মিয়া',       phone: '01711234501', behavior: 'CHAMPION',     credit_limit: 5000,  due_terms: 30 },
  { name: 'করিম উদ্দিন',     phone: '01811234502', behavior: 'SLOW_PAYER',   credit_limit: 3000,  due_terms: 30 },
  { name: 'সালমা বেগম',      phone: '01911234503', behavior: 'NEW_CUSTOMER',  credit_limit: 1000,  due_terms: 21 },
  { name: 'জামাল হোসেন',     phone: '01711234504', behavior: 'CHAMPION',     credit_limit: 8000,  due_terms: 30 },
  { name: 'আব্দুল হালিম',    phone: '01811234505', behavior: 'AT_RISK',      credit_limit: 6000,  due_terms: 30 },
  { name: 'নাসরিন আক্তার',   phone: '01911234506', behavior: 'RELIABLE',     credit_limit: 4000,  due_terms: 30 },
  { name: 'হারুন মিয়া',      phone: '01511234507', behavior: 'STRAINED',     credit_limit: 5000,  due_terms: 21 },
  { name: 'ফারুক মোল্লা',    phone: '01711234508', behavior: 'RECOVERING',   credit_limit: 5000,  due_terms: 30 },
  { name: 'শাহেদা বেগম',     phone: '01811234509', behavior: 'RELIABLE',     credit_limit: 4000,  due_terms: 30 },
  { name: 'আনোয়ার হোসেন',   phone: '01911234510', behavior: 'DORMANT',      credit_limit: 3000,  due_terms: 30 },
  { name: 'ইউসুফ আলী',       phone: '01711234511', behavior: 'SLOW_PAYER',   credit_limit: 3500,  due_terms: 30 },
  { name: 'মর্জিনা বেগম',    phone: '01811234512', behavior: 'NEW_CUSTOMER',  credit_limit: 1000,  due_terms: 21 },
  { name: 'বাবুল মিয়া',      phone: '01611234513', behavior: 'CHAMPION',     credit_limit: 10000, due_terms: 30 },
  { name: 'মজিবর রহমান',     phone: '01711234514', behavior: 'AT_RISK',      credit_limit: 6000,  due_terms: 30 },
  { name: 'তানিয়া আক্তার',   phone: '01811234515', behavior: 'RELIABLE',     credit_limit: 4500,  due_terms: 30 },
];

// ─── Transaction generators per behavior type ─────────────────────────────────

// Returns [{ type, amount_bdt, day_offset, note, payment_method, delay_days }]
// day_offset = days ago from TODAY

function genChampionTx(rng) {
  const txns = [];
  // 7 credit/payment cycles, consistently on-time
  for (let i = 0; i < 7; i++) {
    const daysAgoCredit = 85 - i * 11 + rng.int(0, 2);
    const amount = rng.int(200, 700);
    txns.push({ type: 'credit', amount_bdt: amount, day_offset: daysAgoCredit,
      note: 'নিয়মিত বাকি', is_late: false, delay_days: 0 });
    const payDelay = rng.int(1, 3);
    txns.push({ type: 'payment', amount_bdt: amount, day_offset: daysAgoCredit - payDelay,
      note: 'সম্পূর্ণ পরিশোধ', payment_method: rng.pick(['cash', 'bkash']),
      is_late: false, delay_days: 0 });
  }
  return txns;
}

function genReliableTx(rng) {
  const txns = [];
  for (let i = 0; i < 6; i++) {
    const daysAgoCredit = 83 - i * 12 + rng.int(0, 3);
    const amount = rng.int(300, 1200);
    const ramadan = isRamadan(daysAgo(daysAgoCredit));
    const creditAmount = ramadan ? Math.round(amount * 1.3) : amount;
    txns.push({ type: 'credit', amount_bdt: creditAmount, day_offset: daysAgoCredit,
      note: ramadan ? 'রমজানের বাকি' : 'নিয়মিত বাকি', is_late: false, delay_days: 0 });
    const payDelay = rng.int(3, 8);
    const partialPay = Math.round(creditAmount * rng.next() * 0.4 + 0.6); // 60–100%
    txns.push({ type: 'payment', amount_bdt: partialPay, day_offset: daysAgoCredit - payDelay,
      note: 'পরিশোধ', payment_method: rng.pick(['cash', 'bkash', 'nagad']),
      is_late: payDelay > 7, delay_days: Math.max(0, payDelay - 5) });
  }
  return txns;
}

function genSlowPayerTx(rng) {
  const txns = [];
  for (let i = 0; i < 7; i++) {
    const daysAgoCredit = 86 - i * 11 + rng.int(0, 4);
    const amount = rng.int(300, 1000);
    txns.push({ type: 'credit', amount_bdt: amount, day_offset: daysAgoCredit,
      note: 'বাকি', is_late: false, delay_days: 0 });
    // Pays 10–18 days late
    const delay = rng.int(10, 18);
    if (daysAgoCredit - delay > 0) {
      txns.push({ type: 'payment', amount_bdt: amount, day_offset: daysAgoCredit - delay,
        note: 'দেরিতে পরিশোধ', payment_method: rng.pick(['cash', 'nagad']),
        is_late: true, delay_days: delay - 5 });
    }
  }
  return txns;
}

function genStrainedTx(rng) {
  const txns = [];
  // More credits during Ramadan, irregular small payments
  for (let i = 0; i < 10; i++) {
    const daysAgoCredit = 88 - i * 8 + rng.int(0, 3);
    const ramadan = isRamadan(daysAgo(daysAgoCredit));
    const amount = ramadan ? rng.int(500, 1500) : rng.int(300, 900);
    txns.push({ type: 'credit', amount_bdt: amount, day_offset: daysAgoCredit,
      note: ramadan ? 'রমজানের বাকি (বেশি)' : 'বাকি', is_late: false, delay_days: 0 });
  }
  // Few irregular payments
  const paymentDays = [70, 55, 35, 15];
  for (const d of paymentDays) {
    txns.push({ type: 'payment', amount_bdt: rng.int(300, 700), day_offset: d,
      note: 'আংশিক পরিশোধ', payment_method: 'cash',
      is_late: true, delay_days: rng.int(8, 20) });
  }
  return txns;
}

function genAtRiskTx(rng) {
  const txns = [];
  // Many credits, almost no payments
  for (let i = 0; i < 12; i++) {
    const daysAgoCredit = 88 - i * 7 + rng.int(0, 2);
    const amount = rng.int(400, 1200);
    txns.push({ type: 'credit', amount_bdt: amount, day_offset: daysAgoCredit,
      note: 'বাকি', is_late: false, delay_days: 0 });
  }
  // Only 2 small payments
  txns.push({ type: 'payment', amount_bdt: rng.int(400, 700), day_offset: 60,
    note: 'একমাত্র পরিশোধ', payment_method: 'cash', is_late: true, delay_days: 22 });
  txns.push({ type: 'payment', amount_bdt: rng.int(300, 500), day_offset: 20,
    note: 'আংশিক', payment_method: 'cash', is_late: true, delay_days: 25 });
  return txns;
}

function genRecoveringTx(rng) {
  const txns = [];
  // Bad period: Jan 27 – Feb 28 (accumulated debt)
  for (let i = 0; i < 8; i++) {
    const d = 89 - i * 6;
    if (d > 55) { // Jan 27 – Feb 28
      txns.push({ type: 'credit', amount_bdt: rng.int(400, 1000), day_offset: d,
        note: 'পুরনো বাকি', is_late: false, delay_days: 0 });
    }
  }
  // Recovery phase: started paying regularly in March
  for (let i = 0; i < 5; i++) {
    const d = 50 - i * 8 + rng.int(0, 2);
    txns.push({ type: 'payment', amount_bdt: rng.int(500, 900), day_offset: d,
      note: 'পুনরুদ্ধার - পরিশোধ', payment_method: rng.pick(['cash', 'bkash']),
      is_late: true, delay_days: rng.int(5, 12) });
  }
  return txns;
}

function genDormantTx(rng) {
  // Last transaction was 75+ days ago
  const txns = [];
  for (let i = 0; i < 5; i++) {
    const d = 89 - i * 4;
    if (d > 75) {
      txns.push({ type: 'credit', amount_bdt: rng.int(300, 800), day_offset: d,
        note: 'পুরনো বাকি', is_late: false, delay_days: 0 });
    }
  }
  txns.push({ type: 'payment', amount_bdt: rng.int(200, 400), day_offset: 78,
    note: 'পরিশোধ', payment_method: 'cash', is_late: true, delay_days: 10 });
  return txns;
}

function genNewCustomerTx(rng, idx) {
  // 1–2 transactions in last 3 weeks
  const d1 = rng.int(15, 25);
  return [
    { type: 'credit', amount_bdt: rng.int(200, 600), day_offset: d1,
      note: 'প্রথম বাকি', is_late: false, delay_days: 0 },
    ...(idx % 2 === 0 ? [] : [{
      type: 'credit', amount_bdt: rng.int(150, 400), day_offset: rng.int(5, 12),
      note: 'দ্বিতীয় বাকি', is_late: false, delay_days: 0,
    }]),
  ];
}

const BEHAVIOR_GENERATORS = {
  CHAMPION:     genChampionTx,
  RELIABLE:     genReliableTx,
  SLOW_PAYER:   genSlowPayerTx,
  STRAINED:     genStrainedTx,
  AT_RISK:      genAtRiskTx,
  RECOVERING:   genRecoveringTx,
  DORMANT:      genDormantTx,
  NEW_CUSTOMER: (rng, idx) => genNewCustomerTx(rng, idx),
};

// ─── Sales generator ──────────────────────────────────────────────────────────

// High-frequency products (more likely to appear in sales)
const HIGH_FREQ_PRODUCTS = [0, 2, 4, 7, 8, 9, 10, 13, 14, 18, 19, 23]; // indices into PRODUCTS

function generateDailySales(dayOffset, productIds) {
  // 0–4 sales per day (Ramadan: slightly more)
  const ram = isRamadan(daysAgo(dayOffset));
  const maxSales = ram ? 5 : 4;
  const salesCount = rng.int(0, maxSales);

  const sales = [];
  for (let s = 0; s < salesCount; s++) {
    const itemCount = rng.int(1, 4);
    const items = [];
    let totalCents = 0;
    const usedProducts = new Set();

    for (let it = 0; it < itemCount; it++) {
      let pidx;
      // 70% chance of high-frequency product
      if (rng.bool(0.70)) {
        pidx = rng.pick(HIGH_FREQ_PRODUCTS);
      } else {
        pidx = rng.int(0, PRODUCTS.length - 1);
      }
      if (usedProducts.has(pidx)) continue; // no duplicate products per sale
      usedProducts.add(pidx);

      const qty = rng.int(1, 5);
      const unitCents = Math.round(PRODUCTS[pidx].price * 100);
      const subtotalCents = qty * unitCents;
      totalCents += subtotalCents;
      items.push({ product_idx: pidx, qty, unit_price_cents: unitCents, subtotal_cents: subtotalCents });
    }

    if (items.length === 0) continue;

    // Payment mode: 75% cash, 10% bkash, 10% nagad, 5% bank
    const payMode = rng.next() < 0.75 ? 'CASH' :
                    rng.next() < 0.67 ? 'BKASH' :
                    rng.next() < 0.50 ? 'NAGAD' : 'BANK';

    sales.push({ dayOffset, totalCents, payMode, items });
  }
  return sales;
}

// ─── Main seeder ──────────────────────────────────────────────────────────────

export async function seedDemoData(userId) {
  const db = SQLite.openDatabaseSync('hisab.db');
  const uid = Number(userId);

  if (!uid || !Number.isFinite(uid)) throw new Error('seedDemoData: valid userId required');

  const now  = TODAY.toISOString();
  const sync = now;

  // ── 1. Clear existing data for this user ────────────────────────────────
  await db.execAsync(`DELETE FROM sales_items    WHERE user_id = ${uid};`);
  await db.execAsync(`DELETE FROM sales_header   WHERE user_id = ${uid};`);
  await db.execAsync(`DELETE FROM baki_transactions WHERE user_id = ${uid};`);
  await db.execAsync(`DELETE FROM customers      WHERE user_id = ${uid};`);
  await db.execAsync(`DELETE FROM products       WHERE user_id = ${uid};`);

  // ── 2. Insert products ──────────────────────────────────────────────────
  const productIds = [];
  for (let i = 0; i < PRODUCTS.length; i++) {
    const p = PRODUCTS[i];
    const cref = `demo_product_${i + 1}`;
    const result = await db.runAsync(
      `INSERT INTO products (user_id, name, quantity, price, low_stock_threshold, client_ref_id, sync_version, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      uid, p.name, p.initial_qty, p.price, p.low_stock, cref, daysAgo(90)
    );
    productIds.push(Number(result.lastInsertRowId));
  }

  // ── 3. Insert customers ─────────────────────────────────────────────────
  const customerIds = [];
  for (let i = 0; i < CUSTOMERS.length; i++) {
    const c = CUSTOMERS[i];
    const cref = `demo_customer_${i + 1}`;
    const result = await db.runAsync(
      `INSERT INTO customers (user_id, name, phone, credit_limit, current_balance, risk_level, due_terms_days,
                              verification_level, client_ref_id, sync_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, 'low', ?, 'L0', ?, 1, ?, ?)`,
      uid, c.name, c.phone, c.credit_limit, c.due_terms, cref, daysAgo(90), now
    );
    customerIds.push(Number(result.lastInsertRowId));
  }

  // ── 4. Generate and insert baki transactions ────────────────────────────
  const customerBalances = new Array(CUSTOMERS.length).fill(0);

  for (let ci = 0; ci < CUSTOMERS.length; ci++) {
    const behavior = CUSTOMERS[ci].behavior;
    const genFn    = BEHAVIOR_GENERATORS[behavior] || genReliableTx;
    const txns     = genFn(rng, ci).sort((a, b) => b.day_offset - a.day_offset); // oldest first

    let runningDue = 0;

    for (const tx of txns) {
      const txDate = daysAgo(tx.day_offset);
      const amtCents = Math.round(tx.amount_bdt * 100);
      if (amtCents <= 0) continue;

      if (tx.type === 'credit') {
        const dueDate = addDays(txDate, CUSTOMERS[ci].due_terms);
        const status  = new Date(dueDate) < TODAY ? 'overdue' : 'open';
        runningDue += amtCents;

        await db.runAsync(
          `INSERT INTO baki_transactions
             (user_id, customer_id, type, amount_cents, due_date, status, note, payment_method,
              client_ref_id, sync_version, sync_updated_at, created_at)
           VALUES (?, ?, 'credit', ?, ?, ?, ?, NULL, ?, 1, ?, ?)`,
          uid, customerIds[ci], amtCents, dueDate, status,
          tx.note || 'বাকি',
          `demo_bt_c${ci}_${tx.day_offset}_cr`,
          txDate, txDate
        );
      } else {
        runningDue = Math.max(0, runningDue - amtCents);
        const pmStatus = runningDue <= 0 ? 'paid' : 'open';

        await db.runAsync(
          `INSERT INTO baki_transactions
             (user_id, customer_id, type, amount_cents, due_date, status, note, payment_method,
              resolved_at, client_ref_id, sync_version, sync_updated_at, created_at)
           VALUES (?, ?, 'payment', ?, NULL, 'paid', ?, ?, ?, ?, 1, ?, ?)`,
          uid, customerIds[ci], amtCents,
          tx.note || 'পরিশোধ',
          tx.payment_method || 'cash',
          txDate,
          `demo_bt_c${ci}_${tx.day_offset}_pm`,
          txDate, txDate
        );

        // If now all paid, mark open/overdue credits as paid
        if (runningDue <= 0) {
          await db.runAsync(
            `UPDATE baki_transactions SET status='paid', resolved_at=? WHERE customer_id=? AND user_id=? AND type='credit' AND status IN ('open','overdue')`,
            txDate, customerIds[ci], uid
          );
        }
      }
    }

    customerBalances[ci] = runningDue;
  }

  // ── 5. Update customer current_balance and risk_level ──────────────────
  for (let ci = 0; ci < CUSTOMERS.length; ci++) {
    const balanceBdt   = customerBalances[ci] / 100;
    const riskLevel    = balanceBdt >= 3000 ? 'high' : balanceBdt >= 1000 ? 'medium' : 'low';
    await db.runAsync(
      `UPDATE customers SET current_balance=?, risk_level=?, updated_at=? WHERE id=? AND user_id=?`,
      balanceBdt, riskLevel, now, customerIds[ci], uid
    );
  }

  // ── 6. Generate and insert sales ───────────────────────────────────────
  // Track per-product quantity consumed during seeding
  const qtySold = new Array(PRODUCTS.length).fill(0);
  let receiptCounter = 1;

  for (let d = 90; d >= 0; d--) {
    const daySales = generateDailySales(d, productIds);
    for (const sale of daySales) {
      const receiptId = `DEMO${String(receiptCounter++).padStart(5, '0')}`;
      const txDate = daysAgo(d);

      const shResult = await db.runAsync(
        `INSERT INTO sales_header
           (user_id, receipt_id, timestamp, total_amount_cents, payment_mode, status,
            client_ref_id, sync_version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'posted', ?, 1, ?, ?)`,
        uid, receiptId, txDate, sale.totalCents, sale.payMode,
        `demo_sh_${receiptId}`, txDate, txDate
      );
      const shId = Number(shResult.lastInsertRowId);

      for (const item of sale.items) {
        const pid = productIds[item.product_idx];
        await db.runAsync(
          `INSERT INTO sales_items
             (user_id, sales_header_id, product_id, quantity, unit_price_cents, subtotal_cents,
              client_ref_id, sync_version, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          uid, shId, pid, item.qty, item.unit_price_cents, item.subtotal_cents,
          `demo_si_${receiptId}_${item.product_idx}`, txDate
        );
        qtySold[item.product_idx] += item.qty;
      }
    }
  }

  // ── 7. Adjust product quantities to reflect 90 days of sales ───────────
  // Set quantity = initial_qty - total_sold (min 0, ensures realistic stock)
  for (let i = 0; i < PRODUCTS.length; i++) {
    const remaining = Math.max(0, PRODUCTS[i].initial_qty - qtySold[i]);
    await db.runAsync(
      `UPDATE products SET quantity=? WHERE id=? AND user_id=?`,
      remaining, productIds[i], uid
    );
  }

  return {
    customers:    customerIds.length,
    products:     productIds.length,
    bakiEntries:  CUSTOMERS.reduce((s, c) => s + (BEHAVIOR_GENERATORS[c.behavior]?.(createRng(1337), 0).length ?? 0), 0),
    salesHeaders: receiptCounter - 1,
  };
}

/**
 * Check if demo data has already been seeded for this user.
 */
export async function isDemoDataSeeded(userId) {
  const db = SQLite.openDatabaseSync('hisab.db');
  const row = await db.getFirstAsync(
    `SELECT COUNT(*) as cnt FROM customers WHERE user_id=? AND client_ref_id LIKE 'demo_%'`,
    Number(userId)
  );
  return Number(row?.cnt || 0) > 0;
}

/**
 * Clear all demo data for a user (useful for re-seeding in dev).
 */
export async function clearDemoData(userId) {
  const db = SQLite.openDatabaseSync('hisab.db');
  const uid = Number(userId);

  // Get demo customer and product IDs
  const demoCustIds = (await db.getAllAsync(
    `SELECT id FROM customers WHERE user_id=? AND client_ref_id LIKE 'demo_%'`, uid
  )).map((r) => r.id);

  const demoProdIds = (await db.getAllAsync(
    `SELECT id FROM products WHERE user_id=? AND client_ref_id LIKE 'demo_%'`, uid
  )).map((r) => r.id);

  if (demoCustIds.length > 0) {
    const ids = demoCustIds.join(',');
    await db.execAsync(`DELETE FROM baki_transactions WHERE customer_id IN (${ids}) AND user_id=${uid};`);
    await db.execAsync(`DELETE FROM customers WHERE id IN (${ids}) AND user_id=${uid};`);
  }

  if (demoProdIds.length > 0) {
    const pids = demoProdIds.join(',');
    // Get sales_header ids that have only demo items
    const shIds = (await db.getAllAsync(
      `SELECT DISTINCT sales_header_id FROM sales_items WHERE product_id IN (${pids}) AND user_id=${uid}`
    )).map((r) => r.sales_header_id);

    if (shIds.length > 0) {
      const sids = shIds.join(',');
      await db.execAsync(`DELETE FROM sales_items WHERE sales_header_id IN (${sids}) AND user_id=${uid};`);
      await db.execAsync(`DELETE FROM sales_header WHERE id IN (${sids}) AND user_id=${uid};`);
    }

    await db.execAsync(`DELETE FROM products WHERE id IN (${pids}) AND user_id=${uid};`);
  }
}
