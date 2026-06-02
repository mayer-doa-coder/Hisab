# Hisab: Comprehensive Technical Analysis
## A Rural-First, Offline-Capable Accounting Platform for Bangladeshi Small Businesses

**Document Purpose:** Academic methodology foundation for publication  
**Analysis Date:** June 2026  
**Branch Analyzed:** `feature/ui-ux-correction` (commit `bb96386`)  
**Codebase Root:** `d:\Hisab`

---

## Abstract

Hisab is a full-stack mobile accounting application purpose-built for the informal retail economy of Bangladesh. It targets small shop owners ("দোকানদার") with intermittent connectivity, limited digital literacy, and a strong dependence on informal credit ("বাকি"). The system comprises a React Native/Expo mobile client, a Node.js/Express REST backend with MongoDB persistence, and a layered ML pipeline for customer credit risk modeling. The application introduces four technically novel subsystems that together constitute the primary academic contributions: (1) a Financial Semantic CRDT (FS-CRDT) for offline-first conflict resolution that enforces domain-specific invariants before any merge is committed; (2) a Bangladesh-specific seasonal Markov chain for customer payment state prediction that encodes Islamic calendar events (Ramadan, Eid ul-Fitr, Eid ul-Adha) and Bengali harvest cycles as probabilistic multipliers; (3) a champion/challenger ML pipeline combining monotonic logistic regression (JS, with Platt/isotonic calibration) and LightGBM (Python) for customer trust scoring with guaranteed sign-direction constraints; and (4) a finite-state machine (FSM)-driven Bengali voice assistant with context-sensitive confidence gating, identity conflict resolution sub-flows, and graceful degradation to touch input. Standard engineering practices (JWT refresh token rotation, USSD payment simulation, i18n with bidirectional transliteration) form the supporting infrastructure.

---

## 1. Architecture Overview

### 1.1 Top-Level Directory Structure

```
d:\Hisab\
├── backend/          Node.js 22 / Express 4 API server
│   ├── app.js        Express app factory (CORS, rate limits, routing)
│   ├── server.js     Process entry point (DB connect, schedulers, signal handlers)
│   ├── routes/       HTTP route declarations (auth, USSD, webhook, v1/*)
│   ├── controllers/  Request handlers (v1/ sub-namespace for domain controllers)
│   ├── models/       Mongoose schemas + ML sub-models
│   ├── services/     Business logic (v1/, trust/, prediction/, seasonal/, markov/)
│   ├── middleware/   Auth, RBAC, rate limiting, security headers, request context
│   ├── sync/         Server-side conflict resolver and retry manager
│   ├── ensemble/     Multi-model weighted combiner
│   ├── pipeline/     Baseline prediction pipeline
│   ├── evaluation/   Walk-forward, stress-test, robustness, business metrics
│   ├── monitoring/   Drift detector, alert system, crash logger, perf tracker
│   ├── registry/     Model registry (champion/challenger tracking)
│   ├── rollout/      Feature flags and canary rollout manager
│   ├── strategy/     Decision engine and risk rules
│   ├── scripts/      Trust training scripts (JS + Python), STT smoke tests
│   ├── artifacts/    JSON model artifacts, reliability logs, rollout config
│   ├── stt/          Speech-to-text provider abstraction layer
│   ├── ai/           Confidence calculator, explanation engine, suggestion engine
│   ├── analytics/    Event tracker, metrics calculator
│   ├── features/     Feature builder, validation, rolling window, queue features
│   ├── feedback/     Feedback service
│   ├── fallback/     Fallback engine
│   ├── security/     RBAC, fraud rules
│   ├── export/       CSV and PDF exporters
│   └── data/         Baki image uploads, market data, validation contracts
│
├── frontend/hisab-app/   Expo SDK 52 / React Native app
│   ├── App.js            Root component (auth gating, font loading, background sync)
│   ├── screens/          40+ screen components
│   ├── services/         API clients, sync engine, voice FSM, customer models
│   ├── components/       Reusable UI components (baki, voice, customers, ui)
│   ├── database/         SQLite schema (WAL mode), migrations, seed data
│   ├── context/          AppDataContext, AuthContext, LanguageContext
│   ├── navigation/       Stack/tab/drawer navigators
│   ├── locales/          bn.js, en.js (flat key-value i18n)
│   ├── utils/            bilingualText, banglishSearch, numerals, passwordPolicy
│   └── theme/            colors, spacing, typography
│
├── scripts/              patch_consistency.js (cross-codebase patching)
└── docs/                 Academic report, architecture lock
```

### 1.2 Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Mobile runtime | React Native + Expo | SDK 52 |
| Local DB | expo-sqlite (SQLite WAL mode) | v14 |
| API server | Node.js + Express | Node 22, Express 4 |
| Cloud DB | MongoDB (Mongoose ODM) | Mongoose 8 |
| Auth | JWT (jsonwebtoken) + bcrypt | RS256 access / HS256 refresh |
| ML (Champion) | Custom monotonic logistic regression | Pure JS (no native deps) |
| ML (Challenger) | LightGBM | Python 3 + lightgbm 4 |
| STT providers | ElevenLabs, AssemblyAI, Whisper, Google | pluggable via sttService |
| Background sync | expo-background-fetch + expo-task-manager | — |
| Network monitoring | expo-network | — |

---

## 2. Offline-First Synchronization Architecture

### 2.1 Design Philosophy

The sync system implements a durable, pessimistic offline-first model. Every mutation is written to a local SQLite table (`sync_queue`) *before* the function returns to the UI layer. The app can be killed at any point after a user action and the mutation will survive. Background sync runs on the device OS scheduler (15-minute intervals on iOS, more frequent on Android) without requiring the app to be open.

### 2.2 SQLite Schema — `sync_queue` Table

**File:** `d:\Hisab\frontend\hisab-app\database\schema.js`

```
sync_queue (
  id              TEXT PRIMARY KEY,        -- UUID
  entity_type     TEXT NOT NULL,           -- 'baki_entry', 'product', 'customer', etc.
  operation       TEXT NOT NULL CHECK(IN ('CREATE','UPDATE','DELETE')),
  payload         TEXT NOT NULL,           -- JSON-serialized mutation
  client_ref_id   TEXT,                    -- stable UUID for idempotency
  payload_hash    TEXT NOT NULL,           -- SHA-256 of {entityType, operation, payload}
  server_version  INTEGER DEFAULT 0,       -- version being overwritten (OCC)
  attempt_count   INTEGER DEFAULT 0,
  last_attempt_at INTEGER,
  next_retry_at   INTEGER DEFAULT 0,       -- Unix ms, 0 = ready immediately
  created_at      INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK(IN ('pending','processing','succeeded','failed','skipped')),
  error_detail    TEXT,
  conflict_token  TEXT,
  resolved_by     TEXT
)
```

WAL mode is activated at DB open time via:
```
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;
PRAGMA temp_store = MEMORY;
PRAGMA cache_size = -8000;
```

Indexes ensure O(log n) dequeue performance:
- `idx_sync_queue_status_retry ON sync_queue(status, next_retry_at) WHERE status = 'pending'`
- `idx_sync_queue_entity ON sync_queue(entity_type, created_at)`
- `idx_sync_queue_client_ref ON sync_queue(client_ref_id) WHERE client_ref_id IS NOT NULL`

**Schema version:** 2 (tracked in `sync_metadata` table). Version 1 was baseline; version 2 added `resolved_by` and `conflict_token` columns via idempotent `ALTER TABLE IF NOT EXISTS`.

### 2.3 Entity Sync Priority Ordering

**File:** `d:\Hisab\frontend\hisab-app\database\schema.js` (lines 122–143)

Financial mutations are dequeued before catalog changes to ensure money reaches the cloud first:

| Priority | Entity Types |
|---|---|
| 1 (highest) | `baki_entry`, `payment` |
| 2 | `sales_header`, `sales_item`, `sales_return` |
| 3 | `expense_entry`, `cashbook_entry`, `day_close` |
| 4 | `customer`, `credit_reminder`, `payment_promise` |
| 5 | `product`, `inventory_movement`, `inventory_batch`, `cycle_count` |
| 6 (lowest) | `supplier`, `purchase_order`, `purchase_item` |

The SQL dequeue query uses a VALUES sub-select to join priorities at query time, so no separate priority column is needed in the table schema.

### 2.4 Client-Side Sync Engine Function Inventory

#### `syncQueue.js` — `d:\Hisab\frontend\hisab-app\services\sync\syncQueue.js`

| Function | Signature | Purpose |
|---|---|---|
| `hashPayload` | `(entityType, operation, payload) → Promise<string>` | SHA-256 via `expo-crypto`; idempotency key |
| `enqueue` | `({entityType, operation, payload, clientRefId?, serverVersion?}) → Promise<string>` | Single mutation write with `ON CONFLICT DO NOTHING` |
| `enqueueBatch` | `(mutations[]) → Promise<string[]>` | Atomic multi-mutation insert via `withTransactionAsync` |
| `dequeueBatch` | `(now?) → Promise<Array>` | Priority-sorted batch up to `MAX_BATCH_ITEMS=15` and `MAX_BATCH_BYTES=64KB` |
| `markProcessing` | `(ids[]) → Promise<void>` | Set status='processing'; prevents double-delivery |
| `markSucceeded` | `(id) → Promise<void>` | Terminal success state |
| `markFailed` | `(id, {errorDetail?, conflictToken?}) → Promise<void>` | Increments `attempt_count`; sets next_retry_at via exponential backoff; 'failed' if attempts >= `MAX_QUEUE_ATTEMPTS=8` |
| `resetStuckProcessing` | `() → Promise<number>` | Resets processing entries older than 5 minutes back to pending (crash recovery) |
| `getQueueStats` | `() → Promise<{pending, processing, succeeded, failed, total}>` | Dashboard stats |
| `getOldestPendingAgeMs` | `() → Promise<number>` | Staleness detection |
| `pruneSucceeded` | `(retentionMs?) → Promise<number>` | Removes succeeded entries older than 7 days |
| `getFailedEntries` | `({limit?}) → Promise<Array>` | Feed for `SyncConflictScreen` UI |
| `requeueFailed` | `(id) → Promise<void>` | Manual re-queue from `SyncConflictScreen` |

