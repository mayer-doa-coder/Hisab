#!/usr/bin/env node
/**
 * pull-db.js
 *
 * Pulls hisab.db from a running Android emulator / device to
 *   dev/hisab.db
 * so you can open it in VS Code with the "SQLite Viewer" extension.
 *
 * Usage:
 *   npm run db:pull
 *
 * Requirements:
 *   • Android emulator is running  (or a device is connected via USB)
 *   • adb is in your PATH  (comes with Android Studio / platform-tools)
 *   • The Hisab app has been opened at least once (so the DB file exists)
 */

const { execSync, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const OUT_DIR = path.join(__dirname, "..", "dev");
const OUT_FILE = path.join(OUT_DIR, "hisab.db");
const TMP_DEVICE = "/sdcard/hisab_export.db";

// ── helpers ──────────────────────────────────────────────────────────────────

function adb(args, opts = {}) {
  const result = spawnSync("adb", args, {
    encoding: "utf8",
    ...opts,
  });
  return {
    ok: result.status === 0,
    out: (result.stdout ?? "").trim(),
    err: (result.stderr ?? "").trim(),
  };
}

function die(msg) {
  console.error(`\n❌  ${msg}\n`);
  process.exit(1);
}

// ── 1. Check adb is available and a device is connected ──────────────────────

console.log("📱  Checking adb connection...");
const devices = adb(["devices"]);
if (!devices.ok)
  die("adb not found. Install Android platform-tools and add them to PATH.");

const connectedLines = devices.out
  .split("\n")
  .slice(1) // skip "List of devices attached" header
  .filter((l) => l.includes("device") && !l.includes("offline"));

if (connectedLines.length === 0) {
  die(
    "No Android device / emulator found.\nStart an emulator and rerun, or connect a device via USB with USB debugging enabled.",
  );
}
console.log(`   Connected: ${connectedLines[0].split("\t")[0]}`);

// ── 2. Locate hisab.db on the device ─────────────────────────────────────────

console.log("🔍  Searching for hisab.db on the device...");

// Strategy A: emulator / rooted device — direct find across /data
let dbPath = null;
const findRoot = adb(["shell", "find /data -name hisab.db 2>/dev/null"]);
if (findRoot.ok && findRoot.out) {
  const lines = findRoot.out
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.endsWith("hisab.db"));
  // Prefer the SQLite sub-directory entry
  dbPath = lines.find((l) => l.includes("SQLite")) ?? lines[0] ?? null;
}

// Strategy B: Expo Go sandbox via run-as (works on debug builds)
if (!dbPath) {
  const pkg = "host.exp.exponent"; // Expo Go package name
  const findRunAs = adb([
    "shell",
    `run-as ${pkg} find /data/data/${pkg}/files -name hisab.db 2>/dev/null`,
  ]);
  if (findRunAs.ok && findRunAs.out) {
    const lines = findRunAs.out
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.endsWith("hisab.db"));
    dbPath = lines.find((l) => l.includes("SQLite")) ?? lines[0] ?? null;
  }
}

// Strategy C: standalone dev-build package
if (!dbPath) {
  const pkg = "com.hisab"; // adjust to your bundle ID if you've created a dev build
  const findRunAs = adb([
    "shell",
    `run-as ${pkg} find /data/data/${pkg}/files -name hisab.db 2>/dev/null`,
  ]);
  if (findRunAs.ok && findRunAs.out) {
    const lines = findRunAs.out
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.endsWith("hisab.db"));
    dbPath = lines.find((l) => l.includes("SQLite")) ?? lines[0] ?? null;
  }
}

if (!dbPath) {
  die(
    "Could not locate hisab.db on the device.\n" +
      "Make sure you have opened the Hisab app at least once so the database file is created.",
  );
}
console.log(`   Found: ${dbPath}`);

// ── 3. Copy to sdcard (bypasses permission restrictions on pull) ──────────────

console.log("📂  Copying to /sdcard...");
// Try direct copy first (works on emulators and rooted devices)
let copied = adb(["shell", `cp "${dbPath}" "${TMP_DEVICE}" 2>/dev/null`]);

if (!copied.ok) {
  // Fallback: use run-as to copy inside the sandbox, then pull from sdcard
  const pkg = "host.exp.exponent";
  copied = adb(["shell", `run-as ${pkg} cp "${dbPath}" "${TMP_DEVICE}"`]);
  if (!copied.ok) {
    die(`Unable to copy database to sdcard: ${copied.err}`);
  }
}

// ── 4. adb pull to dev/hisab.db ──────────────────────────────────────────────

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

console.log(`⬇️   Pulling to dev/hisab.db...`);
const pull = adb(["pull", TMP_DEVICE, OUT_FILE]);
if (!pull.ok) die(`adb pull failed: ${pull.err}`);

// Cleanup temp file
adb(["shell", `rm -f "${TMP_DEVICE}"`]);

// ── 5. Done ───────────────────────────────────────────────────────────────────

const size = fs.statSync(OUT_FILE).size;
console.log(`\n✅  Saved: dev/hisab.db  (${(size / 1024).toFixed(1)} KB)`);
console.log(`   Open it in VS Code — SQLite Viewer will show the tables.\n`);
