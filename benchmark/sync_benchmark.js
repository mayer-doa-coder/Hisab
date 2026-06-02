'use strict';

/**
 * Hisab Sync Benchmark
 *
 * Simulates 1,000 concurrent offline retail transactions syncing to the backend.
 * Measures: end-to-end latency (p50/p95/p99), collision resolution rate, DB load.
 *
 * Design
 * ──────
 *  50 virtual devices (each a distinct OWNER user account) × 20 operations = 1,000 ops.
 *  Using distinct users avoids the production rate limit (120 mutations/10min/user)
 *  while accurately modelling 50 rural shops syncing concurrently.
 *
 *  Op mix per device:
 *    12 baki_entry  credit    (most common retail action)
 *     4 transaction sale/exp
 *     2 product_update         ← same expectedVersion=1 across 2 shared products → collisions
 *     2 customer_create        ← unique per device per request
 *
 *  Wave 2 (200 ops): replays the first 200 idempotency keys to measure
 *  duplicate-detection rate.
 *
 *  DB load: MongoDB serverStatus opcounter delta captured before/after.
 */

const path = require('path');

const backendModules = path.resolve(__dirname, '../backend/node_modules');
function breq(mod) { return require(path.join(backendModules, mod)); }

breq('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });

const http     = require('http');
const https    = require('https');
const mongoose = breq('mongoose');
const jwt      = breq('jsonwebtoken');
const bcrypt   = breq('bcrypt');
const { randomUUID } = require('crypto');
const fs   = require('fs');

// ── Config ───────────────────────────────────────────────────────────────────

const BASE_URL    = process.env.BENCHMARK_BASE_URL || 'http://localhost:5000';
const MONGO_URI   = process.env.MONGO_URI          || 'mongodb://127.0.0.1:27017/hisab';
const JWT_SECRET  = process.env.JWT_SECRET;
const RESULTS_FILE = path.resolve(__dirname, 'results_data.txt');

const N_DEVICES   = 50;   // virtual devices (separate users)
const OPS_PER_DEV = 20;   // ops each device contributes
const TOTAL_OPS   = N_DEVICES * OPS_PER_DEV;   // 1000
const CONCURRENCY = 50;   // max in-flight at once

const PRODUCTS_PER_DEV  = 4;   // seeded per user
const CUSTOMERS_PER_DEV = 6;   // seeded per user

// ── Helpers ──────────────────────────────────────────────────────────────────

function idKey(deviceId, entityType, opType, localId) {
  return `hsb_${deviceId}_${entityType}_${opType}_${localId}`;
}
function ri(lo, hi) { return Math.floor(Math.random() * (hi - lo + 1)) + lo; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function httpPost(url, body, bearer) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const parsed  = new URL(url);
    const lib     = parsed.protocol === 'https:' ? https : http;
    const opts = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Authorization':  `Bearer ${bearer}`,
        'Origin':         'http://localhost:8081',
      },
    };
    const req = lib.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve({ statusCode: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ statusCode: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('timeout')));
    req.write(payload);
    req.end();
  });
}