#### `retryManager.js` — `d:\Hisab\frontend\hisab-app\services\sync\retryManager.js`

| Function | Purpose |
|---|---|
| `normalizeRetryPolicy(override?)` | Merges user overrides with defaults (baseDelay=1500ms, maxDelay=300s, maxAttempts=8) |
| `computeRetryDelayMs({attempt, policy?})` | Exponential backoff with ±30% full jitter: `delay = min(maxDelay, base * 2^(attempt-1)) * (1 ± 0.3*rand)`. Schedule: 1.5s, 3s, 6s, 12s, 24s, 48s, 96s, 300s. |
| `evaluateRetryVisibility({attempts, lastAttemptAt, lastError, policy?})` | Returns `{shouldRetry, exhausted, reason, nextRetryAt, retryInMs}` |

#### `networkMonitor.js` — `d:\Hisab\frontend\hisab-app\services\sync\networkMonitor.js`

| Function | Purpose |
|---|---|
| `startNetworkMonitor(onStateChange?)` | Subscribes to `Network.addNetworkStateListener`; starts circuit-breaker tick every 30s |
| `classifyQuality(networkState)` | Maps expo-network state to `NONE/LOW/MEDIUM/HIGH` |
| `isSyncAllowed()` | Returns `true` if online and circuit is CLOSED or HALF_OPEN |
| `isLowBandwidth()` | Returns `true` for 2G connections |
| `recordSuccess()` | Resets circuit to CLOSED, clears fail count |
| `recordFailure()` | Increments fail count; opens circuit after 4 consecutive failures for 60s |
| `tickCircuit()` | Transitions OPEN → HALF_OPEN after 60s cooldown (called every 30s) |

**Circuit breaker states:** `CLOSED` (normal) → (4 failures) → `OPEN` (suppress) → (60s) → `HALF_OPEN` (probe) → (success) → `CLOSED`

#### `backgroundSync.js` — `d:\Hisab\frontend\hisab-app\services\sync\backgroundSync.js`

| Function | Purpose |
|---|---|
| `registerBackgroundSync()` | Registers `HISAB_BACKGROUND_SYNC` task with OS; minimum 15-min interval; `stopOnTerminate=false`, `startOnBoot=true` |
| `unregisterBackgroundSync()` | Called on logout / data wipe |
| `runSyncCycle({accessToken, apiBaseUrl})` | Core loop: `resetStuckProcessing → pruneSucceeded → dequeueBatch → markProcessing → foreach(pushMutation) → mark succeeded/failed` |
| `pushMutation(entry, {accessToken, apiBaseUrl})` | Single HTTP POST to `/api/v1/sync` with `X-Idempotency-Key`, `X-Client-Ref-Id`, `X-Entity-Type`, `X-Operation` headers; 20s timeout via `AbortSignal.timeout` |
| `getSyncStatus()` | Returns queue stats + background task registration status |

**Non-retryable HTTP statuses:** 400, 401, 403, 409, 422  
**Conflict tokens:** `'conflict'`, `'version_mismatch'`, `'requires_client_resolution'`

#### `conflictResolver.js` — `d:\Hisab\frontend\hisab-app\services\sync\conflictResolver.js`

| Function | Purpose |
|---|---|
| `isConflictStatus(value)` | Token-based conflict detection |
| `buildConflictRecordFromQueueItem({item, ack?})` | Builds UI-ready conflict record from queue entry |
| `resolveConflictPayload({mode, localData, remoteData})` | Standard 3-mode resolution: `client_wins`, `server_wins`, `merge` (field-level last-write-wins) |
| `evaluateInvariants({entityType, clientMutation, serverSnapshot, ctx})` | Evaluates all FS-CRDT invariants (see Section 2.5) |
| `orchestrateMerge({entityType, clientMutation, serverSnapshot, ctx, preferredMode})` | Full pipeline: invariant check → merge or escalate to ApprovalRequest |

### 2.5 Financial Semantic CRDTs (FS-CRDTs) — Novel Contribution

**File:** `d:\Hisab\frontend\hisab-app\services\sync\conflictResolver.js` (lines 92–217)

Standard CRDTs (Automerge, Yjs) are structurally blind — they can merge two concurrent "payment" mutations and produce an overpayment. Hisab extends the standard 3-mode resolver with five domain invariants evaluated **before** any merge is committed. If an invariant fails, the mutation is escalated to an `ApprovalRequest` workflow rather than auto-merged.

**Invariant Set:**

| ID | Name | Entity | Rule |
|---|---|---|---|
| I1 | `PAYMENT_BALANCE_INTEGRITY` | `baki_entry` (payment) | `amount ≤ outstandingBalance + 0.01 BDT` |
| I2 | `CREDIT_CEILING` | `baki_entry` (credit) | `outstanding + amount ≤ creditLimit + 0.01 BDT` |
| I3 | `STOCK_NON_NEGATIVE` | `inventory_movement` (stock_out) | `moveQty ≤ currentQuantity` |
| I4 | `DAY_CLOSE_IMMUTABLE` | `day_close` | `serverSnapshot.closedAt` must be null |
| I5 | `CYCLE_COUNT_TOLERANCE` | `cycle_count` | `abs(physical - system) / system ≤ 0.50` |

**Escalation Required Entities** (defined in `schema.js`): `baki_entry`, `payment`, `sales_return`, `day_close` — these are never auto-merged even if invariants hold.

### 2.6 Server-Side Sync Architecture

#### `syncController.js` — `d:\Hisab\backend\controllers\v1\syncController.js`

| Function | Lines | Purpose |
|---|---|---|
| `pushSync` | 545–585 | Accepts batch of operations; for each calls `applyOperationWithIdempotency`; returns per-operation status |
| `pullSync` | 587–618 | Cursor-based delta pull from `ChangeLog` collection; returns paginated changes with `nextCursor` |
| `ackConflicts` | 620–637 | Acknowledges conflict resolutions; logs audit event |
| `applyOperation` | 451–480 | Dispatches to entity-specific apply functions |
| `applyOperationWithIdempotency` | 504–543 | Wraps `applyOperation` with idempotency check via SHA-256 payload hash |
| `applyProductOperation` | 66–172 | Product CRUD with OCC version check: `findOneAndUpdate({version: expectedVersion}, {$inc: {version: 1}})` |
| `applyCustomerOperation` | 174–276 | Customer CRUD with outstanding-due guard on delete |
| `applyBakiOperation` | 278–333 | Credit/payment creation with running-due calculation and business rule validation |
| `applyMovementOperation` | 335–402 | Inventory movement with stock non-negative check |
| `applyTransactionOperation` | 404–449 | Transaction creation |
| `computeDue` | 50–64 | MongoDB aggregation: `SUM(credit) - SUM(payment)` per customer |

**Idempotency key format:** `hsb_[A-Za-z0-9-]+_[a-z_]+_[a-z_]+_[A-Za-z0-9-]+` (max 128 chars), validated by `IDEMPOTENCY_KEY_PATTERN` regex.

**Idempotency service** (`d:\Hisab\backend\services\v1\idempotencyService.js`):
- `buildPayloadHash(payload)` — SHA-256 of JSON.stringify(payload)
- `findRecord({userId, key, routeKey})` — Mongo lookup
- `ensureNotConflictingReplay({existing, payloadHash})` — throws `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD` if same key, different payload
- `writeRecord(...)` — stores with 30-day TTL

**Change log service** (`d:\Hisab\backend\services\v1\changeLogService.js`):
- `appendChange({userId, entityType, entityId, changeType, payload, version, occurredAt})` — immutable append to `ChangeLog` collection
- `getChangesAfterCursor({userId, cursor, entityTypes, limit})` — cursor-based pagination using base64url-encoded `{createdAt, _id}` pair

### 2.7 Server-Side Retry/Conflict Store

**File:** `d:\Hisab\backend\sync\retryManager.js`

Mirrors client retry logic for server-sourced queue operations:
- `computeBackoffMs({attempt, policy?})` — `min(maxDelay, base * 2^(attempt-1))` + ±15% jitter
- `evaluateRetryDecision({attempts, lastAttemptAt, lastError, policy?})` — returns `{shouldRetryNow, retryExhausted, retryInMs, nextRetryAt, reason}`
- `recordQueueSnapshot({userId, snapshot})` — persists queue health snapshots to `artifacts/reliability/offlineQueueSnapshots.json`
- `listQueueSnapshots({userId, limit})` / `getQueueSummary({userId})` — trend data for reliability dashboard

**File:** `d:\Hisab\backend\sync\conflictResolver.js`

Server-side conflict persistence:
- `createConflictRecord({userId, entityType, reason, clientChange?, serverSnapshot?, metadata?, source?})` — writes to `artifacts/reliability/syncConflicts.json`
- `listConflictRecords({userId, status, limit})` — filtered view
- `resolveConflictRecord({userId, conflictId, resolution, resolvedBy?, resolutionNote?, mergedData?})` — marks status='resolved'
- `summarizeConflictRecords({userId})` — aggregates by reason and entity type
- `applyConflictRetentionPolicy({maxAgeDays, maxRecords})` — purges old records (default 30 days / 1000 records)

### 2.8 Complete Offline Sync Data Flow

