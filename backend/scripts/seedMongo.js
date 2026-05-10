'use strict';

/**
 * MongoDB demo data seeder for Hisab.
 * Mirrors the SQLite seedData.js: 15 customers, 25 products, 90 days of
 * sales + baki entries, inventory movements, referential integrity.
 *
 * Usage:
 *   node backend/scripts/seedMongo.js [--clear]
 *
 * Environment variables:
 *   MONGO_URI     — required
 *   SEED_USER_EMAIL — email of the demo user to seed under (default: demo@hisab.app)
 *   SEED_USER_NAME  — display name (default: Demo Shop)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const User = require('../models/User');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const BakiEntry = require('../models/BakiEntry');
const SalesHeader = require('../models/SalesHeader');
const SalesItem = require('../models/SalesItem');
const InventoryMovement = require('../models/InventoryMovement');

// ─── Deterministic RNG (same seed as SQLite seeder) ──────────────────────────

let rngState = 1337 >>> 0;
function rng() {
  rngState = (Math.imul(1664525, rngState) + 1013904223) >>> 0;
  return rngState / 4294967296;
}
function rngInt(min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}
function rngPick(arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// ─── Time helpers ─────────────────────────────────────────────────────────────

const NOW = new Date('2026-04-27T12:00:00.000Z');
const DAY_MS = 86400000;

function daysAgo(n) {
  return new Date(NOW.getTime() - n * DAY_MS);
}
function addDays(date, n) {
  return new Date(date.getTime() + n * DAY_MS);
}
function isRamadan(date) {
  const iso = date.toISOString().slice(0, 10);
  return iso >= '2026-02-17' && iso <= '2026-03-19';
}

// ─── Products (same 25 as SQLite seeder) ─────────────────────────────────────

const PRODUCT_CATALOG = [
  { name: 'আতপ চাল ৫কেজি',      sku: 'RICE-5KG',  unit: 'bag',  price: 295,  reorder: 10, initial: 120 },
  { name: 'সয়াবিন তেল ১লিটার',   sku: 'OIL-SOY-1L', unit: 'bottle', price: 168, reorder: 15, initial: 200 },
  { name: 'ডিম (পিস)',           sku: 'EGG-PCS',  unit: 'pcs',  price: 12,   reorder: 50, initial: 600 },
  { name: 'আটা ২কেজি',           sku: 'FLOUR-2KG', unit: 'bag',  price: 78,   reorder: 20, initial: 150 },
  { name: 'চিনি ১কেজি',          sku: 'SUGAR-1KG', unit: 'kg',   price: 120,  reorder: 20, initial: 180 },
  { name: 'মসুর ডাল ১কেজি',      sku: 'LENTIL-1KG', unit: 'kg',  price: 130,  reorder: 15, initial: 160 },
  { name: 'লবণ ১কেজি',           sku: 'SALT-1KG',  unit: 'kg',   price: 35,   reorder: 30, initial: 250 },
  { name: 'হলুদ গুঁড়া ২০০গ্রাম', sku: 'TURMERIC-200G', unit: 'pack', price: 45, reorder: 20, initial: 200 },
  { name: 'মরিচ গুঁড়া ২০০গ্রাম', sku: 'CHILI-200G',  unit: 'pack', price: 55, reorder: 15, initial: 180 },
  { name: 'পেঁয়াজ ১কেজি',        sku: 'ONION-1KG',  unit: 'kg',   price: 65,  reorder: 25, initial: 300 },
  { name: 'রসুন ২৫০গ্রাম',       sku: 'GARLIC-250G', unit: 'pack', price: 40, reorder: 20, initial: 220 },
  { name: 'আদা ২৫০গ্রাম',        sku: 'GINGER-250G', unit: 'pack', price: 38, reorder: 20, initial: 200 },
  { name: 'সাবান (লাক্স)',        sku: 'SOAP-LUX',   unit: 'pcs',  price: 55,  reorder: 20, initial: 150 },
  { name: 'শ্যাম্পু স্যাচেট',     sku: 'SHAMPOO-SAC', unit: 'pcs', price: 10,  reorder: 50, initial: 400 },
  { name: 'টুথপেস্ট ছোট',        sku: 'TPASTE-SM',  unit: 'pcs',  price: 45,  reorder: 20, initial: 200 },
  { name: 'বিস্কুট প্যাকেট',     sku: 'BISCUIT-PK', unit: 'pack', price: 20,  reorder: 30, initial: 300 },
  { name: 'চা পাতা ২০০গ্রাম',    sku: 'TEA-200G',   unit: 'pack', price: 85,  reorder: 15, initial: 150 },
  { name: 'দুধ গুঁড়া ৫০০গ্রাম',  sku: 'MILK-PW-500G', unit: 'pack', price: 220, reorder: 10, initial: 100 },
  { name: 'নুডলস প্যাকেট',       sku: 'NOODLES-PK', unit: 'pack', price: 25,  reorder: 25, initial: 250 },
  { name: 'কোক ৩৩০মিলি',         sku: 'COKE-330ML', unit: 'can',  price: 40,  reorder: 30, initial: 200 },
  { name: 'পানি ৫০০মিলি',        sku: 'WATER-500ML', unit: 'bottle', price: 15, reorder: 50, initial: 400 },
  { name: 'সিগারেট (স্টার)',      sku: 'CIG-STAR',   unit: 'pcs',  price: 12,  reorder: 100, initial: 500 },
  { name: 'ম্যাচ বাক্স',         sku: 'MATCH-BOX',  unit: 'pcs',  price: 5,   reorder: 50, initial: 400 },
  { name: 'মোমবাতি ৬পিস',        sku: 'CANDLE-6',   unit: 'pack', price: 30,  reorder: 20, initial: 180 },
  { name: 'ব্যাটারি AA (২পিস)',   sku: 'BATT-AA2',   unit: 'pack', price: 45,  reorder: 15, initial: 150 },
];

// High-frequency product indices (rice, oil, eggs, onion, cigarettes, water)
const HIGH_FREQ_IDXS = [0, 1, 2, 9, 21, 20, 15, 16];

// ─── Customer definitions ─────────────────────────────────────────────────────

const CUSTOMER_DEFS = [
  { name: 'রহিম মিয়া',    phone: '01711-100001', address: 'উত্তর পাড়া, ময়মনসিংহ',   creditLimit: 5000,  dueTermsDays: 14, archetype: 'CHAMPION' },
  { name: 'জামাল হোসেন',   phone: '01711-100002', address: 'পূর্ব বাজার, নেত্রকোণা',  creditLimit: 4000,  dueTermsDays: 14, archetype: 'CHAMPION' },
  { name: 'বাবুল শেখ',     phone: '01711-100003', address: 'দক্ষিণ পাড়া, কিশোরগঞ্জ', creditLimit: 4500,  dueTermsDays: 14, archetype: 'CHAMPION' },
  { name: 'নাসরিন বেগম',   phone: '01712-200001', address: 'পশ্চিম মহল্লা, টাঙ্গাইল',  creditLimit: 3000,  dueTermsDays: 21, archetype: 'RELIABLE' },
  { name: 'শাহেদা খানম',   phone: '01712-200002', address: 'মধ্য বাজার, জামালপুর',    creditLimit: 3500,  dueTermsDays: 21, archetype: 'RELIABLE' },
  { name: 'তানিয়া আক্তার', phone: '01712-200003', address: 'নতুন পাড়া, শেরপুর',      creditLimit: 2500,  dueTermsDays: 21, archetype: 'RELIABLE' },
  { name: 'করিম উদ্দিন',   phone: '01713-300001', address: 'বাজার রোড, নরসিংদী',      creditLimit: 2000,  dueTermsDays: 30, archetype: 'SLOW_PAYER' },
  { name: 'ইউসুফ আলী',     phone: '01713-300002', address: 'হাট এলাকা, মানিকগঞ্জ',    creditLimit: 2000,  dueTermsDays: 30, archetype: 'SLOW_PAYER' },
  { name: 'হারুন রশিদ',    phone: '01714-400001', address: 'পুরানো বাজার, মুন্সীগঞ্জ', creditLimit: 3000,  dueTermsDays: 30, archetype: 'STRAINED' },
  { name: 'আবদুল মালেক',   phone: '01715-500001', address: 'শিল্প এলাকা, নারায়ণগঞ্জ', creditLimit: 4000,  dueTermsDays: 30, archetype: 'AT_RISK' },
  { name: 'মজিবর রহমান',   phone: '01715-500002', address: 'পুরানো ঢাকা, মিরপুর',     creditLimit: 3500,  dueTermsDays: 30, archetype: 'AT_RISK' },
  { name: 'ফারুক হোসেন',   phone: '01716-600001', address: 'রেলওয়ে পাড়া, গাজীপুর',   creditLimit: 3000,  dueTermsDays: 21, archetype: 'RECOVERING' },
  { name: 'আনোয়ার হোসেন',  phone: '01717-700001', address: 'দূরের গ্রাম, ময়মনসিংহ',   creditLimit: 2000,  dueTermsDays: 30, archetype: 'DORMANT' },
  { name: 'সালমা বেগম',    phone: '01718-800001', address: 'নতুন কলোনি, ঢাকা',        creditLimit: 1500,  dueTermsDays: 14, archetype: 'NEW_CUSTOMER' },
  { name: 'মরজিনা খাতুন',  phone: '01718-800002', address: 'উত্তর বাড়ি, সাভার',       creditLimit: 1500,  dueTermsDays: 14, archetype: 'NEW_CUSTOMER' },
];

// ─── Baki transaction generators per archetype ────────────────────────────────

function generateBakiTransactions(archetype) {
  const txs = [];
  switch (archetype) {
    case 'CHAMPION': {
      for (let i = 7; i >= 1; i--) {
        const creditDate = daysAgo(i * 12 + rngInt(0, 3));
        const amt = rngInt(300, 900);
        txs.push({ type: 'credit', amount: amt, daysAgo: (NOW - creditDate) / DAY_MS });
        const payAmt = amt + rngInt(-50, 50);
        const payDate = addDays(creditDate, rngInt(1, 3));
        txs.push({ type: 'payment', amount: Math.max(payAmt, 50), date: payDate });
      }
      break;
    }
    case 'RELIABLE': {
      for (let i = 6; i >= 1; i--) {
        const creditDate = daysAgo(i * 14 + rngInt(0, 4));
        const amt = rngInt(400, 1100);
        txs.push({ type: 'credit', amount: amt, date: creditDate });
        const payDate = addDays(creditDate, rngInt(3, 8));
        txs.push({ type: 'payment', amount: amt, date: payDate });
      }
      break;
    }
    case 'SLOW_PAYER': {
      for (let i = 7; i >= 1; i--) {
        const creditDate = daysAgo(i * 11 + rngInt(0, 4));
        const amt = rngInt(200, 700);
        txs.push({ type: 'credit', amount: amt, date: creditDate });
        if (i > 3) {
          const payDate = addDays(creditDate, rngInt(10, 18));
          txs.push({ type: 'payment', amount: amt, date: payDate });
        }
      }
      break;
    }
    case 'STRAINED': {
      for (let i = 10; i >= 1; i--) {
        const creditDate = daysAgo(i * 9);
        const ramadanBoost = isRamadan(creditDate) ? 1.3 : 1.0;
        const amt = Math.round(rngInt(300, 800) * ramadanBoost);
        txs.push({ type: 'credit', amount: amt, date: creditDate });
      }
      txs.push({ type: 'payment', amount: rngInt(200, 500), date: daysAgo(60) });
      txs.push({ type: 'payment', amount: rngInt(100, 300), date: daysAgo(30) });
      break;
    }
    case 'AT_RISK': {
      for (let i = 12; i >= 1; i--) {
        const creditDate = daysAgo(i * 7 + rngInt(0, 3));
        const amt = rngInt(200, 600);
        txs.push({ type: 'credit', amount: amt, date: creditDate });
      }
      txs.push({ type: 'payment', amount: rngInt(300, 700), date: daysAgo(70) });
      txs.push({ type: 'payment', amount: rngInt(200, 500), date: daysAgo(50) });
      break;
    }
    case 'RECOVERING': {
      for (let i = 8; i >= 5; i--) {
        const creditDate = daysAgo(i * 10);
        const amt = rngInt(400, 900);
        txs.push({ type: 'credit', amount: amt, date: creditDate });
      }
      for (let i = 4; i >= 1; i--) {
        const payDate = daysAgo(i * 8 + rngInt(0, 4));
        txs.push({ type: 'payment', amount: rngInt(500, 1200), date: payDate });
      }
      break;
    }
    case 'DORMANT': {
      txs.push({ type: 'credit', amount: rngInt(500, 1500), date: daysAgo(90) });
      txs.push({ type: 'credit', amount: rngInt(300, 900), date: daysAgo(82) });
      txs.push({ type: 'payment', amount: rngInt(200, 600), date: daysAgo(78) });
      break;
    }
    case 'NEW_CUSTOMER': {
      txs.push({ type: 'credit', amount: rngInt(150, 400), date: daysAgo(rngInt(12, 18)) });
      if (rng() > 0.5) {
        txs.push({ type: 'credit', amount: rngInt(100, 300), date: daysAgo(rngInt(3, 8)) });
      }
      break;
    }
    default:
      break;
  }
  return txs;
}

// ─── Risk level derivation ────────────────────────────────────────────────────

function deriveRiskLevel(archetype) {
  if (['CHAMPION', 'RELIABLE', 'RECOVERING', 'NEW_CUSTOMER'].includes(archetype)) return 'low';
  if (['SLOW_PAYER', 'STRAINED', 'DORMANT'].includes(archetype)) return 'medium';
  return 'high'; // AT_RISK
}

// ─── Main seed function ───────────────────────────────────────────────────────

async function seedMongo({ clear = false } = {}) {
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) {
    throw new Error('MONGO_URI not set. Add it to backend/.env');
  }

  await mongoose.connect(MONGO_URI, {
    dbName: process.env.MONGO_DB_NAME || undefined,
    serverSelectionTimeoutMS: 10000,
  });
  console.log('Connected to MongoDB');

  const DEMO_EMAIL = process.env.SEED_USER_EMAIL || 'demo@hisab.app';
  const DEMO_NAME  = process.env.SEED_USER_NAME  || 'Demo Shop';

  if (clear) {
    let user = await User.findOne({ email: DEMO_EMAIL });
    if (user) {
      const uid = user._id;
      console.log(`Clearing existing demo data for user ${uid}...`);
      await Promise.all([
        Customer.deleteMany({ userId: uid }),
        Product.deleteMany({ userId: uid }),
        BakiEntry.deleteMany({ userId: uid }),
        SalesHeader.deleteMany({ userId: uid }),
        SalesItem.deleteMany({ userId: uid }),
        InventoryMovement.deleteMany({ userId: uid }),
      ]);
      console.log('Cleared.');
    }
  }

  // ── 1. Upsert demo user ──────────────────────────────────────────────────────
  let user = await User.findOne({ email: DEMO_EMAIL });
  if (!user) {
    const pwHash = await bcrypt.hash('Demo@1234', 10);
    user = await User.create({
      name:   DEMO_NAME,
      email:  DEMO_EMAIL,
      role:   'OWNER',
      status: 'ACTIVE',
      password: pwHash,
    });
    console.log(`Created demo user: ${DEMO_EMAIL}`);
  } else {
    console.log(`Using existing demo user: ${DEMO_EMAIL} (${user._id})`);
  }
  const userId = user._id;

  // ── 2. Upsert products ───────────────────────────────────────────────────────
  const productDocs = [];
  for (const p of PRODUCT_CATALOG) {
    let doc = await Product.findOne({ userId, sku: p.sku });
    if (!doc) {
      doc = await Product.create({
        userId,
        name:           p.name,
        sku:            p.sku,
        unit:           p.unit,
        price:          p.price,
        quantityOnHand: p.initial,
        reorderLevel:   p.reorder,
        clientRefId:    `demo_${p.sku}`,
      });
    }
    productDocs.push({ ...p, _id: doc._id });
  }
  console.log(`Products ready: ${productDocs.length}`);

  // Track running inventory levels for movements
  const inventoryLevels = {};
  for (const p of productDocs) {
    inventoryLevels[String(p._id)] = p.initial;
  }

  // Global counter for unique clientRefId across all document types
  let seq = 0;
  const nextRef = (prefix) => `demo_${prefix}_${(++seq).toString().padStart(5, '0')}`;

  // Insert initial stock_in movements
  const stockInMovements = productDocs.map((p) => ({
    userId,
    productId:       p._id,
    movementType:    'stock_in',
    quantityDelta:   p.initial,
    quantityBefore:  0,
    quantityAfter:   p.initial,
    reason:          'initial_stock',
    occurredAt:      daysAgo(91),
    clientRefId:     nextRef('mv'),
  }));
  await InventoryMovement.insertMany(stockInMovements);
  console.log('Initial stock_in movements created.');

  // ── 3. Create customers + baki entries ───────────────────────────────────────
  const customerDocs = [];
  let totalBakiEntries = 0;

  for (const cDef of CUSTOMER_DEFS) {
    const safePhone = cDef.phone.replace(/[^0-9]/g, '');
    let customerDoc = await Customer.findOne({ userId, phone: cDef.phone });
    if (!customerDoc) {
      customerDoc = await Customer.create({
        userId,
        name:          cDef.name,
        phone:         cDef.phone,
        address:       cDef.address,
        creditLimit:   cDef.creditLimit,
        currentBalance: 0,
        riskLevel:     deriveRiskLevel(cDef.archetype),
        dueTermsDays:  cDef.dueTermsDays,
        clientRefId:   `demo_cust_${safePhone}`,
      });
    }

    const txs = generateBakiTransactions(cDef.archetype);
    const sorted = txs
      .map((t) => ({ ...t, date: t.date || daysAgo(t.daysAgo || 0) }))
      .sort((a, b) => a.date - b.date);

    let runningDue = 0;
    let bakiIdx = 0;
    for (const tx of sorted) {
      if (tx.type === 'credit') {
        runningDue += tx.amount;
        const dueDate = addDays(tx.date, cDef.dueTermsDays);
        const isOverdue = dueDate < NOW && runningDue > 0;
        await BakiEntry.create({
          userId,
          customerId:  customerDoc._id,
          type:        'credit',
          amount:      tx.amount,
          runningDue,
          dueDate,
          status:      isOverdue ? 'overdue' : 'open',
          occurredAt:  tx.date,
          clientRefId: `demo_baki_${safePhone}_${bakiIdx++}`,
        });
      } else {
        const pay = Math.min(tx.amount, runningDue);
        if (pay <= 0) continue;
        runningDue = Math.max(0, runningDue - pay);
        await BakiEntry.create({
          userId,
          customerId:  customerDoc._id,
          type:        'payment',
          amount:      pay,
          runningDue,
          status:      'paid',
          paymentMethod: rngPick(['cash', 'bkash', 'nagad']),
          occurredAt:  tx.date,
          resolvedAt:  tx.date,
          clientRefId: `demo_baki_${safePhone}_${bakiIdx++}`,
        });
      }
      totalBakiEntries++;
    }

    await Customer.findByIdAndUpdate(customerDoc._id, {
      currentBalance: runningDue,
      riskLevel:      deriveRiskLevel(cDef.archetype),
      lastPaymentDate: sorted.filter((t) => t.type === 'payment').at(-1)?.date || null,
    });

    customerDocs.push({ ...cDef, _id: customerDoc._id, finalDue: runningDue });
  }
  console.log(`Customers ready: ${customerDocs.length}, baki entries: ${totalBakiEntries}`);

  // ── 4. Generate 90 days of sales ─────────────────────────────────────────────
  let totalSalesHeaders = 0;
  let totalSalesItems = 0;
  const stockOutMovements = [];

  for (let dAgo = 89; dAgo >= 0; dAgo--) {
    const saleDate = daysAgo(dAgo);
    const isWeekend = saleDate.getDay() === 5 || saleDate.getDay() === 6;
    const isRamadanDay = isRamadan(saleDate);
    const maxTxDay = isWeekend ? 6 : (isRamadanDay ? 3 : 4);
    const numTx = rngInt(1, maxTxDay);

    for (let t = 0; t < numTx; t++) {
      const numItems = rngInt(1, 3);
      const items = [];
      let totalCents = 0;

      for (let k = 0; k < numItems; k++) {
        const useHighFreq = rng() < 0.70;
        const prodIdx = useHighFreq
          ? HIGH_FREQ_IDXS[rngInt(0, HIGH_FREQ_IDXS.length - 1)]
          : rngInt(0, productDocs.length - 1);
        const prod = productDocs[prodIdx];
        const qty = rngInt(1, 3);
        const pid = String(prod._id);
        if ((inventoryLevels[pid] || 0) < qty) continue;
        inventoryLevels[pid] -= qty;
        const subtotalCents = prod.price * qty * 100;
        totalCents += subtotalCents;
        items.push({ prod, qty, subtotalCents });
      }

      if (items.length === 0) continue;

      const paymentMode = rng() < 0.75 ? 'CASH' : rngPick(['BKASH', 'NAGAD', 'BANK']);
      const receiptId = `RCP-${saleDate.toISOString().slice(0, 10).replace(/-/g, '')}-${dAgo}-${t}`;

      const header = await SalesHeader.create({
        userId,
        receiptId,
        saleAt:      saleDate,
        totalAmount: totalCents / 100,
        paymentMode,
        status:      'posted',
        clientRefId: nextRef('sh'),
      });
      totalSalesHeaders++;

      const salesItemDocs = items.map((item, ki) => ({
        userId,
        salesHeaderId: header._id,
        productId:     item.prod._id,
        quantity:      item.qty,
        unitPrice:     item.prod.price,
        subtotal:      item.subtotalCents / 100,
        clientRefId:   nextRef('si'),
      }));
      await SalesItem.insertMany(salesItemDocs);
      totalSalesItems += salesItemDocs.length;

      for (const item of items) {
        const pid = String(item.prod._id);
        const before = inventoryLevels[pid] + item.qty;
        const after  = inventoryLevels[pid];
        stockOutMovements.push({
          userId,
          productId:      item.prod._id,
          movementType:   'stock_out',
          quantityDelta:  -item.qty,
          quantityBefore: before,
          quantityAfter:  after,
          reason:         'sale',
          occurredAt:     saleDate,
          clientRefId:    nextRef('mv'),
        });
      }
    }
  }

  const CHUNK = 200;
  for (let i = 0; i < stockOutMovements.length; i += CHUNK) {
    await InventoryMovement.insertMany(stockOutMovements.slice(i, i + CHUNK));
  }
  console.log(`Sales headers: ${totalSalesHeaders}, sales items: ${totalSalesItems}, stock_out movements: ${stockOutMovements.length}`);

  // ── 5. Sync product quantityOnHand with final inventory levels ───────────────
  const productUpdates = productDocs.map((p) => ({
    updateOne: {
      filter: { _id: p._id },
      update: { $set: { quantityOnHand: Math.max(0, inventoryLevels[String(p._id)] || 0) } },
    },
  }));
  if (productUpdates.length) {
    await Product.bulkWrite(productUpdates);
  }
  console.log('Product quantities synced.');

  await mongoose.disconnect();
  console.log('\nMongoDB seeding complete.');
  console.log(`  User:       ${DEMO_EMAIL} / Demo@1234`);
  console.log(`  Customers:  ${customerDocs.length}`);
  console.log(`  Products:   ${productDocs.length}`);
  console.log(`  Baki txs:   ${totalBakiEntries}`);
  console.log(`  Sales:      ${totalSalesHeaders} headers, ${totalSalesItems} items`);
}

// ─── CLI entry ────────────────────────────────────────────────────────────────

const doClear = process.argv.includes('--clear');
seedMongo({ clear: doClear }).catch((err) => {
  console.error('Seed failed:', err.message || err);
  process.exit(1);
});
