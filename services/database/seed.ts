import { db } from ".";

/**
 * Inserts a small set of dummy records so the app can be tested
 * immediately after the first launch.
 *
 * ⚠️  Call this ONLY in development / after createTables().
 *     Guard with a flag so it doesn't run on every restart.
 */
export const seedDummyData = (): void => {
  // ── Guard: skip if data already exists ──────────────────────────────────
  const existing = db.getFirstSync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM customers;",
  );
  if (existing && existing.count > 0) {
    console.log("[seed] Database already has data — skipping seed.");
    return;
  }

  console.log("[seed] Inserting dummy data…");

  // ── Customers (12 realistic Bengali shop regulars) ───────────────────────
  db.execSync(`
    INSERT INTO customers (name, phone, nickname, total_baki, trust_score)
    VALUES
      ('Karim Mia',       '01711000001', 'Karim',   1300.00, 4),
      ('Rahim Uddin',     '01711000002', 'Rahim',    750.50, 3),
      ('Sufia Begum',     NULL,          'Sufia',      0.00, 5),
      ('Jamal Hossain',   '01812345678', 'Jamal',   3200.00, 4),
      ('Fatema Khatun',   '01987654321', 'Fatema',   480.00, 5),
      ('Abdul Matin',     NULL,          'Abdul',   1100.00, 2),
      ('Mohammad Hanif',  '01611001100', 'Hanif',      0.00, 3),
      ('Ayesha Siddika',  '01711999888', 'Ayesha',   620.75, 4),
      ('Delwar Hussain',  NULL,          'Delwar',  2500.00, 3),
      ('Nasrin Akter',    '01511223344', 'Nasrin',     0.00, 5),
      ('Firoz Khan',      '01811556677', 'Firoz',    890.00, 2),
      ('Rokeya Begum',    NULL,          'Rokeya',   350.00, 4);
  `);

  // ── Products ─────────────────────────────────────────────────────────────
  db.execSync(`
    INSERT INTO products (name, price, cost_price, stock, low_stock_threshold)
    VALUES
      ('চাল (1 kg)',      65.00, 55.00, 120, 20),
      ('সয়াবিন তেল (1L)', 185.00, 165.00,  40, 10),
      ('লবণ (500g)',       20.00,  15.00,  80, 15);
  `);

  // ── Transactions (one entry per active-baki customer) ──────────────────────
  db.execSync(`
    INSERT INTO transactions (customer_id, type, amount, note)
    VALUES
      (1, 'credit',  500.00, 'চাল ও তেল কিনেছে'),
      (1, 'credit', 1000.00, 'মাসিক বাকি'),
      (1, 'payment', 200.00, 'আংশিক পেমেন্ট'),
      (2, 'credit',  750.50, 'বিভিন্ন মালামাল'),
      (4, 'credit', 2000.00, 'মালামাল কিনেছে'),
      (4, 'credit', 1500.00, 'রমজানের বাকি'),
      (4, 'payment',  300.00, 'আংশিক পেমেন্ট'),
      (5, 'credit',  480.00, 'তেল ও লবণ'),
      (6, 'credit',  600.00, 'চাল'),
      (6, 'credit',  700.00, 'ডাল ও মুড়ি'),
      (6, 'payment',  200.00, 'পেমেন্ট'),
      (8, 'credit',  620.75, 'বিভিন্ন মালামাল'),
      (9, 'credit', 1500.00, 'খাদ্য সামগ্রী'),
      (9, 'credit', 1000.00, 'মাসিক বাকি'),
      (11, 'credit', 1200.00, 'চাল ও তেল'),
      (11, 'payment',  310.00, 'পেমেন্ট'),
      (12, 'credit',  350.00, 'লবণ ও মসলা');
  `);

  // ── Sale + Sale items ─────────────────────────────────────────────────────
  db.execSync(`
    INSERT INTO sales (customer_id, total, is_baki) VALUES (1, 500.00, 1);
  `);
  const sale = db.getFirstSync<{ id: number }>(
    "SELECT last_insert_rowid() AS id;",
  );
  if (sale) {
    db.execSync(`
      INSERT INTO sale_items (sale_id, product_id, quantity, price)
      VALUES
        (${sale.id}, 1, 4, 65.00),
        (${sale.id}, 2, 1, 185.00);
    `);
  }

  console.log("[seed] Dummy data inserted successfully.");
};