```
UI Action (e.g., user enters baki)
    │
    ▼
enqueue({entityType, operation, payload})   [syncQueue.js]
    │  SHA-256(payload) → payload_hash
    │  INSERT INTO sync_queue ... status='pending'
    ▼
[app returns to user — mutation is durable]

    ▼  [background task fires OR foreground timer interval in MainDataShell]
runSyncCycle({accessToken, apiBaseUrl})   [backgroundSync.js]
    │
    ├── isSyncAllowed()  [networkMonitor.js]
    │   └── checks: isOnline AND circuit !== OPEN
    │
    ├── resetStuckProcessing()  [syncQueue.js]
    │   └── 'processing' for >5min → 'pending'
    │
    ├── pruneSucceeded()  [syncQueue.js]
    │   └── DELETE succeeded older than 7 days
    │
    ├── dequeueBatch()  [syncQueue.js]
    │   └── SELECT priority-ordered pending entries ≤ MAX_BATCH_ITEMS, ≤ MAX_BATCH_BYTES
    │
    ├── markProcessing(ids)  [syncQueue.js]
    │   └── UPDATE status='processing'  (prevents double-delivery)
    │
    └── for each entry:
          pushMutation(entry)  [backgroundSync.js]
              │  POST /api/v1/sync
              │  Headers: X-Idempotency-Key, X-Client-Ref-Id, X-Entity-Type, X-Operation
              │  20s AbortSignal timeout
              │
              ├── 200 OK → markSucceeded(); recordSuccess()
              ├── conflict status → markFailed(conflictToken); conflict screen
              ├── non-retryable (400/401/403/409/422) → markFailed(); permanent
              └── transient error → recordFailure(); markFailed(); retry with backoff

    ▼  [Server: pushSync in syncController.js]
applyOperationWithIdempotency({userId, operation})
    │
    ├── validateOperationIdempotencyKey(key)
    ├── findRecord(userId, key, routeKey)  → if exists: return cached response
    ├── applyOperation(userId, operation)
    │   ├── applyBakiOperation / applyProductOperation / etc.
    │   │   ├── business rule validation (credit limit, overpayment, stock)
    │   │   ├── MongoDB write with OCC: findOneAndUpdate({version: expectedVersion}, {$inc: {version: 1}})
    │   │   ├── appendChange(...)  → ChangeLog append
    │   │   └── logAudit(...)     → AuditLog append
    │   └── returns {status: 'applied'|'rejected_*'|'conflict_*', entityId, version}
    └── writeRecord(idempotency)  → IdempotencyRecord with 30-day TTL

    ▼  [Client: pullSync for delta reconciliation]
pullSync({cursor, entityTypes, maxItems})
    └── getChangesAfterCursor(...)  → ChangeLog.find({createdAt > cursor}).sort.limit
        └── returns {changes[], nextCursor, hasMore}
```

---

## 3. Credit Ledger (Baki) Management

### 3.1 Mongoose Schema — `BakiEntry`

**File:** `d:\Hisab\backend\models\BakiEntry.js`

Key fields:
- `userId` — owner user (tenant isolation)
- `customerId` — FK to Customer
- `type: enum['credit', 'payment']`
- `amount: Number (min: 0.01)`
- `runningDue: Number` — denormalized running balance (credit: currentDue + amount; payment: max(0, currentDue - amount))
- `dueDate: Date` — computed from `dueTermsDays` (default 30 days)
- `status: enum['open', 'paid', 'overdue']`
- `paymentCode: String (sparse index)` — 6-digit OTP for USSD payment
- `paymentCodeExpiresAt: Date` — 24-hour TTL
- `paymentCodeUsed: Boolean`

Compound indexes:
- `{userId, customerId, occurredAt}` — ledger timeline query
- `{userId, customerId, status, dueDate}` — overdue collection
- `{userId, clientRefId}` — unique sparse (idempotency on offline sync)

### 3.2 Baki Controller Function Inventory

**File:** `d:\Hisab\backend\controllers\v1\bakiController.js`

| Function | Lines | Purpose |
|---|---|---|
| `computeDue({userId, customerId})` | 25–46 | MongoDB aggregation: `SUM(credit_amounts) - SUM(payment_amounts)`; returns 0 if negative |
| `getRiskLevel(dueAmount)` | 48–58 | Rule-based: HIGH >10000 BDT, MEDIUM >3000 BDT, LOW otherwise |
| `computeDefaultDueDate({occurredAt, dueTermsDays})` | 61–67 | `occurredAt + dueTermsDays` (UTC date arithmetic) |
| `refreshCreditStatuses({userId, customerId, outstandingDue})` | 69–108 | If due≤0: mark all open/overdue credits as 'paid'. Else: mark open credits with past dueDate as 'overdue'. |
| `refreshCustomerCreditProfile({userId, customerId, setLastPaymentDate?})` | 110–126 | Re-computes due; updates `Customer.currentBalance`, `.riskLevel`; calls refreshCreditStatuses |
| `createEntry({userId, customerId, type, amount, ...})` | 156–278 | Core entry creator: validates credit limit, overpayment; computes runningDue; generates 6-digit paymentCode (credit only); fulfills pending PaymentPromises in FIFO order; calls refreshCustomerCreditProfile |
| `addCredit` | 280–335 | HTTP handler for `POST /baki/credit` |
| `addPayment` | 337–366 | HTTP handler for `POST /baki/payment` |
| `getCustomerLedger` | 368–433 | Returns chronological entries + overdue aging aggregation |
| `getBakiSummary` | 435–508 | Portfolio-level: totalCredit, totalPayments, collectionRate, activeCustomers, totalOutstanding, totalOverdue |
| `getCollectionsDashboard` | 510–616 | Aging buckets (0–30, 31–60, 61–90, 90+ days), segment summary by risk level, pending promise count |
| `createReminder` | 618–667 | Creates CreditReminder; updates BakiEntry.reminderSentAt |
| `createPaymentPromise` | 695–728 | Creates PaymentPromise with 'pending' status |
| `updatePaymentPromiseStatus` | 762–793 | Advances promise to 'fulfilled' or 'broken' |
| `getCustomerStatement` | 795–873 | Full customer statement: entries + reminders + promises |
| `exportCustomerStatementCsv` | 875–929 | CSV export with UTF-8 encoding |

### 3.3 Payment Code / USSD Integration

When a credit entry is created, a random 6-digit code is generated: `generatePaymentCode = () => String(Math.floor(100000 + Math.random() * 900000))`. This code has a 24-hour TTL. Customers can pay via USSD by entering this code, the amount, and the shop phone number.

### 3.4 Baki Image Upload

**File:** `d:\Hisab\backend\controllers\v1\bakiImageController.js`

- multer `diskStorage` with `MAX_FILE_SIZE=5MB`, `ALLOWED_MIME={jpeg,jpg,png,webp}`
- Files stored in `backend/data/baki-images/` with name `baki_{timestamp}_{12-byte-hex}.{ext}`
- Served as static assets at `/uploads/baki-images/:filename`
- Upload API: `POST /api/v1/baki/image` → returns `{image_url, filename, size, customer_id, uploaded_by, uploaded_at}`
- Frontend API client: `d:\Hisab\frontend\hisab-app\services\backend\bakiImageApi.js`

---

## 4. Complete Function Map by Module

### 4.1 Backend Routes (`d:\Hisab\backend\routes\v1\`)

| Route File | Mount Point | Key Endpoints |
|---|---|---|
| `bakiRoutes.js` | `/api/v1/baki` | POST /credit, POST /payment, GET /:customerId/ledger, GET /summary, GET /collections/dashboard, GET /:customerId/statement |
| `syncRoutes.js` | `/api/v1/sync` | POST /push (batch), GET /pull, POST /ack-conflicts |
| `trustRoutes.js` | `/api/v1/trust` | POST /score, GET /explain, GET /segments |
| `customersRoutes.js` | `/api/v1/customers` | CRUD + search + identity |
| `productsRoutes.js` | `/api/v1/products` | CRUD + inventory |
| `markovRoutes.js` | `/api/v1/markov` | POST /predict, POST /build, GET /states |
| `customerMarkovRoutes.js` | `/api/v1/customer-markov` | POST /predict, POST /build |
| `reliabilityRoutes.js` | `/api/v1/reliability` | GET /sync-conflicts, GET /queue-snapshots |
| `reportsRoutes.js` | `/api/v1/reports` | GET /sales, GET /inventory, GET /finance, GET /collections |
| `approvalRequestsRoutes.js` | `/api/v1/approvals` | GET, POST, PATCH (workflow management) |
| `pilotRoutes.js` | `/api/v1/pilot` | Pilot shop enrollment and feature flag management |
| `globalIdentityRoutes.js` | `/api/v1/identity` | Cross-shop identity lookup, link, conflict resolution |

### 4.2 Backend Controllers (`d:\Hisab\backend\controllers\v1\`)

| Controller | Key Functions |
|---|---|
| `bakiController.js` | computeDue, createEntry, addCredit, addPayment, getCustomerLedger, getBakiSummary, getCollectionsDashboard, createReminder, createPaymentPromise, updatePaymentPromiseStatus, getCustomerStatement, exportCustomerStatementCsv |
| `syncController.js` | pushSync, pullSync, ackConflicts, applyOperation, applyOperationWithIdempotency |
| `unifiedSyncController.js` | Unified handler for combined push/pull in single request |
| `trustController.js` | scoreCustomer, explainScore, getSegments |
| `trustMonitoringController.js` | getSnapshot, ingestSnapshot, listSnapshots |
| `markovController.js` | predictState, buildModel, getStates |
| `customerMarkovController.js` | predictCustomerState, buildCustomerModel |
| `bakiImageController.js` | uploadMiddleware (multer), uploadBakiImage |
| `customersController.js` | createCustomer, updateCustomer, listCustomers, searchCustomers |
| `productsController.js` | CRUD + inventory adjustments |
| `reportsController.js` | salesReport, inventoryReport, financeReport |
| `reliabilityController.js` | getSyncConflicts, getQueueSnapshots, resolveConflict |
| `globalIdentityController.js` | findIdentity, createIdentity, linkIdentity, resolveConflict |
| `complianceReportsController.js` | Audit trail export |

### 4.3 Backend Services

#### `d:\Hisab\backend\services\trust\customerRiskEngine.js`

| Function | Purpose |
|---|---|
| `normalizeCustomerData(customerData)` | Extracts/normalizes: due_amount, transaction_count, payment_count, late_payment_count, avg_payment_delay_days, payment_volatility, on_time_ratio |
| `computeRuleBasedRisk(features)` | Points-based fallback: base=20, +45 if due≥5000, +30 if late≥3, +20 if avgDelay≥20; -12 if strong history |
| `computeLogisticRisk(features)` | Logistic regression: `linear = -1.8 + 1.2*dueNorm + 1.0*delayNorm + 1.6*lateRate + 0.6*volatilityNorm - 0.9*consistency - 0.5*depthNorm` |
| `computeChallengerAdjustment(baseResult, features)` | Adds volatility/late-rate boosts to logistic score for high-volatility segments |
| `calculateTrustScore(customerData, options)` | Orchestrator: insufficient data → rule-based; else logistic (±challenger); returns {trust_score, risk_score, risk_level, risk_reasons, scoring_method, prediction_targets, market_state_context, feature_snapshot} |