async function concurrentPool(tasks, concurrency) {
  const results = new Array(tasks.length);
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }
  const workers = [];
  for (let i = 0; i < Math.min(concurrency, tasks.length); i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

// ── Mongoose models ───────────────────────────────────────────────────────────

function defineModels() {
  const { Schema, model, models } = mongoose;

  const UserSchema = new Schema(
    { name: String, email: { type: String, required: true, unique: true, lowercase: true },
      password: { type: String, select: false }, role: { type: String, default: 'OWNER' },
      status: { type: String, default: 'ACTIVE' }, ownerUserId: { type: Schema.Types.ObjectId, default: null },
      pinChangedAt: Date, passwordChangedAt: Date, emailVerifiedAt: Date, pinSetAt: Date,
      branchId: { type: Schema.Types.ObjectId, default: null } },
    { timestamps: true }
  );

  const ProductSchema = new Schema(
    { userId: { type: Schema.Types.ObjectId, required: true }, name: { type: String, required: true },
      sku: { type: String, default: null }, clientRefId: { type: String, default: null },
      unit: { type: String, default: 'pcs' }, price: { type: Number, default: 0 },
      quantityOnHand: { type: Number, default: 0 }, reorderLevel: { type: Number, default: 5 },
      expiryDate: { type: Date, default: null }, isArchived: { type: Boolean, default: false },
      version: { type: Number, default: 1 } },
    { timestamps: true }
  );

  const CustomerSchema = new Schema(
    { userId: { type: Schema.Types.ObjectId, required: true }, name: { type: String, required: true },
      phone: { type: String, default: null }, address: { type: String, default: null },
      clientRefId: { type: String, default: null }, creditLimit: { type: Number, default: 0 },
      isArchived: { type: Boolean, default: false }, version: { type: Number, default: 1 } },
    { timestamps: true }
  );

  return {
    User:     models.User     || model('User',     UserSchema),
    Product:  models.Product  || model('Product',  ProductSchema),
    Customer: models.Customer || model('Customer', CustomerSchema),
  };
}

// ── Setup one device (user + seeded data + JWT) ───────────────────────────────

async function setupDevice(devIdx, User, Product, Customer, passwordHash) {
  const email = `bench-dev${String(devIdx).padStart(3, '0')}@hisab-benchmark.internal`;

  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({ name: `BenchDev-${devIdx}`, email, role: 'OWNER', status: 'ACTIVE' });
  } else {
    await User.updateOne({ _id: user._id }, { $set: { status: 'ACTIVE', role: 'OWNER' } });
  }
  const userId = String(user._id);

  const token = jwt.sign(
    { user_id: userId, token_type: 'access', role: 'OWNER' },
    JWT_SECRET, { expiresIn: '2h' }
  );

  // Seed products (unique clientRefId to avoid sparse-unique index collision)
  const existingProds = await Product.find({ userId, name: /^BProd-/ }).limit(PRODUCTS_PER_DEV);
  let products = existingProds;
  if (existingProds.length < PRODUCTS_PER_DEV) {
    const toCreate = PRODUCTS_PER_DEV - existingProds.length;
    const newProds = await Product.insertMany(
      Array.from({ length: toCreate }, (_, i) => ({
        userId, name: `BProd-${devIdx}-${i + existingProds.length}`,
        clientRefId: `bp-${randomUUID()}`,
        price: ri(10, 500), quantityOnHand: ri(50, 500), reorderLevel: 5, version: 1,
      }))
    );
    products = [...existingProds, ...newProds];
  }

  // Seed customers
  const existingCusts = await Customer.find({ userId, name: /^BCust-/ }).limit(CUSTOMERS_PER_DEV);
  let customers = existingCusts;
  if (existingCusts.length < CUSTOMERS_PER_DEV) {
    const toCreate = CUSTOMERS_PER_DEV - existingCusts.length;
    const newCusts = await Customer.insertMany(
      Array.from({ length: toCreate }, (_, i) => ({
        userId, name: `BCust-${devIdx}-${i + existingCusts.length}`,
        phone: `01${ri(100000000, 999999999)}`,
        clientRefId: `bc-${randomUUID()}`,
        creditLimit: 5000, version: 1,
      }))
    );
    customers = [...existingCusts, ...newCusts];
  }

  return { userId, token, products, customers, devId: `d${String(devIdx).padStart(3, '0')}` };
}

// ── Build operations for one device ──────────────────────────────────────────