// ── Stress seed ───────────────────────────────────────────────────────────────

/**
 * Inserts NUM_CUSTOMERS customers with TX_PER_CUSTOMER transactions each,
 * all wrapped in a single SQLite transaction so it completes in milliseconds.
 *
 * Guard: if ≥ 50 customers already exist the function is a no-op, so it is
 * safe to leave a call in _layout.tsx during development.
 *
 * Usage (in app/_layout.tsx):
 *   if (__DEV__) { seedStressData(); }
 */
export const seedStressData = (numCustomers = 500, txPerCustomer = 4): void => {
  const existing = db.getFirstSync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM customers;",
  );
  if (existing && existing.count >= 50) {
    console.log(
      `[seed] ${existing.count} customers already present — skipping stress seed.`,
    );
    return;
  }

  const total = numCustomers * txPerCustomer;
  console.log(
    `[seed] Stress-seeding ${numCustomers} customers + ${total} transactions…`,
  );
  const t0 = Date.now();

  // Deterministic names — no external lib needed
  const first = [
    "Karim",
    "Rahim",
    "Sufia",
    "Jamal",
    "Fatema",
    "Abdul",
    "Mohammad",
    "Ayesha",
    "Nasrin",
    "Hasan",
    "Delwar",
    "Rokeya",
    "Firoz",
    "Sabina",
    "Mostafa",
    "Razia",
    "Aminul",
    "Sharif",
    "Motiur",
    "Husan",
  ];
  const last = [
    "Mia",
    "Uddin",
    "Begum",
    "Khan",
    "Hossain",
    "Islam",
    "Ali",
    "Ahmed",
    "Rahman",
    "Sheikh",
  ];
  const notes = [
    "চাল কিনেছে",
    "তেল নিয়েছে",
    "মাসিক বাকি",
    "বিবিধ মালামাল",
    "আংশিক পেমেন্ট",
  ];

  db.execSync("BEGIN;");
  try {
    for (let i = 0; i < numCustomers; i++) {
      const name = `${first[i % first.length]} ${last[Math.floor(i / first.length) % last.length]} ${i + 1}`;
      db.runSync("INSERT INTO customers (name, trust_score) VALUES (?, ?);", [
        name,
        (i % 5) + 1,
      ]);
      const custRow = db.getFirstSync<{ id: number }>(
        "SELECT last_insert_rowid() AS id;",
      );
      if (!custRow) continue;
      const custId = custRow.id;

      // All credits first, then one payment at the end
      let baki = 0;
      for (let j = 0; j < txPerCustomer; j++) {
        const type: "credit" | "payment" =
          j === txPerCustomer - 1 && txPerCustomer > 1 ? "payment" : "credit";
        // Deterministic amounts so repeated runs produce the same data
        const amount = Math.round(((i * 7 + j * 13) % 900) + 100) / 1;
        if (type === "credit") {
          baki += amount;
        } else {
          baki = Math.max(0, baki - amount);
        }
        db.runSync(
          "INSERT INTO transactions (customer_id, type, amount, note) VALUES (?, ?, ?, ?);",
          [custId, type, amount, notes[j % notes.length]],
        );
      }
      db.runSync("UPDATE customers SET total_baki = ? WHERE id = ?;", [
        baki,
        custId,
      ]);
    }
    db.execSync("COMMIT;");
    console.log(`[seed] ✓ Stress seed done in ${Date.now() - t0} ms`);
  } catch (err) {
    db.execSync("ROLLBACK;");
    throw err;
  }
};