#### `d:\Hisab\backend\services\customerMarkovService.js`

| Function | Purpose |
|---|---|
| `buildCustomerSequences(snapshots, maxGapDays)` | Groups snapshots by customer, sorts chronologically, inserts `break_before` on gaps > maxGapDays |
| `buildCustomerModel({snapshots, smoothingAlpha, maxGapDays, useDomainPrior})` | Merges domain prior with observed counts; applies Laplace smoothing (α=0.5); normalizes rows |
| `predictCustomerState({model, currentState, steps, asOf, useSeasonal})` | Row distribution lookup (1-step) or matrix power (k-step); optional seasonal adjustment; returns labeled distribution |
| `batchPredictCustomers(model, customers, options)` | Maps predictCustomerState over customer array with error isolation |
| `buildCustomerModelFromTransactions(customerTransactionSets, options)` | Converts raw transactions to weekly snapshots via buildCustomerSnapshotRows; builds model |
| `evaluateCustomerModel(model)` | Computes accuracy, Brier score, ECE on model's own sequences |

#### `d:\Hisab\backend\services\prediction\customerStateEngine.js`

| Function | Purpose |
|---|---|
| `deriveCustomerFeatures(snapshot)` | Computes: recency_days, transaction_depth, due_amount_bdt, avg_delay_days, payment_consistency (fraction on-time), payment_volatility (coefficient of variation) |
| `assignCustomerState(features, prevState?)` | Priority-ordered rule cascade: DORMANT → NEW_CUSTOMER → AT_RISK → RECOVERING → STRAINED → CHAMPION → RELIABLE → SLOW_PAYER |
| `buildCustomerSnapshotRows(customerId, transactions, asOf?)` | Buckets transactions into weekly periods; computes rolling due and feature snapshot per week |
| `normalizeStateKey(value, fallback)` | Maps token to valid state key or returns fallback |

#### `d:\Hisab\backend\services\prediction\markovStateEngine.js`

| Function | Purpose |
|---|---|
| `deriveMarkovFeatures({row, previousSnapshot?})` | Computes: trend_pct, momentum_pct, volatility_ratio, liquidity_stress_score, queue_pressure, spread_to_close_ratio, volume_to_floor_ratio from market OHLCV bar |
| `assignMarkovState({features, previousState?})` | Rule-based: LIQUIDITY_STRESS → QUEUE_PRESSURE → HIGH_VOLATILITY → STRONG_UPTREND → RECOVERY_PHASE → WEAK_UPTREND → DOWNTREND → STABLE |
| `assignMarkovStateForRow({row, previousSnapshot?})` | Combines deriveMarkovFeatures + assignMarkovState |

#### `d:\Hisab\backend\services\seasonal\bangladeshSeasons.js`

| Function | Purpose |
|---|---|
| `getSeasonalPeriod(date)` | Classifies date into 9 seasons (see Section 6.2) |
| `getSeasonalMultipliers(date)` | Returns raw state→multiplier map for date |
| `applySeasonalAdjustment(distribution, date, states)` | Multiplies state probabilities by seasonal multipliers; renormalizes |

#### `d:\Hisab\backend\models\markov\transitionBuilder.js`

| Function | Purpose |
|---|---|
| `initCountMatrix(states)` | Zero-initialized count matrix |
| `buildTransitionCounts({sequences, states, useRegimes})` | Counts observed state→state transitions from point sequences; handles `break_before` gaps |
| `applyLaplaceSmoothing({counts, states, alpha})` | Adds alpha to every cell |
| `normalizeCounts({counts, states})` | Row-normalizes; uniform fallback for zero rows |
| `buildTransitionMatrix({sequences, states, smoothingAlpha, useRegimes})` | Full pipeline: count → smooth → normalize per regime |

#### `d:\Hisab\backend\models\markov\predictor.js`

| Function | Purpose |
|---|---|
| `predictNextStateDist({currentState, matrix, states})` | Row lookup with normalization |
| `predictStateDistKSteps({currentState, matrix, states, steps})` | Iterative vector-matrix multiplication for k-step horizon |
| `predictMostLikelyState(distribution)` | argmax over distribution |
| `computeSequenceLogLikelihood({sequences, states, matrixResolver})` | Log-likelihood with ε=1e-12 floor |
| `computeNextStateAccuracy({sequences, states, matrixResolver})` | Top-1 accuracy |
| `computeCalibrationStats({sequences, states, matrixResolver, bins})` | Brier score + ECE (Expected Calibration Error) with bin-level histogram |

#### `d:\Hisab\backend\ensemble\ensembleEngine.js`

| Function | Purpose |
|---|---|
| `computeThresholdScore(threshold)` | Binary: REORDER=1, NO_REORDER=0 |
| `computeMarkovScore(markov)` | `clamp((HIGH_DEMAND + 0.5*STABLE - 0.35*LOW_DEMAND) * confidence * (1 - 0.5*uncertainty), 0, 1)` |
| `computeAgreement({emaScore, thresholdScore, markovScore})` | `1 - sqrt(variance(scores))` — measures inter-model disagreement |
| `combineModels({ema, threshold, markov, context, mode, ...})` | Weighted sum: `score = w_ema*ema + w_threshold*threshold + w_markov*markov`; maps to BUY_NOW/WATCH/HOLD or REORDER/NO_REORDER |

### 4.4 Backend Middleware

| File | Purpose |
|---|---|
| `authMiddleware.js` | JWT verification; token type check; user lookup; pin/password change revocation by comparing `iat` to `pinChangedAt`; RBAC permission injection |
| `bakiPinMiddleware.js` | PIN verification gate for high-value baki operations |
| `permissionMiddleware.js` | RBAC permission check against `req.auth.permissions` |
| `rateLimitMiddleware.js` | Configurable rate limiter (auth: 60/15min; domain reads: 300/10min; mutations: 120/10min) |
| `rbacMiddleware.js` | Role-based access control enforcement |
| `requestContext.js` | Attaches `requestId` (UUID) to every request |
| `securityHeaders.js` | Sets X-Content-Type-Options, X-Frame-Options, Referrer-Policy |
| `validateRequest.js` | Zod/Joi schema validation wrapper |

### 4.5 Backend Jobs and Schedulers

| File | Purpose |
|---|---|
| `jobs/lifecycleScheduler.js` | Starts `startLifecycleScheduler`; orchestrates periodic model recalibration |
| `jobs/recalibrationJob.js` | Scheduled trust model recalibration trigger |
| `services/authRetentionService.js` | `startAuthRetentionScheduler` — purges expired refresh tokens |
| `services/trustOptimizationService.js` | `startTrustOptimizationScheduler` — runs champion/challenger promotioncheck on schedule |

### 4.6 Frontend Screens (`d:\Hisab\frontend\hisab-app\screens\`)

| Screen | Purpose |
|---|---|
| `DashboardScreen.js` | KPI overview: revenue, baki total, stock alerts, AI suggestions |
| `BakiListScreen.js` | Customer credit list with risk badges |
| `CustomerCreditScreen.js` | Credit entry form |
| `CustomerLedgerScreen.js` | Chronological credit/payment ledger |
| `CustomerStatementScreen.js` | Full statement with reminders and promises |
| `CollectionsDashboardScreen.js` | Aging buckets, segment risk summary |
| `SyncConflictScreen.js` | Failed/conflicted queue entries with requeue capability |
| `OfflineQueueMonitor.js` | Live queue stats and circuit breaker state |
| `VoiceAssistantScreen.js` | Voice entry hub |
| `VoiceIntentScreen.js` | Intent capture (baki/joma/becha/kinbo/balance) |
| `VoiceNameScreen.js` | Customer name capture |
| `VoiceAmountScreen.js` | Amount capture |
| `VoiceDateScreen.js` | Date capture |
| `VoiceReviewScreen.js` | Review slot summary before confirmation |
| `VoiceConfirmScreen.js` | Confirmation with PIN gate |
| `VoicePackDownloadScreen.js` | Offline voice model pack download |
| `SalesScreen.js` | Point-of-sale with product selector, cart |
| `InventoryBatchViewScreen.js` | Batch-level inventory with expiry dates |
| `CycleCountScreen.js` | Physical inventory count with discrepancy detection |
| `StockSuggestionsScreen.js` | AI reorder suggestions |
| `ApprovalRequestsScreen.js` | Workflow approval queue for ESCALATION_REQUIRED entities |
| `AuditHistoryScreen.js` | Immutable audit log viewer |
| `ProfileScreen.js` | User profile + language toggle |
| `OnboardingScreen.js` | First-run setup |
| `BackupRestoreScreen.js` | Data backup/restore |
| `ReportsScreen.js` | Finance, sales, inventory, collections reports |

### 4.7 Frontend Services — Sync-Related

Already documented in Section 2.4. Additional services:

| File | Purpose |
|---|---|
| `services/sync/dataSync.js` | High-level sync orchestrator called from MainDataShell |
| `services/sync/deltaEncoder.js` | Cursor management and delta encoding for pull sync |
| `services/backend/syncApi.js` | HTTP client for `/api/v1/sync` endpoints |
| `services/backend/bakiImageApi.js` | Image upload HTTP client |
| `services/backend/creditApi.js` | Credit/payment/ledger API calls |

### 4.8 Frontend Services — Customer Intelligence

| File | Purpose |
|---|---|
| `services/customers/customerRiskEngine.js` | Client-side risk score computation (mirrors backend) |
| `services/customers/trustChampionModel.js` | Loads champion model artifact; `predictRisk(features)` |
| `services/customers/trustChallengerModel.js` | Loads challenger model; for A/B shadow scoring |
| `services/customers/trustFallbackPolicy.js` | `evaluateFallback(features)` — rule-based when models unavailable |
| `services/customers/trustGating.js` | Gates which model to use per rollout config |
| `services/customers/trustRolloutControl.js` | Reads rollout percentage from backend config |
| `services/customers/trustMonitoringEngine.js` | Client-side drift detection and performance tracking |
| `services/customers/trustExplainability.js` | SHAP-like feature contribution explanations |
| `services/customers/customerIdentification.js` | Customer lookup and matching |
| `services/customers/customerLedgerUtils.js` | Ledger formatting helpers |
| `services/customers/customerSearchUtils.js` | Banglish-aware fuzzy search |
| `services/features/featureCalculator.js` | Computes trust model features from local SQLite data |
| `services/features/featureDefinitions.js` | Feature schema with types and validation rules |

