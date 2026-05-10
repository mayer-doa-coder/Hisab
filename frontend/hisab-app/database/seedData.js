// ─────────────────────────────────────────────────────────────
// LIGHTWEIGHT DEMO SEEDER (SAFE FOR DEV)
// ─────────────────────────────────────────────────────────────

const MAX_CUSTOMERS = 5;
const MAX_DAYS = 14;
const MAX_TX = 5;
const MAX_PRODUCTS = 10;

// ─── HELPERS ─────────────────────────────────────────────

const now = new Date().toISOString();

const daysAgo = (d) => {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  return dt.toISOString();
};

const addDays = (dateStr, days) => {
  const dt = new Date(dateStr);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString();
};

// ─── MAIN SEED FUNCTION ─────────────────────────────────────────────

export async function seedDemoData(db, userId) {
  const uid = userId;

  // 🔥 CLEAR OLD DATA (IMPORTANT)
  await clearDemoData(db, uid);

  // ─── SAMPLE DATA ─────────────────────────────────────────────
  const CUSTOMERS = [
    { name: "Rahim", phone: "01711111111", credit_limit: 5000, due_terms: 7, behavior: "good" },
    { name: "Karim", phone: "01722222222", credit_limit: 3000, due_terms: 7, behavior: "avg" },
    { name: "Salam", phone: "01733333333", credit_limit: 2000, due_terms: 7, behavior: "bad" },
    { name: "Jamal", phone: "01744444444", credit_limit: 4000, due_terms: 7, behavior: "good" },
    { name: "Kamal", phone: "01755555555", credit_limit: 3500, due_terms: 7, behavior: "avg" },
  ];

  const PRODUCTS = [
    { name: "Rice", price: 60 },
    { name: "Oil", price: 150 },
    { name: "Sugar", price: 80 },
    { name: "Salt", price: 40 },
    { name: "Milk", price: 70 },
    { name: "Egg", price: 12 },
    { name: "Soap", price: 50 },
    { name: "Shampoo", price: 120 },
    { name: "Biscuit", price: 30 },
    { name: "Juice", price: 40 },
  ];

  // ─── INSERT PRODUCTS ─────────────────────────────────────────────
  const productIds = [];
  for (let i = 0; i < Math.min(MAX_PRODUCTS, PRODUCTS.length); i++) {
    const p = PRODUCTS[i];
    const res = await db.runAsync(
      `INSERT INTO products (user_id, name, price_cents, created_at)
       VALUES (?, ?, ?, ?)`,
      uid, p.name, p.price * 100, now
    );
    productIds.push(Number(res.lastInsertRowId));
  }

  // ─── INSERT CUSTOMERS ─────────────────────────────────────────────
  const customerIds = [];
  for (let i = 0; i < Math.min(MAX_CUSTOMERS, CUSTOMERS.length); i++) {
    const c = CUSTOMERS[i];
    const res = await db.runAsync(
      `INSERT INTO customers
       (user_id, name, phone, credit_limit, current_balance, verification_level, created_at)
       VALUES (?, ?, ?, ?, 0, 'L0', ?)`,
      uid, c.name, c.phone, c.credit_limit, now
    );
    customerIds.push(Number(res.lastInsertRowId));
  }

  // ─── INSERT BAKI TRANSACTIONS ─────────────────────────────────────────────
  for (let ci = 0; ci < customerIds.length; ci++) {
    for (let t = 0; t < MAX_TX; t++) {
      const amount = Math.floor(Math.random() * 200) + 50;
      const date = daysAgo(Math.floor(Math.random() * MAX_DAYS));

      await db.runAsync(
        `INSERT INTO baki_transactions
         (user_id, customer_id, type, amount_cents, created_at)
         VALUES (?, ?, 'credit', ?, ?)`,
        uid, customerIds[ci], amount * 100, date
      );
    }
  }

  // ─── INSERT SALES ─────────────────────────────────────────────
  let receiptCounter = 1;

  for (let d = MAX_DAYS; d >= 0; d--) {
    const salesCount = Math.floor(Math.random() * 2); // max 2 sales/day

    for (let s = 0; s < salesCount; s++) {
      const txDate = daysAgo(d);
      const receiptId = `DEMO${String(receiptCounter++).padStart(5, "0")}`;

      const total = Math.floor(Math.random() * 500) + 100;

      const sh = await db.runAsync(
        `INSERT INTO sales_header
         (user_id, receipt_id, timestamp, total_amount_cents, status, created_at)
         VALUES (?, ?, ?, ?, 'posted', ?)`,
        uid, receiptId, txDate, total * 100, txDate
      );

      const shId = Number(sh.lastInsertRowId);

      const itemsCount = Math.floor(Math.random() * 2) + 1;

      for (let i = 0; i < itemsCount; i++) {
        const pid = productIds[Math.floor(Math.random() * productIds.length)];
        const qty = Math.floor(Math.random() * 3) + 1;
        const price = Math.floor(Math.random() * 100) + 20;

        await db.runAsync(
          `INSERT INTO sales_items
           (user_id, sales_header_id, product_id, quantity, unit_price_cents, subtotal_cents, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          uid, shId, pid, qty, price * 100, qty * price * 100, txDate
        );
      }
    }
  }

  console.log("✅ Demo data seeded (light version)");
}

// ─── CLEAR FUNCTION ─────────────────────────────────────────────

async function clearDemoData(db, userId) {
  await db.runAsync(`DELETE FROM sales_items WHERE user_id = ?`, userId);
  await db.runAsync(`DELETE FROM sales_header WHERE user_id = ?`, userId);
  await db.runAsync(`DELETE FROM baki_transactions WHERE user_id = ?`, userId);
  await db.runAsync(`DELETE FROM customers WHERE user_id = ?`, userId);
  await db.runAsync(`DELETE FROM products WHERE user_id = ?`, userId);
}