function buildDeviceOps(device) {
  const { userId, token, products, customers, devId } = device;
  const ops = [];

  // 12 baki_entry credit (spread across customers)
  for (let i = 0; i < 12; i++) {
    const cust = pick(customers);
    const localId = randomUUID().replace(/-/g, '').slice(0, 16);
    ops.push({
      op: {
        operationId:    `op-${devId}-baki-${i}`,
        idempotencyKey: idKey(devId, 'baki_entry', 'create', localId),
        entityType:     'baki_entry',
        operationType:  'create',
        payload: {
          customerId:  String(cust._id),
          type:        'credit',
          amount:      ri(100, 5000),
          note:        'bench',
          occurredAt:  new Date().toISOString(),
        },
      },
      token, type: 'baki_entry',
    });
  }

  // 4 transaction
  for (let i = 0; i < 4; i++) {
    const localId = randomUUID().replace(/-/g, '').slice(0, 16);
    ops.push({
      op: {
        operationId:    `op-${devId}-txn-${i}`,
        idempotencyKey: idKey(devId, 'transaction', 'create', localId),
        entityType:     'transaction',
        operationType:  'create',
        payload: {
          transactionType: pick(['sale', 'expense', 'income']),
          amount:          ri(50, 10000),
          currency:        'BDT',
          note:            'bench',
          occurredAt:      new Date().toISOString(),
        },
      },
      token, type: 'transaction',
    });
  }

  // 2 product_update — both targeting the FIRST product with expectedVersion=1
  // Multiple devices target the SAME product (by id) — this won't cause cross-user
  // conflicts (products are user-scoped) but within each device the 2 updates
  // contend. We intentionally set expectedVersion=1 and run both in the same wave
  // to guarantee at most 1 succeeds.
  for (let i = 0; i < 2; i++) {
    const prod = products[0]; // always same product, same expectedVersion → one will conflict
    const localId = randomUUID().replace(/-/g, '').slice(0, 16);
    ops.push({
      op: {
        operationId:    `op-${devId}-prod-${i}`,
        idempotencyKey: idKey(devId, 'product', 'update', localId),
        entityType:     'product',
        operationType:  'update',
        payload: {
          productId:       String(prod._id),
          expectedVersion: 1,
          price:           ri(10, 500),
        },
      },
      token, type: 'product_update',
    });
  }

  // 2 customer_create (unique each time)
  for (let i = 0; i < 2; i++) {
    const localId = randomUUID().replace(/-/g, '').slice(0, 16);
    ops.push({
      op: {
        operationId:    `op-${devId}-cust-${i}`,
        idempotencyKey: idKey(devId, 'customer', 'create', localId),
        entityType:     'customer',
        operationType:  'create',
        payload: {
          name:        `BenchNew-${devId}-${i}-${localId}`,
          phone:       `01${ri(100000000, 999999999)}`,
          creditLimit: ri(0, 10000),
        },
      },
      token, type: 'customer_create',
    });
  }

  return ops;
}

// ── Issue one push call and return a result record ────────────────────────────

function makeTask(opRecord) {
  return async () => {
    const t0 = Date.now();
    let status = 'error';
    let httpCode = 0;
    try {
      const res = await httpPost(
        `${BASE_URL}/api/v1/sync/push`,
        { batchId: `bench-${opRecord.op.operationId}`, operations: [opRecord.op] },
        opRecord.token
      );
      httpCode = res.statusCode;
      if (res.statusCode === 429) {
        status = 'rate_limited_429';
      } else {
        const result = res.body?.data?.results?.[0];
        status = result?.status || (res.statusCode === 200 ? 'unknown_ok' : `http_${res.statusCode}`);
      }
    } catch (err) {
      status = `network_error`;
    }
    return { latencyMs: Date.now() - t0, status, type: opRecord.type, httpCode };
  };
}

// ── Statistics ────────────────────────────────────────────────────────────────

function computeStats(results, label, durationMs) {
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const n = results.length;

  const statusCounts = {};
  for (const r of results) statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;

  const applied           = statusCounts['applied']           || 0;
  const duplicateApplied  = statusCounts['duplicate_applied'] || 0;
  const conflictCount     = statusCounts['conflict_requires_client_resolution'] || 0;
  const rejectedBusiness  = statusCounts['rejected_business_rule'] || 0;
  const rejectedValidation= statusCounts['rejected_validation']    || 0;
  const rateLimited       = statusCounts['rate_limited_429']       || 0;
  const errors            = results.filter((r) => r.status.startsWith('network_error') || r.status.startsWith('http_')).length;

  const sum = latencies.reduce((a, b) => a + b, 0);
  const byType = {};
  for (const r of results) {
    if (!byType[r.type]) byType[r.type] = { total: 0, applied: 0, conflict: 0, rl: 0, err: 0 };
    byType[r.type].total++;
    if (r.status === 'applied' || r.status === 'duplicate_applied') byType[r.type].applied++;
    else if (r.status === 'conflict_requires_client_resolution')     byType[r.type].conflict++;
    else if (r.status === 'rate_limited_429')                        byType[r.type].rl++;
    else                                                             byType[r.type].err++;
  }

  return {
    label, n, durationMs, statusCounts, applied, duplicateApplied, conflictCount,
    rejectedBusiness, rejectedValidation, rateLimited, errors,
    successRate:   n > 0 ? (((applied + duplicateApplied) / n) * 100).toFixed(2) : '0',
    collisionRate: n > 0 ? ((conflictCount / n) * 100).toFixed(2) : '0',
    duplicateRate: n > 0 ? ((duplicateApplied / n) * 100).toFixed(2) : '0',
    opsPerSec:     (n / durationMs * 1000).toFixed(1),
    latency: {
      min: latencies[0]  || 0,
      avg: n ? (sum / n).toFixed(2) : '0',
      p50: pct(latencies, 50),
      p95: pct(latencies, 95),
      p99: pct(latencies, 99),
      max: latencies[n - 1] || 0,
    },
    byType,
  };
}