### 4.9 Frontend Components — Baki

| Component | Purpose |
|---|---|
| `BakiEntryForm.js` | Credit/payment form with amount, note, date |
| `BakiFilters.js` | Status/date range filter bar |
| `BakiKpiDashboard.js` | KPI cards: total credit, total payments, collection rate |
| `BakiListItem.js` | Single ledger entry row with risk badge |
| `BakiSummaryCards.js` | Outstanding/overdue summary cards |
| `CustomerPhotoCapture.js` | Camera/gallery picker for baki image |
| `PaymentCodeModal.js` | 6-digit USSD payment code display |
| `PaymentEntryForm.js` | Payment recording form |
| `PhotoPreviewBadge.js` | Thumbnail for attached baki image |

---

## 5. Stochastic Modeling and Machine Learning

### 5.1 System Overview

The ML pipeline has three distinct modeling stacks operating in parallel:

1. **Customer Trust Scoring** — predicts probability of payment default within 60 days
2. **Customer Behavioral Markov Chain** — predicts next payment behavioral state
3. **Market/Inventory Markov Chain** — predicts stock demand regime (used for reorder suggestions)

These feed an ensemble engine for final reorder decisions. The trust model uses a champion/challenger deployment pattern.

### 5.2 Customer Trust Scoring — Champion Model

**Training Script:** `d:\Hisab\backend\scripts\trust\trainTrustChampionModel.js`  
**ML Core:** `d:\Hisab\backend\scripts\trust\monotonicLogistic.js`  
**Artifact (Backend):** `d:\Hisab\backend\artifacts\trustChampionModel.v1.json`  
**Artifact (Frontend JS):** `d:\Hisab\frontend\hisab-app\services\customers\models\trustChampionModel.v1.js`

**Algorithm:** Monotonic Logistic Regression with gradient descent and monotonicity projection.

**Features (7, with sign constraints):**

| Feature | Direction | Rationale |
|---|---|---|
| `due_amount` | positive | Higher outstanding debt → higher risk |
| `late_count` | positive | More late payments → higher risk |
| `avg_delay_days` | positive | Longer delays → higher risk |
| `transaction_depth` | **negative** | More history → lower risk (trustworthiness signal) |
| `recency_days` | positive | Inactive customers → higher risk |
| `payment_consistency` | **negative** | Higher on-time rate → lower risk |
| `payment_volatility` | positive | Erratic payment amounts → higher risk |

**Training pipeline (`trainChampionModel` function, lines 663–828 in `monotonicLogistic.js`):**

1. `buildDesignMatrix(rows)` — time-sorted feature extraction
2. `fitStandardScaler(X)` — compute mean/std per feature
3. `transformWithScaler(X, scaler)` — standardize features
4. `makeTemporalFolds(n, k=5)` — temporal (non-random) k-fold cross-validation
5. Per fold:
   - `trainMonotonicLogisticRegression({X, y, epochs=1800, lr=0.04, l2=0.001})`
   - Gradient descent loop: `gradW[j] += (prob[i] - y[i]) * X[i][j] / n`
   - After each gradient step: `applyMonotonicProjection` — clips negative-direction weights to ≥0 and positive-direction weights to ≤0 (hard monotonicity enforcement)
   - Out-of-fold logit collection
6. `fitPlattScaling({logits, labels, epochs=1200, lr=0.03})` — calibration on out-of-fold logits; learns `A, B` such that `p = σ(A·logit + B)`
7. Full-model retrain on all data
8. `fitProbabilityBlend` — iterates α from 1.0 to 0.0 to find blend that achieves ECE ≤ 0.06 without Brier increase > 0.01
9. `fitIsotonicRegression` — POOL ADJACENT VIOLATORS algorithm for monotone calibration
10. Selects: isotonic if ECE ≤ 0.06 AND Brier ≤ 0.18 AND better than Platt; else Platt+blend
11. `toExportedCoefficients` — absorbs scaler into raw-space coefficients (intercept adjustment)
12. Sign verification, coefficient stability (std across folds), metrics (AUC-PR, recall@precision90, Brier, ECE)

**Metrics computed:**
- `aucPr(labels, probs)` — trapezoid area under precision-recall curve
- `recallAtPrecision(labels, probs, minPrecision=0.9)` — recall at ≥90% precision threshold
- `brierScore(labels, probs)` — mean squared probability error
- `expectedCalibrationError(labels, probs, bins=10)` — weighted bin-level confidence vs. accuracy gap

**Synthetic fallback dataset (260 rows):** Generated with deterministic LCG seeder (seed=1337). Feature values drawn from uniform/power-law distributions. Labels generated from latent variable `linear = -2.05 + 0.00025*dueAmount + 0.42*lateCount + ... + noise`, then `label = Bernoulli(sigmoid(linear))`. Production env blocks synthetic fallback.

**Artifact deployment:** `writeArtifacts` copies the JSON model to both `backend/artifacts/trustChampionModel.v1.json` and `frontend/hisab-app/services/customers/models/trustChampionModel.v1.json` plus a `.js` module wrapper (`export const TRUST_CHAMPION_MODEL = {...}`). This allows the frontend to do in-device inference without an API call.

### 5.3 Customer Trust Scoring — Challenger Model

**Training Script:** `d:\Hisab\backend\scripts\trust\trainTrustChallengerModel.py`  
**Algorithm:** LightGBM (gradient boosted decision trees), Python 3

**LightGBM config:**
```python
{
  "objective": "binary",
  "max_depth": 4,
  "num_leaves": 16,
  "n_estimators": 80,
  "learning_rate": 0.08,
  "min_child_samples": 12,
  "subsample": 0.9,
  "colsample_bytree": 0.9,
  "reg_lambda": 1.0,
  "random_state": 1337,
}
```

Uses the same 7 features and same temporal fold strategy as the champion. Additional pipeline steps:

- **Segment analysis:** Identifies `irregular_payment_patterns` (consistency<0.55 OR late≥3 OR avgDelay≥12) and `high_volatility_users` (volatility ≥ 75th percentile); computes champion vs. challenger metrics per segment
- **Policy loss metric:** `leaked_bad_exposure / total_bad_exposure` at risk_threshold=0.7 — measures financial loss of approving bad customers
- **Comparative output:** `delta_auc_pr`, `delta_recall_at_precision_90`, `delta_brier`, `estimated_loss_reduction_vs_champion`

The challenger model is only activated when champion performance degrades below guardrails defined in `trustOptimizationGuardrails.v1.json`.

### 5.4 Trust Model Operations Pipeline

**Champion/Challenger Promotion scripts** (`d:\Hisab\backend\scripts\trust\`):

| Script | Purpose |
|---|---|
| `promoteTrustBundle.js` | Promotes challenger to champion after meeting guardrail gates |
| `rollbackTrustBundle.js` | Emergency rollback to previous champion |
| `validateTrustCandidateBundle.js` | Pre-promotion gate checks |
| `backtestTrustPromotion.py` | Walk-forward backtest on historical data |
| `runTrustOptimizationCheck.js` | Periodic automated guardrail check |
| `runMonthlyTrustRecalibration.js` | Monthly recalibration on fresh data |
| `runQuarterlyTrustRetraining.js` | Full quarterly retrain |
| `ingestTrustMonitoringSnapshot.js` | Ingests monitoring snapshots from artifact |
| `runEmergencyTrustUpdate.js` | Emergency same-day model update |
| `trustOptimizationUtils.js` | Shared utility functions |
| `trustPhase9.testcases.js` | Regression test suite |

**Model artifacts maintained** (`d:\Hisab\backend\artifacts\`):
- `trustChampionModel.v{115.0.0}.json` — current production champion
- `trustChallengerModel.v{115.0.0}.json` — staged challenger
- `trustActiveBundle.v1.json` — pointer to active model
- `trustModelRegistry.v1.json` — full version history
- `trustMonitoringSnapshot.v1.json` — performance monitoring data
- `trustOptimizationState.v1.json` — optimization state machine
- `trustOptimizationGuardrails.v1.json` — promotion thresholds
- `trustPromotionGates.v1.json` — gate configuration
- `trustPromotionAuditLog.v1.json` — immutable promotion history
- `trustSegmentPromotion.v{115.0.0}.json` — per-segment promotion analysis
- `trustDeploymentCandidate.v1.json` — candidate bundle under evaluation
- `trustBacktestReport.v{115.0.0}.json` — walk-forward backtest results

### 5.5 Customer Behavioral Markov Chain

**File:** `d:\Hisab\backend\services\customerMarkovService.js`  
**State Engine:** `d:\Hisab\backend\services\prediction\customerStateEngine.js`  
**Config:** `d:\Hisab\backend\config\customerMarkovStates.js`

**Customer Markov States (8):**

| State | Description (EN) | Bengali Label |
|---|---|---|
| `CHAMPION` | Best behavior, consistent on-time payer | চ্যাম্পিয়ন |
| `RELIABLE` | Good behavior, manageable balance | নির্ভরযোগ্য |
| `SLOW_PAYER` | Some delays but recoverable | ধীর পরিশোধকারী |
| `RECOVERING` | Was bad, showing genuine improvement | সুধরে আসছেন |
| `STRAINED` | Elevated debt/delays, weak consistency | চাপে আছেন |
| `AT_RISK` | Large debt + high delays + low consistency | ঝুঁকিতে আছেন |
| `NEW_CUSTOMER` | Insufficient history (transaction_depth ≤ threshold) | নতুন গ্রাহক |
| `DORMANT` | No activity for 60+ days with outstanding balance | নিষ্ক্রিয় |

**State assignment rules** (`assignCustomerState`, priority order):
1. DORMANT: `recency_days ≥ 60 AND due_amount > 0`
2. NEW_CUSTOMER: `transaction_depth ≤ threshold`
3. AT_RISK: `due ≥ threshold AND delay ≥ threshold AND consistency ≤ threshold`
4. RECOVERING: `prev_state in [AT_RISK, STRAINED, DORMANT] AND recency ≤ max AND delay < at_risk_threshold AND consistency > at_risk_threshold`
5. STRAINED: `(due ≥ threshold OR delay ≥ threshold) AND consistency ≤ threshold`
6. CHAMPION: `consistency ≥ threshold AND due ≤ max AND depth ≥ min`
7. RELIABLE: `consistency ≥ threshold AND due ≤ max AND delay ≤ max`
8. SLOW_PAYER: `delay ≥ threshold`
9. FALLBACK (RELIABLE)

**Weekly snapshot builder** (`buildCustomerSnapshotRows`): Processes raw transactions into weekly buckets. Per bucket: accumulates rolling `due_amount` (credits add, payments subtract), computes `deriveCustomerFeatures`, assigns state. Adds a "current week" snapshot if last bucket > 7 days ago.

**Model construction** (`buildCustomerModel`):
1. Build weekly sequences per customer
2. Optionally seed count matrix with `CUSTOMER_DOMAIN_PRIOR` (expert-specified transition priors for cold-start)
3. Count observed transitions with `buildTransitionMatrix`
4. Merge observed counts into prior counts (Bayesian update)
5. Laplace smooth (α=0.5)
6. Row-normalize → `global_matrix`

**Prediction** (`predictCustomerState`):
1. 1-step: `predictNextStateDist` (row lookup)
2. k-step: iterative vector-matrix multiplication
3. Optional Bangladesh seasonal adjustment (see Section 5.6)
4. Returns full labeled distribution with Bengali state names

### 5.6 Bangladesh Seasonal Model — Novel Domain-Specific Contribution

**File:** `d:\Hisab\backend\services\seasonal\bangladeshSeasons.js`

This is a domain-specific probability adjustment model encoding Bangladesh economic reality into the Markov chain. It models 9 seasonal periods and applies multiplicative adjustments to state transition probabilities.

**Seasonal Periods:**

| Season Key | Dates/Trigger | Key Economic Effect |
|---|---|---|
| `NORMAL` | Default | No adjustment |
| `PRE_RAMADAN` | 14 days before Ramadan | Credit demand rises; collection harder |
| `RAMADAN` | 30-day fasting month | Extended credit; AT_RISK multiplier ×1.50 |
| `EID_FITR` | Eid ±5 days | Bonus cash but heavy spending |
| `POST_EID_DEBT` | 3–35 days after Eid | Strong repayment impulse; RECOVERING ×1.40 |
| `EID_ADHA` | Eid ul-Adha ±3/10 days | Qurbani spending |
| `HARVEST_BORO` | May 15 – Jun 15 | Boro rice harvest; rural cash flush; AT_RISK ×0.72 |
| `HARVEST_AMAN` | Nov 15 – Dec 15 | Aman rice harvest; similar effect |
| `POHELA_BOISHAKH` | April 14 ±3 days | Bengali New Year; debt settlements + new credit cycle |

**Eid date resolution:** Lunar calendar table for 2024–2028 with linear extrapolation for out-of-range years using `LUNAR_SHIFT_DAYS = 10.875` (Islamic calendar shift per Gregorian year). Ramadan start is estimated as Eid minus 30 days.

**Adjustment mechanism:** Element-wise multiplication of state probabilities by season multipliers, followed by L1 renormalization. For example, during RAMADAN: `AT_RISK` probability is multiplied by 1.50, `CHAMPION` by 0.78; then the distribution sums are renormalized to 1.0.

**Significance for accuracy:** The seasonal adjustment allows a single transition matrix trained on annual data to produce season-aware forecasts without requiring separate seasonal matrices.

### 5.7 Market/Inventory Markov Chain

**States (8):** `STRONG_UPTREND`, `WEAK_UPTREND`, `STABLE`, `DOWNTREND`, `RECOVERY_PHASE`, `HIGH_VOLATILITY`, `QUEUE_PRESSURE`, `LIQUIDITY_STRESS`

**Feature derivation** (`deriveMarkovFeatures`):
- `trend_pct = (close - prevClose) / prevClose`
- `momentum_pct = (close - open) / open`
- `volatility_ratio = (high - low) / close`
- `queue_pressure = (buyVol - sellVol) / (buyVol + sellVol)`
- `liquidity_stress_score = 0.5*(1-volToFloor) + 0.35*(spreadStress) + 0.15*|queuePressure|`

**Regime-aware model:** The transition matrix builder maintains per-regime matrices (e.g., `BULL_REGIME`, `BEAR_REGIME`) so predictions can use the appropriate sub-matrix.

### 5.8 Ensemble Engine

**File:** `d:\Hisab\backend\ensemble\ensembleEngine.js`

Combines EMA (exponential moving average), threshold-based, and Markov-based signals:
```
score = w_ema * ema_score + w_threshold * threshold_score + w_markov * markov_score
```

Weights are dynamically adjusted by `weightAdjuster.js` based on context (volatility regime, data quality). Agreement score measures inter-model disagreement: `agreement = 1 - sqrt(variance([s_ema, s_threshold, s_markov]))`. Low agreement → lower confidence. Decision mapping: score ≥ 0.67 → BUY_NOW, ≥ 0.45 → WATCH, else HOLD.

### 5.9 Model Evaluation Infrastructure

**File:** `d:\Hisab\backend\evaluation\`

| Module | Key Functions |
|---|---|
| `walkForward.js` | Walk-forward validation: train on rolling window, test on next period |
| `stressTest.js` | Extreme scenario testing (e.g., all AT_RISK customers) |
| `robustness.js` | Perturbation analysis: feature noise injection |
| `businessMetrics.js` | Credit loss rate, collection efficiency, approval rate at various thresholds |
| `economicMetrics.js` | BDT-denominated business impact quantification |
| `leakageChecks.js` | Data leakage detection (future data contamination) |
| `baselineComparison.js` | Champion vs. naive baseline comparisons |
| `metrics.js` | AUC-PR, AUC-ROC, F1, precision, recall, calibration |

---

## 6. Voice Assistant Architecture

### 6.1 FSM Design

**File:** `d:\Hisab\frontend\hisab-app\services\voice\voiceFSM.js`

The voice assistant implements a strict Finite State Machine with 18 states:

**Main flow states:**
```
WAIT_INTENT → WAIT_NAME → WAIT_AMOUNT → WAIT_DATE → REVIEW → CONFIRM → WAIT_PIN → EXECUTE
```

**Disambiguation states:**
- `WAIT_CUSTOMER_SELECTION` — entered on AMBIGUOUS_NAME or LOW_CONFIDENCE_NAME

**Identity sub-flow states (customer registration):**
```
WAIT_CREATE_CONFIRM → WAIT_NEW_CUSTOMER_NAME → WAIT_NEW_CUSTOMER_PHONE →
WAIT_OTP → WAIT_NEW_PIN → WAIT_NEW_PIN_CONFIRM
```

**Conflict resolution state:**
- `WAIT_CONFLICT_RESOLVE` — entered on NAME_MULTIPLE_GLOBAL (multiple cross-shop matches) or PHONE_NAME_MISMATCH

### 6.2 FSM Key Functions

| Function | Lines | Purpose |
|---|---|---|
| `transition({state, token, context, knownNames, ...})` | 772–1452 | Main FSM driver; handles all state transitions |
| `validateToken({state, token, knownNames, confidenceThreshold, now})` | 563–751 | Per-state token validation with confidence scoring |
| `handleGlobalControls({token, state, context})` | 437–561 | next/back/cancel/repeat handling; PIN back is blocked |
| `buildConfirmSummary(context)` | 262–272 | Generates Bengali confirmation sentence (e.g., "রহিমকে ৫০ টাকা বাকি দেওয়া হবে, ঠিক আছে?") |
| `buildConfirmationPrompt({state, value, candidates})` | 220–245 | "আপনি কি রহিম বলেছিলেন?" style prompts |
| `validateSlotCompleteness(context)` | 277–298 | Guards REVIEW→CONFIRM transition for required slots |
| `findNameMatches(token, knownNames)` | 183–215 | Ranked name matching: exact=1.0, prefix=0.93, contains=0.88 |
| `parseDateToken(token, now)` | 100–142 | 'aj'→today, 'kal'→tomorrow, ISO/DD-MM-YYYY |
| `parseAmountToken(token)` | 144–161 | Bangla digit normalization + numeric validation |
| `normalizeDigits(value)` | 80–90 | Maps Bengali numerals (০-৯) to ASCII (0-9) |

### 6.3 Confidence Gating

Per-state confidence thresholds prevent low-confidence voice errors from committing financial records:

| State | Threshold | Rationale |
|---|---|---|
| `WAIT_INTENT` | 0.80 | Intent is coarse-grained |
| `WAIT_NAME` | 0.84 | Name matching is fuzzy |
| `WAIT_CUSTOMER_SELECTION` | 0.99 | Explicit selection must be unambiguous |
| `WAIT_AMOUNT` | 0.88 | Financial amounts must be correct |
| `WAIT_DATE` | 0.80 | Dates have structured format |
| `CONFIRM` | 0.95 | High confirmation bar |
| `WAIT_PIN` | 1.00 | PIN must be exact digits |
| `WAIT_NEW_CUSTOMER_PHONE` | 1.00 | Phone must be valid E.164 |
| `WAIT_OTP` | 1.00 | OTP is security-critical |

Accumulated session confidence is tracked via `mergeConfidence = min(existing, incoming)`. At the CONFIRM state, if accumulated confidence < `CONFIRM_MIN_CONFIDENCE=0.80` (or 0.90 for high-risk), the FSM refuses to advance and asks for re-review.

High-risk transactions (`amount ≥ DEFAULT_HIGH_RISK_AMOUNT=50000 BDT` or `intent in ['becha','kinbo']`) require explicit "confirm" (not just "yes").

**Touch escalation:** After `MAX_RETRIES_BEFORE_TOUCH=2` failed attempts on a single state, the FSM emits `touchEscalation` payload so the UI can switch to touch input without waiting for another voice attempt.

### 6.4 STT (Speech-to-Text) Infrastructure

**Backend service:** `d:\Hisab\backend\stt\sttService.js`  
**Provider registry:** Whisper, Google STT, AssemblyAI, ElevenLabs (default)  
**Active provider:** Controlled by `STT_ACTIVE_PROVIDER` env var

**`transcribe({audio, locale, hints, fsmState, requestId})` flow:**
1. `pickProvider()` — selects provider from registry
2. `provider.transcribe({audio, locale, hints})` — provider-specific API call
3. Returns `{text, confidence, latency_ms, request_id, provider}`
4. On failure: if `STT_ALLOW_DETERMINISTIC_FALLBACK` → `buildDeterministicFallbackResponse` (returns state-appropriate token for dev/testing)

**Frontend client:** `d:\Hisab\frontend\hisab-app\services\sttClient.js`  
`transcribeAudio(audioUri, {accessToken, locale, hints, fsmState})`:
- Multi-URL fallback: tries each backend candidate URL in order
- Stages audio to filesystem cache (`STT_UPLOAD_CACHE_DIR`)
- 15s `AbortSignal.timeout`
- FormData upload: audio file + locale + hints JSON + fsmState

**ASR offline layer:** `d:\Hisab\frontend\hisab-app\services\voice\asr\`
- `audioRecorder.js` — record audio via expo-av
- `onnxRunner.js` — ONNX runtime inference for on-device model
- `melSpectrogram.js` — audio feature extraction
- `vad.js` — Voice Activity Detection (JavaScript)
- `vad.kt` — VAD Kotlin native module
- `decoder.js` — greedy/beam decoder for ASR output
- `benchmark.js` — WER benchmarking
- `sttAdapter.js` — adapter bridging ONNX model to sttClient API

**Voice normalization:** `d:\Hisab\frontend\hisab-app\services\voice\normalization\`
- `normalizer.js` — Bengali text normalization
- `numberParser.js` — spoken number → numeric (handles "পাঁচশো পঞ্চাশ" → 550)
- `dateParser.js` — Bengali date expressions
- `nameMatcher.js` — phonetic/character-level name matching
- `confidenceHandler.js` / `confidenceScorer.js` — per-token confidence computation
- `grammarConstrainedParser.js` — grammar-constrained decoding
- `testCorpus.bn.js` — Bengali test corpus

**Voice pack management:** `d:\Hisab\frontend\hisab-app\services\voice\voicePack\`
- `packManager.js` — download, install, activate voice model packs
- `downloader.js` — chunked download with progress
- `versionManager.js` — version compatibility tracking
- `checksumValidator.js` — SHA-256 integrity verification

---

## 7. USSD Payment Integration

**File:** `d:\Hisab\backend\controllers\ussdController.js`  
**Routes:** `POST /ussd/session`, `POST /ussd/payment`

The USSD simulation implements a 4-step stateful session:

```
Step 1: menu — USSD menu display
Step 2: amount — customer enters payment amount
Step 3: shop_phone — customer enters shop phone number
Step 4: payment_code — customer enters 6-digit code from SMS
```

Session TTL: 10 minutes. Stored in `UssdPayment` MongoDB collection.

**Payment validation** (`validatePaymentCode`):
1. Find `BakiEntry` with matching `paymentCode`, not used, not expired, type='credit', status='open'|'overdue'
2. Verify amount matches within ±0.01 BDT
3. Verify shop phone matches customer phone (suffix/prefix match, permissive)
4. On success: mark `paymentCodeUsed=true`, status='paid', `paymentMethod='ussd'`
5. Fires internal webhook to `/payments/webhook` asynchronously via `http.request` to `127.0.0.1:PORT`

**SMS simulation:** `simulateSms(phone, paymentCode)` logs to console with Bengali message: "আপনার পেমেন্ট কোড: {code}. ৳ পরিশোধের জন্য এই কোডটি ব্যবহার করুন। কোডটি ২৪ ঘণ্টা বৈধ থাকবে।"

All USSD menu messages and prompts are in Bengali.

---

## 8. Bengali i18n Architecture

### 8.1 Locale Files

**Files:** `d:\Hisab\frontend\hisab-app\locales\bn.js` and `en.js`

Flat key-value objects with namespaced keys (e.g., `'auth.email'`, `'baki.addCredit'`, `'dashboard.totalDue'`). The Bengali file is the primary locale; English is the secondary. Both are approximately equal in coverage.

### 8.2 Bidirectional Translation Utility

**File:** `d:\Hisab\frontend\hisab-app\utils\bilingualText.js`

At module load time, builds four lookup maps:
- `BN_TO_EN` / `EN_TO_BN` — exact string mappings
- `BN_TO_EN_NORMALIZED` / `EN_TO_BN_NORMALIZED` — whitespace/punctuation-normalized mappings

**Key functions:**
- `setRuntimeLanguage(language)` / `getRuntimeLanguage()` — global language state
- `toLocalizedUiText(value, language)` — translates UI strings; falls back to `transliterateBanglaToLatin` for untranslated Bengali strings
- `localizePersonName(value, language)` — character-by-character transliteration using `BN_TO_LATIN` (50 mappings) and `LATIN_TO_BN` (26 mappings)
- `transliterateBanglaToLatin(value)` — Bengali Unicode → Latin romanization

**Bangla digit handling** (`utils/numerals.js`): Maps ০-৯ to 0-9 throughout the codebase. Used in FSM amount/PIN/date parsing.

**Banglish search** (`utils/banglishSearch.js`): Cross-script fuzzy search allowing users to type Latin characters and match Bengali names (or vice versa).

### 8.3 Language Context

**File:** `d:\Hisab\frontend\hisab-app\context\LanguageContext.js`

React context that wraps the runtime language state. Language toggle is available from `ProfileScreen` and the `LanguageToggle` component in navigation headers.

---

## 9. Authentication and Security

### 9.1 JWT Auth Flow

**File:** `d:\Hisab\backend\controllers\authController.js`

- **Access token:** Short-lived (15min default, configurable via `JWT_EXPIRES_IN`)
- **Refresh token:** Long-lived (7d default, 30d with "remember device")
- **Token type claim:** `token_type: 'access'` in JWT payload to prevent refresh tokens being used as access tokens
- **Revocation:** `authMiddleware` checks `iat` against `user.pinChangedAt` or `user.passwordChangedAt`; any token issued before a credential change is rejected

**Registration flow:**
1. `POST /api/auth/register` → create User (bcrypt PIN hash), send 6-digit email verification code
2. `POST /api/auth/verify-email` → verify code within 10-minute window
3. `POST /api/auth/login` → verify bcrypt PIN, issue access+refresh tokens; track failed attempts

**PIN security:**
- Format: 4–6 digits (`/^\d{4,6}$/`)
- Max failed attempts: 5 before `PIN_LOCK_DURATION_MS` lockout (default 1 hour)
- bcrypt hashing throughout; never stored/logged in plaintext
- Voice FSM: PIN digits passed via `pendingPinVerify: true` signal; caller verifies and passes result back (digits never echoed in prompts)

**Security events:** `logSecurityEvent` records IP, user-agent, eventType to `SecurityEvent` collection.

**RBAC:** `d:\Hisab\backend\security\rbac.js` defines permissions per role. `canonicalizeRole(user.role)` normalizes role tokens. `listPermissions(role)` injected into `req.auth.permissions` by authMiddleware.

### 9.2 Global Customer Identity

**File:** `d:\Hisab\backend\services\globalIdentityService.js`

Cross-shop customer identity with tiered verification levels:
- `L0` — created, unverified phone
- `L1` — OTP-verified phone (`markPhoneVerified`)
- `L2` — PIN set (`setPinHash`)
- `L3` — customer used PIN at ≥3 different shops (`L3_SHOP_THRESHOLD=3`)

Identity conflict resolution (handled by voice FSM's `WAIT_CONFLICT_RESOLVE` state):
- `PHONE_NAME_MISMATCH` — same phone, different name
- `NAME_MULTIPLE_GLOBAL` — multiple global identities match the spoken name
- Shopkeeper decision: link to global identity OR keep local-only

`guardIdentityCreation` via `fraudGuard.js` — fraud check before new identity creation.

---

## 10. Other Notable Features

### 10.1 Approval Requests Workflow

**File:** `d:\Hisab\backend\controllers\v1\approvalRequestsController.js`  
**Frontend:** `d:\Hisab\frontend\hisab-app\screens\ApprovalRequestsScreen.js`

When FS-CRDT invariants fail or `ESCALATION_REQUIRED_ENTITIES` are in conflict, the system creates an `ApprovalRequest` document with fields: `actionType`, `entityType`, `clientChange`, `serverSnapshot`, `violations`, `requiredRole`. An OWNER-role user must approve or reject before the mutation is applied.

### 10.2 Pilot Shop Program

**Files:** `d:\Hisab\backend\routes\v1\pilotRoutes.js`, `d:\Hisab\backend\models\PilotShop.js`

Enrollment management for new feature pilots. `pilotController.js` handles enrollment/unenrollment. Feature flags in `rollout/featureFlag.js` gate experimental features by pilot shop membership.

### 10.3 Branch/Multi-User Support

**Files:** `d:\Hisab\backend\models\Branch.js`, `d:\Hisab\backend\routes\v1\branchesRoutes.js`

Multi-branch retail support with `ownerUserId` as tenant root and `branchId` scoping for team members. `req.user_id` is resolved to `ownerUserId` (tenant isolation) while `req.actor_user_id` tracks the actual performing user for audit trails.

### 10.4 Reorder Suggestions

**Files:** `d:\Hisab\backend\routes\v1\suggestionsRoutes.js`, `d:\Hisab\backend\ai\suggestionEngine.js`, `d:\Hisab\frontend\hisab-app\services\reorder\reorderSuggestionEngine.js`

AI-driven stock replenishment suggestions combining:
- EMA signal (exponential moving average of sales)
- Threshold model (reorder point based on lead time and safety stock)
- Markov demand regime prediction

Ensemble output: BUY_NOW (immediate reorder), WATCH (monitor), HOLD (sufficient stock).

### 10.5 Audit Log System

**Files:** `d:\Hisab\backend\models\AuditLog.js`, `d:\Hisab\backend\services\v1\auditService.js`

Every significant mutation calls `logAudit({userId, entityType, entityId, action, metadata, source})`. Immutable append; accessible via `AuditHistoryScreen.js`. Also maintains `ChangeLog` (lightweight, cursor-queryable) separately from `AuditLog` (rich metadata).

### 10.6 Day Close / Cashbook

**Files:** `d:\Hisab\backend\models\DayClose.js`, `d:\Hisab\backend\models\CashbookEntry.js`, `d:\Hisab\frontend\hisab-app\screens\DayCloseScreen.js`

End-of-day close operation creates an immutable `DayClose` record. The `DAY_CLOSE_IMMUTABLE` FS-CRDT invariant prevents any offline mutation from reopening a closed day.

### 10.7 Inventory Batch Management

**File:** `d:\Hisab\backend\models\InventoryBatch.js`

Batch-level tracking with expiry dates. `CycleCount` for physical inventory verification with the `CYCLE_COUNT_TOLERANCE` invariant blocking auto-merge of discrepancies > 50%.

### 10.8 Push Notifications / Email

**Files:** `d:\Hisab\backend\services\emailService.js`

Email notifications for: account verification (6-digit code, 10-minute TTL), PIN recovery tokens, payment reminders. `isEmailTransportConfigured()` and `isEmailDeliveryRequired()` provide configuration-dependent behavior for development environments.

---

## 11. Novelty Assessment

### 11.1 Genuinely Novel Contributions

#### FS-CRDTs (Financial Semantic CRDTs)
**Novelty level: HIGH**

The extension of CRDTs with financial domain invariants evaluated as preconditions to merge is not found in the standard CRDT literature (Shapiro et al., 2011). Standard CRDTs (Automerge, Yjs, PouchDB CouchDB sync) are structurally blind — they can produce financially invalid states like overpayments or negative inventory. The FS-CRDT approach (5 invariants: PAYMENT_BALANCE_INTEGRITY, CREDIT_CEILING, STOCK_NON_NEGATIVE, DAY_CLOSE_IMMUTABLE, CYCLE_COUNT_TOLERANCE) with escalation to human approval for financial entities is a novel architectural pattern for informal economy applications where financial correctness cannot be sacrificed for eventual consistency.

#### Bangladesh-Seasonal Markov Chain
**Novelty level: HIGH**

The encoding of Bangladesh-specific cultural and agricultural calendars (Islamic lunar calendar Eid dates, rice harvest cycles, Pohela Boishakh) as multiplicative probability adjustments to a Markov transition matrix is a domain-specific novelty. The Eid date resolution algorithm using `LUNAR_SHIFT_DAYS = 10.875` for extrapolation beyond the lookup table is a practical engineering contribution. No published payment behavior prediction model for South Asian informal economy incorporates these domain priors.

#### Monotonic Logistic Regression with Dual-Path Calibration
**Novelty level: MEDIUM**

The monotonicity projection algorithm (clipping weights to maintain sign constraints per feature) ensures the model preserves expert-specified monotone relationships (e.g., higher due amount → higher risk) and never produces results that contradict domain knowledge. The dual-path calibration (select between Platt+blend and isotonic regression based on ECE/Brier tradeoffs) with the probability-blend alpha search is an engineering contribution to calibration robustness. The cross-language champion (JS)/challenger (Python/LightGBM) pipeline with shared artifacts is practical infrastructure novelty.

#### Voice FSM with Confidence Gating for Informal Economy
**Novelty level: MEDIUM**

The multi-level confidence threshold system (per-state thresholds 0.80–1.00) combined with touch escalation, Bengali-first prompt generation, identity conflict sub-flows, and PIN-gate security for financial commitment is a practical contribution. The `orchestrateMerge` pattern that gates voice-initiated financial mutations through the same FS-CRDT invariant stack before execution is architecturally clean. The integration of the voice flow with the WAIT_CONFLICT_RESOLVE state for cross-shop identity management is novel in the context of voice-first mobile finance for low-literacy users.

### 11.2 Standard Engineering Practices (Not Novel)

| Feature | Standard Practice |
|---|---|
| JWT access + refresh token rotation | RFC 6749 / widely implemented |
| Exponential backoff with jitter | Documented in AWS retry guidance |
| Circuit breaker pattern | Defined by Michael Nygard (Release It!) |
| OCC (Optimistic Concurrency Control) with version field | PostgreSQL, MongoDB patterns |
| Idempotency via payload hash + TTL | Stripe idempotency keys pattern |
| Cursor-based pagination | Standard REST delta sync pattern |
| LightGBM gradient boosting | Open-source, widely used |
| WAL mode SQLite for concurrent reads | Standard SQLite performance pattern |
| RBAC with permission injection | Standard web app auth pattern |
| i18n with flat key-value locale files | React-i18next, common practice |

### 11.3 Summary Table

| Contribution | Category | Novelty | Academic Value |
|---|---|---|---|
| Financial Semantic CRDTs (FS-CRDTs) | Distributed systems | HIGH | Publication-worthy |
| Bangladesh seasonal Markov model | Domain-specific ML | HIGH | Regional CS publication |
| Monotonic logistic with dual-path calibration | ML engineering | MEDIUM | Workshop-level |
| Voice FSM with financial confidence gating | HCI/systems | MEDIUM | Application paper |
| Cross-language champion/challenger pipeline | MLOps | LOW-MEDIUM | Systems description |
| Priority-ordered offline queue with entity escalation | Mobile systems | LOW-MEDIUM | Application contribution |

---

## 12. Backend Model Schemas Summary

| Model | Key Fields | Purpose |
|---|---|---|
| `User` | email, pin_hash, role, ownerUserId, branchId, pinChangedAt | Authentication + multi-user tenancy |
| `RefreshToken` | token, userId, expiresAt, deviceId | JWT refresh token store |
| `Customer` | name, phone, creditLimit, currentBalance, riskLevel, lastPaymentDate, dueTermsDays | Customer master with denormalized credit state |
| `BakiEntry` | userId, customerId, type, amount, runningDue, dueDate, status, paymentCode, paymentCodeExpiresAt | Credit ledger entry |
| `Payment` | Separate payment records (beyond baki) | General payment tracking |
| `PaymentPromise` | promisedAmount, promiseDate, status, fulfilledByEntryId | Collection commitment tracking |
| `CreditReminder` | channel, sentAt, status, message | SMS/WhatsApp reminder log |
| `Product` | name, sku, price, quantityOnHand, reorderLevel, expiryDate, version | Inventory item |
| `InventoryMovement` | productId, movementType, quantityDelta, quantityBefore, quantityAfter | Stock movement audit trail |
| `InventoryBatch` | productId, batchNumber, quantity, expiryDate | Batch-level inventory |
| `Transaction` | transactionType, amount, currency, customerId | Financial transaction ledger |
| `SalesHeader` / `SalesItem` | Sale header + line items | POS sales record |
| `CashbookEntry` | debit/credit, category, balance | Daily cashbook |
| `DayClose` | businessDate, closedAt, openingBalance, closingBalance | Immutable day-end snapshot |
| `ExpenseEntry` | category, amount, note | Business expense |
| `ChangeLog` | userId, entityType, entityId, changeType, payload, version, createdAt | Delta sync log (cursor-queryable) |
| `AuditLog` | userId, entityType, action, metadata, source | Immutable audit trail |
| `AuditSnapshot` | Periodic audit summary | Compliance snapshots |
| `IdempotencyRecord` | key, routeKey, payloadHash, responseBody, expiresAt | 30-day idempotency store |
| `ApprovalRequest` | actionType, entityType, clientChange, violations, requiredRole, status | Human approval workflow |
| `UssdPayment` | sessionId, phone, step, amount, shopPhone, paymentCode, bakiEntryId | USSD session state |
| `GlobalCustomerIdentity` | global_id, name, phones[], pin_hash, verification_level | Cross-shop identity |
| `SecurityEvent` | eventType, severity, userId, ipAddress, userAgent | Security audit log |
| `MarketDataBar` | symbol, open, high, low, close, volume, spread | OHLCV market data |
| `Branch` | name, ownerUserId | Multi-location support |
| `Supplier` / `SupplierPayable` | Supplier master + payables | Procurement tracking |
| `PurchaseOrder` / `PurchaseItem` | Purchase records | Goods receipt workflow |
| `PilotShop` | shopId, enrolledAt, features[] | Feature pilot tracking |
| `Feedback` | userId, feedbackType, content, rating | User feedback collection |

---

## 13. Configuration Files and Key Constants

| File | Key Constants |
|---|---|
| `backend/config/trustObjective.json` | Trust objective schema version, phase, supported horizons, locked state |
| `backend/artifacts/rolloutConfig.json` | Champion/challenger rollout percentage |
| `backend/artifacts/trustPromotionGates.v1.json` | Promotion gate thresholds (AUC-PR improvement, Brier limit) |
| `frontend/hisab-app/services/voice/config/commandGrammar.v1.js` | Grammar rules for voice command parsing |
| `frontend/hisab-app/services/voice/config/hotwordDictionary.json` | Bengali hotword vocabulary |
| `frontend/hisab-app/services/voice/config/voiceTuningConfig.js` | Per-state confidence thresholds, timeout settings |
| `frontend/hisab-app/database/schema.js` | `MAX_BATCH_BYTES=65536`, `MAX_BATCH_ITEMS=15`, `MAX_QUEUE_ATTEMPTS=8`, `ENTITY_SYNC_PRIORITY`, `ESCALATION_REQUIRED_ENTITIES` |
| `backend/sync/retryManager.js` | `DEFAULT_RETRY_POLICY: {baseDelayMs:1500, maxDelayMs:300000, maxAttempts:8, jitterFactor:0.15}` |
| `frontend/hisab-app/services/sync/retryManager.js` | Same defaults with ±30% full jitter |
| `frontend/hisab-app/services/sync/networkMonitor.js` | `CIRCUIT_CONFIG: {failureThreshold:4, openDurationMs:60000, halfOpenTimeoutMs:10000}` |