// ── Report formatter ──────────────────────────────────────────────────────────

function formatReport({ w1, w2, dbDelta, totalMs, config }) {
  const lines = [];
  const p = (...a) => lines.push(a.join(' '));
  const hr  = (c = '─', n = 72) => p(c.repeat(n));

  hr('═');
  p('  HISAB SYNC BENCHMARK — RAW RESULTS');
  p(`  Run timestamp  : ${new Date().toISOString()}`);
  p(`  Backend URL    : ${config.BASE_URL}`);
  p(`  MongoDB        : ${config.MONGO_URI}`);
  p(`  Devices        : ${config.N_DEVICES} (each a distinct OWNER user account)`);
  p(`  Ops per device : ${config.OPS_PER_DEV}  (12 baki_credit | 4 transaction | 2 product_update | 2 customer_create)`);
  p(`  Total ops      : ${config.TOTAL_OPS} (wave 1) + 200 (wave 2 idempotency replay)`);
  p(`  Concurrency    : ${config.CONCURRENCY} in-flight simultaneous`);
  p(`  Collision mode : product_update sends expectedVersion=1 twice per device → one must conflict`);
  p(`  Total wall time: ${totalMs} ms`);
  hr('═');

  for (const s of [w1, w2]) {
    p('');
    hr();
    p(`  ${s.label}`);
    hr();
    p('');
    p(`  THROUGHPUT`);
    p(`    Requests     : ${s.n}`);
    p(`    Wall time    : ${s.durationMs} ms`);
    p(`    Ops/sec      : ${s.opsPerSec}`);
    p('');
    p(`  LATENCY (ms)`);
    p(`    Min  : ${s.latency.min}`);
    p(`    Avg  : ${s.latency.avg}`);
    p(`    p50  : ${s.latency.p50}`);
    p(`    p95  : ${s.latency.p95}`);
    p(`    p99  : ${s.latency.p99}`);
    p(`    Max  : ${s.latency.max}`);
    p('');
    p(`  STATUS BREAKDOWN`);
    p(`    applied                         : ${s.applied}`);
    p(`    duplicate_applied               : ${s.duplicateApplied}`);
    p(`    conflict_requires_client_res.   : ${s.conflictCount}`);
    p(`    rejected_business_rule          : ${s.rejectedBusiness}`);
    p(`    rejected_validation             : ${s.rejectedValidation}`);
    p(`    rate_limited (429)              : ${s.rateLimited}`);
    p(`    other http / network errors     : ${s.errors}`);
    p('');
    p(`  RATES`);
    p(`    Success rate   : ${s.successRate} %`);
    p(`    Collision rate : ${s.collisionRate} %`);
    p(`    Duplicate rate : ${s.duplicateRate} %`);
    p('');
    p(`  PER ENTITY TYPE`);
    for (const [type, c] of Object.entries(s.byType)) {
      p(`    ${type.padEnd(20)}: total=${String(c.total).padStart(4)}  applied=${String(c.applied).padStart(4)}  conflict=${String(c.conflict).padStart(3)}  rl=${String(c.rl).padStart(3)}  err=${String(c.err).padStart(3)}`);
    }
  }

  p('');
  hr();
  p('  DATABASE LOAD  (MongoDB opcounter delta — wave 1 + wave 2 combined)');
  hr();
  p('');
  p(`    Inserts  : ${dbDelta.insert}`);
  p(`    Queries  : ${dbDelta.query}`);
  p(`    Updates  : ${dbDelta.update}`);
  p(`    Deletes  : ${dbDelta.delete}`);
  p(`    Commands : ${dbDelta.command}`);
  p(`    Connections (start → end) : ${dbDelta.connStart} → ${dbDelta.connEnd}`);
  p('');
  p(`    Inserts/op : ${(dbDelta.insert / config.TOTAL_OPS).toFixed(2)}`);
  p(`    Queries/op : ${(dbDelta.query  / config.TOTAL_OPS).toFixed(2)}`);
  p(`    Updates/op : ${(dbDelta.update / config.TOTAL_OPS).toFixed(2)}`);

  p('');
  hr('═');
  p('  RAW STATUS COUNTS — Wave 1');
  hr('═');
  for (const [k, v] of Object.entries(w1.statusCounts))
    p(`    ${k.padEnd(45)} : ${v}`);

  p('');
  hr('═');
  p('  RAW STATUS COUNTS — Wave 2 (replay)');
  hr('═');
  for (const [k, v] of Object.entries(w2.statusCounts))
    p(`    ${k.padEnd(45)} : ${v}`);

  p('');
  hr('═');
  p('  END OF BENCHMARK REPORT');
  hr('═');
  p('');

  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const globalStart = Date.now();

  if (!JWT_SECRET) { console.error('JWT_SECRET missing in backend/.env'); process.exit(1); }

  console.log(`[1/6] Connecting to MongoDB: ${MONGO_URI}`);
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  console.log('      Connected.');

  const { User, Product, Customer } = defineModels();
  const passwordHash = await bcrypt.hash('bench-2026', 10);

  console.log(`[2/6] Setting up ${N_DEVICES} virtual devices (users + seed data)...`);
  const devices = [];
  for (let i = 0; i < N_DEVICES; i++) {
    process.stdout.write(`\r      device ${i + 1}/${N_DEVICES} ...`);
    devices.push(await setupDevice(i, User, Product, Customer, passwordHash));
  }
  console.log('\n      Done.');

  console.log('[3/6] Capturing pre-benchmark MongoDB serverStatus...');
  const pre = await mongoose.connection.db.command({ serverStatus: 1 });
  const preOps   = { ...pre.opcounters };
  const preConns = pre.connections.current;

  console.log(`[4/6] Building ${TOTAL_OPS} tasks (${OPS_PER_DEV} ops × ${N_DEVICES} devices)...`);
  const allOpRecords = [];
  for (const dev of devices) {
    allOpRecords.push(...buildDeviceOps(dev));
  }

  // Shuffle for realistic interleaving
  for (let i = allOpRecords.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allOpRecords[i], allOpRecords[j]] = [allOpRecords[j], allOpRecords[i]];
  }

  const wave1Tasks = allOpRecords.map(makeTask);

  console.log(`[5/6] Wave 1: ${TOTAL_OPS} ops at concurrency=${CONCURRENCY}...`);
  const w1Start   = Date.now();
  const w1Results = await concurrentPool(wave1Tasks, CONCURRENCY);
  const w1Ms      = Date.now() - w1Start;
  console.log(`      Completed in ${w1Ms} ms.`);

  console.log('      Wave 2: 200 replay (idempotency) ops...');
  const wave2Tasks = allOpRecords.slice(0, 200).map(makeTask);
  const w2Start    = Date.now();
  const w2Results  = await concurrentPool(wave2Tasks, CONCURRENCY);
  const w2Ms       = Date.now() - w2Start;
  console.log(`      Completed in ${w2Ms} ms.`);

  console.log('[6/6] Capturing post-benchmark MongoDB serverStatus...');
  const post = await mongoose.connection.db.command({ serverStatus: 1 });
  const postOps   = { ...post.opcounters };
  const postConns = post.connections.current;

  await mongoose.disconnect();

  const dbDelta = {
    insert:    postOps.insert  - preOps.insert,
    query:     postOps.query   - preOps.query,
    update:    postOps.update  - preOps.update,
    delete:    postOps.delete  - preOps.delete,
    command:   postOps.command - preOps.command,
    connStart: preConns,
    connEnd:   postConns,
  };

  const w1Stats = computeStats(w1Results, 'Wave 1  —  1,000 fresh operations', w1Ms);
  const w2Stats = computeStats(w2Results, 'Wave 2  —  200 replay (idempotency check)', w2Ms);

  const report = formatReport({
    w1: w1Stats, w2: w2Stats, dbDelta,
    totalMs: Date.now() - globalStart,
    config: { BASE_URL, MONGO_URI, N_DEVICES, OPS_PER_DEV, TOTAL_OPS, CONCURRENCY },
  });

  console.log(report);
  fs.writeFileSync(RESULTS_FILE, report, 'utf8');
  console.log(`Results saved → ${RESULTS_FILE}`);
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
