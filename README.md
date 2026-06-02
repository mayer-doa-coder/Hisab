# Hisab

Hisab is a full-stack accounting platform for small informal retail businesses in Bangladesh. It manages credit (baki), inventory, sales, expenses, supplier payables, and customer trust scoring — entirely offline, with background sync when connectivity returns. The interface defaults to Bengali with runtime switching to English. A voice input system lets users record transactions by speaking Bengali without touching a screen.

The stack is a React Native / Expo mobile app backed by a Node.js / Express API and MongoDB. On-device SQLite is the single source of truth for the client. The backend becomes authoritative only after a sync cycle completes. All entity writes are queued locally first, batched, and pushed to the server with idempotency keys to survive repeated retries over unreliable connections.

---

## Table of Contents

- [Architecture](#architecture)
- [Techniques](#techniques)
- [Libraries and Technologies](#libraries-and-technologies)
- [Backend](#backend)
  - [Startup Sequence](#startup-sequence)
  - [Middleware Stack](#middleware-stack)
  - [API Endpoints](#api-endpoints)
  - [Controllers](#controllers)
  - [Models](#models)
  - [Services](#services)
  - [Jobs and Schedulers](#jobs-and-schedulers)
  - [ML and Ensemble Layer](#ml-and-ensemble-layer)
  - [Security and Validation](#security-and-validation)
  - [Monitoring and Export](#monitoring-and-export)
- [Frontend](#frontend)
  - [App Initialization](#app-initialization)
  - [Navigation](#navigation)
  - [Screens](#screens)
  - [Components](#components)
  - [Contexts](#contexts)
  - [Local Database](#local-database)
  - [Services](#frontend-services)
  - [Voice System](#voice-system)
  - [Theme and Design Tokens](#theme-and-design-tokens)
  - [Localization](#localization)
  - [RBAC](#rbac)
  - [Utilities](#utilities)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)

---

## Architecture

```
┌──────────────────────────────────────┐
│           React Native App           │
│   (Expo 54 / React Native 0.81)      │
│                                      │
│  ┌──────────┐    ┌────────────────┐  │
│  │  SQLite  │◄──►│ AppDataContext │  │
│  │ (source  │    │  (~80 queries) │  │
│  │  of truth│    └───────┬────────┘  │
│  └──────────┘            │           │
│                  ┌───────▼────────┐  │
│                  │  Sync Engine   │  │
│                  │ (batch/retry/  │  │
│                  │  conflict)     │  │
│                  └───────┬────────┘  │
└──────────────────────────┼──────────┘
                           │ HTTPS (JWT)
┌──────────────────────────▼──────────┐
│         Node.js / Express API        │
│              (port 5000)             │
│                                      │
│  ┌────────┐  ┌────────┐  ┌────────┐  │
│  │ Routes │  │  Auth  │  │ RBAC   │  │
│  │  (v1)  │  │  JWT   │  │ Middle-│  │
│  └───┬────┘  └────────┘  │  ware  │  │
│      │                   └────────┘  │
│  ┌───▼──────────────────────────┐    │
│  │        Controllers (25+)     │    │
│  └───┬──────────────────────────┘    │
│      │                               │
│  ┌───▼──────────┐  ┌──────────────┐  │
│  │  MongoDB     │  │  ML / Trust  │  │
│  │  (Mongoose   │  │  Ensemble    │  │
│  │   45+ schemas│  │  Engine      │  │
│  └──────────────┘  └──────────────┘  │
└──────────────────────────────────────┘
```

The client never blocks on a network call for entity writes. All mutations go to SQLite first, appear immediately in the UI, and are queued for sync. The server-side sync endpoint accepts batches of 15 items (≤ 64 KB each), processes them transactionally, and returns conflict tokens the client resolves per entity.

---

## Techniques

- **Finite State Machine for voice input** — The voice transaction layer uses an 11-state [FSM](https://developer.mozilla.org/en-US/docs/Glossary/State_machine) (`WAIT_INTENT → WAIT_NAME → WAIT_AMOUNT → WAIT_DATE → REVIEW → CONFIRM → WAIT_PIN → EXECUTE`) to guide a speaker through recording a transaction. Each state has its own confidence threshold (0.80 for intent, 1.0 for PIN). Two consecutive failures at any state hand control back to the touch UI.

- **Offline-first sync with structured conflict resolution** — The client writes to SQLite and enqueues changes. The sync engine batches them and pushes to the server. Conflicts surface four typed tokens: `version_mismatch`, `conflict`, `requires_client_resolution`, and `idempotency_key_reused_with_different_payload`. Each is resolved per entity with one of three strategies: client-wins, server-wins, or merge.

- **Idempotency via payload hashing** — Every write is hashed before dispatch. The server stores the hash with a 24-hour TTL and short-circuits duplicate requests without additional DB writes. This makes aggressive retry safe over flaky mobile connections.

- **Global [prototype](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Advanced_JavaScript_objects/Object_prototypes) patching for Bengali rendering** — [App.js](frontend/hisab-app/App.js) overrides the `render` method on React Native's `Text` and `TextInput` components at module load time, injecting the Anek Bangla font family and auto-translating string children across the entire component tree. `Alert.alert` is patched the same way. No per-component `style` or `t()` call is required.

- **Champion/challenger ML deployment** — The trust scoring system routes live traffic through a canary deployment gate. New model versions start at 5% of requests. Automated promotion runs if eight production guardrails pass: Brier score, PSI drift, fallback rate, calibration shift, mean probability, ranking AUC, segment coverage, and override rate. Any guardrail breach triggers automatic rollback to the champion.

- **Grammar-constrained ASR decoding** — Rather than running raw transcript through NLP, the voice layer restricts ASR output to a known command vocabulary before entity extraction. This reduces hallucination and misparse rates typical in noisy market environments.

- **Bengali [Unicode](https://developer.mozilla.org/en-US/docs/Glossary/Unicode) digit normalization** — Before any numeric parse, the voice FSM converts Bengali digits (০–৯, codepoints U+09E6–U+09EF) to ASCII equivalents inline. This is transparent to all downstream parsers regardless of ASR provider.

- **FEFO batch inventory** — Stock is consumed in first-expire-first-out order. Each batch tracks `expiryDate`, `purchaseDate`, `batchNumber`, and `costPriceCents`. The `selectBatchForSale` query returns the next batch to draw from, and `consumeInventoryBatchesTx` allocates across multiple batches atomically.

- **Walk-forward backtesting for ML models** — Trust and reorder models are evaluated with a walk-forward (expanding window) backtest rather than a hold-out split, preventing data leakage from future periods into training.

- **Banglish transliteration search** — The customer and product search layers convert Banglish input (Latin-script Bengali phonetics typed on an English keyboard) to Bengali Unicode before querying, so users can type "baksh" and match "বাক্স".

- **Indian number grouping with locale digits** — All currency and number formatting applies Indian grouping (12,34,567 not 1,234,567) and converts digits to Bengali script when the locale is `bn`, using a shared `formatNumber` utility that drives every screen.

- **USSD payment codes** — For customers on feature phones without internet, the system generates 6-digit USSD payment codes with a 24-hour TTL that map to a specific baki transaction.

---

## Libraries and Technologies

| Library / Tool | Purpose |
|---|---|
| [Expo 54 / React Native 0.81](https://expo.dev) | Managed mobile app runtime with native module support |
| [expo-sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/) | On-device SQLite — the primary client-side data store |
| [React Navigation](https://reactnavigation.org) (drawer + native stack) | Navigation combining a sidebar drawer with stack screens |
| [react-native-reanimated](https://docs.swmansion.com/react-native-reanimated/) | Gesture-driven UI animations |
| [react-native-gesture-handler](https://docs.swmansion.com/react-native-gesture-handler/) | Native gesture recognition for drawer and swipe interactions |
| [expo-audio](https://docs.expo.dev/versions/latest/sdk/audio/) | Audio recording for voice input |
| [expo-camera](https://docs.expo.dev/versions/latest/sdk/camera/) | Camera access for baki photo verification |
| [expo-image-picker](https://docs.expo.dev/versions/latest/sdk/imagepicker/) | Gallery picker for profile and baki photos |
| [Anek Bangla](https://fonts.google.com/specimen/Anek+Bangla) | Bengali-script typeface, loaded via `@expo-google-fonts/anek-bangla` |
| [AssemblyAI](https://www.assemblyai.com) | Cloud ASR fallback for Bengali voice input |
| [Mongoose 8](https://mongoosejs.com) | MongoDB ODM backing 45+ schema definitions |
| [Zod](https://zod.dev) | Runtime schema validation for all incoming API payloads |
| [Helmet](https://helmetjs.github.io) | HTTP security headers on the Express server |
| [PDFKit](https://pdfkit.org) | Server-side PDF report generation |
| [Multer](https://github.com/expressjs/multer) | Multipart file upload handling for baki photos |
| [Nodemailer](https://nodemailer.com) | Transactional email (verification codes, recovery tokens) |
| [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) | JWT issuance and verification (15-min access, 7-day refresh) |
| [bcrypt](https://github.com/kelektiv/node.bcrypt.js) | Password and PIN hashing |
| [BullMQ](https://bullmq.io) | Redis-backed job queue (scaffolded, not yet active) |
| [ONNX Runtime](https://onnxruntime.ai) | On-device inference for lightweight Bengali ASR model |

---

## Backend

### Startup Sequence

[backend/server.js](backend/server.js) is the entry point. On boot it:

1. Loads environment variables via `dotenv`
2. Connects to MongoDB via `mongoose`
3. Starts three background schedulers: `authRetentionScheduler` (cleans expired sessions), `trustOptimizationScheduler` (runs model guardrail checks), `lifecycleScheduler` (handles entity lifecycle events)
4. Registers process-level crash handlers that write to the monitoring log before exit
5. Listens on `PORT` (default 5000) and implements graceful shutdown on `SIGTERM`/`SIGINT`

[backend/app.js](backend/app.js) configures the Express application:

1. Sets `trust proxy` for reverse proxy deployments
2. Registers middleware in order: `requestContext` → `performanceMiddleware` → `helmet` → custom `securityHeaders` → `cors` → `express.json` (16 KB limit) → `express.urlencoded` (16 KB limit)
3. Mounts health endpoints: `GET /` and `GET /health`
4. Serves uploaded baki images from `/uploads/baki-images`
5. Mounts all route modules with auth middleware and rate limiting applied per-domain
6. Attaches error-handling middleware last

---

### Middleware Stack

Located in [backend/middleware/](backend/middleware/):

| Middleware | Purpose |
|---|---|
| `authMiddleware.js` | Verifies JWT access token; attaches `userId`, `branchId`, `role` to `req` |
| `rbacMiddleware.js` | Checks that the authenticated role holds the required permission for the route |
| `rateLimiter.js` | Three tiers: auth routes (60 req / 15 min), read routes (300 req / 10 min), write routes (120 req / 10 min) |
| `requestContext.js` | Generates `requestId` UUID per request for tracing |
| `performanceMiddleware.js` | Records request latency and status code to the monitoring layer |
| `securityHeaders.js` | Adds custom headers beyond what Helmet sets (CORP, COOP, etc.) |
| `validationMiddleware.js` | Runs Zod schema validation on `req.body`; returns 422 on failure |
| `idempotencyMiddleware.js` | Checks SHA hash of write payloads; short-circuits duplicates within 24 hours |
| `uploadMiddleware.js` | Multer config for baki photo uploads (file size limit, MIME whitelist) |

---

### API Endpoints

#### Auth (`/api/auth`)

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/signup` | Create account with email + PIN |
| POST | `/api/auth/login` | Email + PIN/password login; returns access + refresh tokens |
| POST | `/api/auth/verify-email/request` | Send email verification code |
| POST | `/api/auth/verify-email/confirm` | Confirm email with code |
| POST | `/api/auth/pin/login` | Quick login with PIN only (trusted device) |
| POST | `/api/auth/pin/setup` | Set PIN after signup (auth required) |
| POST | `/api/auth/refresh` | Exchange refresh token for new access token |
| POST | `/api/auth/recover/request` | Request PIN recovery email |
| POST | `/api/auth/recover/reset` | Reset PIN using recovery token |
| POST | `/api/auth/recover/request-password` | Request password reset email |
| GET | `/api/auth/profile` | Get authenticated user profile |
| PUT | `/api/auth/profile` | Update name and profile image |
| PUT | `/api/auth/pin/update` | Change PIN (requires current PIN) |
| POST | `/api/auth/logout` | Invalidate session |

#### Sync (`/api/v1/sync`)

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/sync` | Accept batched entity changes from client; returns conflict tokens |
| GET | `/api/v1/sync/status` | Server sync health and last sync timestamp |

#### Baki (`/api/v1/baki`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/baki` | List baki entries with optional customer/status/date filters |
| POST | `/api/v1/baki` | Create baki entry |
| PUT | `/api/v1/baki/:id` | Update baki entry |
| DELETE | `/api/v1/baki/:id` | Soft delete baki entry |
| POST | `/api/v1/baki/:id/payment` | Record payment against baki entry |
| POST | `/api/v1/baki/image` | Upload photo proof for baki entry |

#### Customers (`/api/v1/customers`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/customers` | List customers with search, due filter, sort |
| POST | `/api/v1/customers` | Create customer |
| PUT | `/api/v1/customers/:id` | Update customer |
| DELETE | `/api/v1/customers/:id` | Soft delete customer |
| GET | `/api/v1/customers/:id/ledger` | Customer ledger with running balance |
| GET | `/api/v1/customers/:id/statement` | Statement with date range filter |
| GET | `/api/v1/customers/:id/statement/csv` | CSV export of statement |
| POST | `/api/v1/customers/:id/reminders` | Schedule collection reminder |
| GET | `/api/v1/customers/:id/reminders` | List reminders |
| POST | `/api/v1/customers/:id/payment-promises` | Record payment promise |
| GET | `/api/v1/customers/:id/payment-promises` | List payment promises |
| PUT | `/api/v1/customers/:id/payment-promises/:pid` | Update promise status |

#### Trust & Risk (`/api/v1/trust`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/trust` | Fetch ML risk scores for all customers |
| POST | `/api/v1/trust/monitoring` | Push guardrail metric snapshot from client |

#### Customer Markov (`/api/v1/customerMarkov`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/customerMarkov` | Markov state distributions per customer |
| POST | `/api/v1/customerMarkov/train` | Trigger Markov model training run |

#### Products & Inventory (`/api/v1/products`, `/api/v1/movements`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/products` | List products with health metrics |
| POST | `/api/v1/products` | Create product |
| PUT | `/api/v1/products/:id` | Update product |
| DELETE | `/api/v1/products/:id` | Soft delete product |
| GET | `/api/v1/movements` | Stock movement log |
| POST | `/api/v1/movements` | Record stock in/out/adjust |

#### Transactions / Sales (`/api/v1/transactions`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/transactions` | List sales with filters |
| POST | `/api/v1/transactions` | Create sale |
| GET | `/api/v1/transactions/:id/receipt` | Get receipt |

#### Reports (`/api/v1/reports`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/reports/dashboard` | KPI summary (sales, due, payments) |
| GET | `/api/v1/reports/profit` | P&L with COGS and gross margin |
| GET | `/api/v1/reports/cashflow` | Cash in/out and running balance |
| GET | `/api/v1/reports/collections` | Receivables by aging bucket and risk level |
| GET | `/api/v1/reports/activity` | Activity insight example |

#### Suggestions (`/api/v1/suggestions`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/suggestions/reorder` | Reorder suggestions (Markov + safety stock + EOQ) |
| GET | `/api/v1/suggestions/stock` | Stock-level recommendations |

#### Approval Requests (`/api/v1/approvalRequests`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/approvalRequests` | List pending approval requests |
| POST | `/api/v1/approvalRequests/:id/approve` | Approve request |
| POST | `/api/v1/approvalRequests/:id/reject` | Reject request |

#### Audit Logs (`/api/v1/auditLogs`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/auditLogs` | Audit trail with entity/action/date filters |

#### Branches (`/api/v1/branches`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/branches` | List branches |
| POST | `/api/v1/branches` | Create branch |
| PUT | `/api/v1/branches/:id` | Update branch |

#### Team Users (`/api/v1/teamUsers`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/teamUsers` | List team members and roles |
| POST | `/api/v1/teamUsers` | Invite team member |
| PUT | `/api/v1/teamUsers/:id/role` | Change role |
| DELETE | `/api/v1/teamUsers/:id` | Remove member |

#### Global Identity (`/api/v1/globalIdentity`)

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/globalIdentity/lookup` | Look up customer across shops by phone |
| POST | `/api/v1/globalIdentity/verify-otp` | Verify OTP for cross-shop identity (console-log only in current build) |

#### Market Data (`/api/v1/marketData`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/marketData` | Market reference prices for products |

#### Pilot (`/api/v1/pilot`)

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/pilot/enroll` | Enroll in pilot program |
| GET | `/api/v1/pilot/status` | Pilot enrollment and metrics |
| POST | `/api/v1/pilot/events` | Track analytics event |

#### Reliability (`/api/v1/reliability`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/reliability` | Backend reliability metrics (uptime, error rate) |

#### Markov Models (`/api/v1/markov`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/markov` | Markov demand state predictions for products |

#### STT (`/api/stt`)

| Method | Path | Description |
|---|---|---|
| POST | `/api/stt/transcribe` | Cloud speech-to-text transcription |
| POST | `/api/stt/validate` | Validate transcription confidence |

#### USSD (`/api/ussd`)

| Method | Path | Description |
|---|---|---|
| POST | `/api/ussd/generate` | Generate 6-digit payment code with 24-hr TTL |
| POST | `/api/ussd/verify` | Verify payment code and mark baki paid |
| POST | `/api/ussd/webhook` | Receive USSD gateway callbacks |

#### Webhooks (`/api/webhooks`)

| Method | Path | Description |
|---|---|---|
| POST | `/api/webhooks/payment` | Receive bKash / Nagad payment confirmations |
| POST | `/api/webhooks/sms` | Receive SMS delivery receipts |

---

### Controllers

All controllers live in [backend/controllers/v1/](backend/controllers/v1/). Each maps directly to one route domain:

| Controller | Key Functions |
|---|---|
| `authController.js` | `signup`, `login`, `pinLogin`, `setupPin`, `updatePin`, `refreshToken`, `logout`, `verifyEmail`, `requestRecovery`, `resetPin`, `getProfile`, `updateProfile` |
| `syncController.js` | `syncChanges` (batch accept, idempotency check, conflict detection), `getSyncStatus` |
| `bakiController.js` | `listBaki`, `createBaki`, `updateBaki`, `deleteBaki`, `recordPayment`, `uploadBakiImage` |
| `customerController.js` | `listCustomers`, `createCustomer`, `updateCustomer`, `deleteCustomer`, `getLedger`, `getStatement`, `exportStatementCsv`, `createReminder`, `listReminders`, `createPromise`, `listPromises`, `updatePromise` |
| `trustController.js` | `getTrustScores`, `pushTrustMonitoring` |
| `customerMarkovController.js` | `getMarkovStates`, `triggerTraining` |
| `productController.js` | `listProducts`, `createProduct`, `updateProduct`, `deleteProduct` |
| `movementController.js` | `listMovements`, `createMovement` |
| `transactionController.js` | `listTransactions`, `createTransaction`, `getReceipt` |
| `reportController.js` | `getDashboard`, `getProfitReport`, `getCashflow`, `getCollections`, `getActivityInsight` |
| `suggestionController.js` | `getReorderSuggestions`, `getStockSuggestions` |
| `approvalController.js` | `listApprovals`, `approveRequest`, `rejectRequest` |
| `auditController.js` | `listAuditLogs` |
| `branchController.js` | `listBranches`, `createBranch`, `updateBranch` |
| `teamUserController.js` | `listTeam`, `inviteMember`, `changeRole`, `removeMember` |
| `globalIdentityController.js` | `lookupCustomer`, `verifyOtp` |
| `marketDataController.js` | `getMarketData` |
| `pilotController.js` | `enrollPilot`, `getPilotStatus`, `trackEvent` |
| `reliabilityController.js` | `getReliabilityMetrics` |
| `markovController.js` | `getPredictions` |

---

### Models

All Mongoose schemas live in [backend/models/](backend/models/). Key schemas:

| Schema | Fields |
|---|---|
| `User.js` | `email`, `passwordHash`, `pinHash`, `name`, `profileImageUrl`, `role`, `branchId`, `emailVerified`, `lastLoginAt`, `sessionTokens[]`, `deviceProfiles[]` |
| `Customer.js` | `shopId`, `branchId`, `name`, `phone`, `address`, `creditLimit`, `dueTermsDays`, `riskLevel`, `currentDue`, `totalPaid`, `syncId`, `deletedAt` |
| `BakiEntry.js` | `shopId`, `customerId`, `amount`, `note`, `dueDate`, `dueTermsDays`, `status` (open/partial/paid), `paidAmount`, `imageUrl`, `referenceId`, `syncId` |
| `Transaction.js` | `shopId`, `branchId`, `customerId`, `items[]` (productId, qty, price, batchId), `paymentMethod`, `amountCents`, `receiptId`, `note`, `syncId` |
| `Product.js` | `shopId`, `name`, `quantity`, `priceCents`, `expiryDate`, `lowStockThreshold`, `costPriceCents`, `barcode`, `category`, `syncId`, `deletedAt` |
| `InventoryBatch.js` | `shopId`, `productId`, `quantity`, `batchNumber`, `expiryDate`, `purchaseDate`, `costPriceCents`, `syncId` |
| `StockMovement.js` | `shopId`, `productId`, `batchId`, `quantity`, `type` (in/out/adjust/count), `reason`, `saleId`, `purchaseOrderId`, `syncId` |
| `Supplier.js` | `shopId`, `name`, `phone`, `address`, `totalOwed`, `syncId` |
| `PurchaseOrder.js` | `shopId`, `supplierId`, `items[]`, `status` (pending/partial/received/cancelled), `orderDate`, `expectedDeliveryDate`, `syncId` |
| `Expense.js` | `shopId`, `userId`, `category`, `amountCents`, `note`, `occurredAt`, `paymentMethod`, `syncId` |
| `CashbookEntry.js` | `shopId`, `type` (IN/OUT), `amountCents`, `description`, `sourceType`, `sourceId`, `occurredAt` |
| `DayClose.js` | `shopId`, `businessDate`, `expectedCash`, `cashOnHand`, `variance`, `note`, `closedBy` |
| `ApprovalRequest.js` | `shopId`, `requestedBy`, `action`, `entityType`, `entityId`, `metadata`, `status` (pending/approved/rejected), `reviewedBy` |
| `AuditLog.js` | `shopId`, `userId`, `actor`, `action`, `entityType`, `entityId`, `diff`, `metadata`, `source`, `createdAt` |
| `SecurityEvent.js` | `shopId`, `userId`, `eventType`, `metadata`, `severity`, `createdAt` |
| `CollectionReminder.js` | `shopId`, `customerId`, `channel` (sms/whatsapp/call/manual), `dueAmount`, `promiseDate`, `note`, `status` |
| `PaymentPromise.js` | `shopId`, `customerId`, `promisedAmount`, `promiseDate`, `status` (pending/fulfilled/broken), `fulfilledBakiTransactionId` |
| `Branch.js` | `shopId`, `name`, `address`, `isDefault`, `createdAt` |
| `TeamUser.js` | `shopId`, `userId`, `role`, `invitedBy`, `inviteAccepted`, `createdAt` |
| `MarketData.js` | `productName`, `category`, `regionCode`, `priceCents`, `updatedAt` |
| `PilotShop.js` | `shopName`, `location`, `status`, `enrolledAt` |
| `AnalyticsEvent.js` | `shopId`, `userId`, `eventType`, `metadata`, `source`, `createdAt` |
| `Feedback.js` | `shopId`, `userId`, `category`, `message`, `metadata`, `createdAt` |
| `SyncLog.js` | `shopId`, `userId`, `batchSize`, `conflictCount`, `processedAt` |
| `IdempotencyRecord.js` | `hash`, `response`, `expiresAt` |
| `UssdCode.js` | `shopId`, `customerId`, `bakiEntryId`, `code`, `amountCents`, `expiresAt`, `used` |

**ML Model schemas** in [backend/models/baseline/](backend/models/baseline/), [backend/models/markov/](backend/models/markov/), [backend/models/ema/](backend/models/ema/), and [backend/models/reorder/](backend/models/reorder/) store trained model coefficients, version metadata, training timestamps, and evaluation metrics for the trust and demand forecasting pipelines.

---

### Services

Located in [backend/services/](backend/services/):

**Trust Scoring** ([backend/services/trust/](backend/services/trust/)):

| File | Role |
|---|---|
| `customerRiskEngine.js` | Main entry point; routes requests through gating logic |
| `trustChampionModel.js` | Logistic regression for low/medium risk classification |
| `trustChallengerModel.js` | LightGBM-style model for high-risk and fraud detection |
| `trustSegmentPromotion.js` | Segment-based uplift scoring (new vs. repeat customers) |
| `trustGating.js` | Routes traffic: 5% → challenger, 95% → champion (configurable) |
| `trustExplainability.js` | SHAP-style feature importance for each score |
| `trustFallbackPolicy.js` | Rule-based scoring when ML models are unavailable |
| `trustMonitoringEngine.js` | Tracks Brier score, PSI drift, calibration shift, fallback rate |
| `trustRolloutControl.js` | Canary deployment logic; promotes challenger to champion when guardrails pass |

**Prediction** ([backend/services/prediction/](backend/services/prediction/)):

| File | Role |
|---|---|
| `reorderSuggestionEngine.js` | Combines Markov demand + safety stock + EOQ to generate reorder suggestions |
| `markovDemandModel.js` | Markov chain state transitions for demand forecasting |
| `safetyStockCalculator.js` | Safety stock formula (85% service level, configurable lead time) |
| `eoqCalculator.js` | Economic Order Quantity optimization |

**Seasonal** ([backend/services/seasonal/](backend/services/seasonal/)):

| File | Role |
|---|---|
| `islamicHolidayCalendar.js` | Eid ul-Fitr dates 2024–2032 hardcoded; demand multipliers per holiday window |
| `monsoonPattern.js` | Monsoon season demand adjustments |
| `harvestCalendar.js` | Harvest season patterns by crop region |
| `festivalCalendar.js` | Other festival demand signals |

**V1 Services** ([backend/services/v1/](backend/services/v1/)):

| File | Role |
|---|---|
| `auditService.js` | Write audit log entries with entity diffs |
| `changelogService.js` | Field-level change tracking |
| `idempotencyService.js` | Hash storage and duplicate detection |

---

### Jobs and Schedulers

Located in [backend/jobs/](backend/jobs/):

| Scheduler | Trigger | Purpose |
|---|---|---|
| `authRetentionScheduler.js` | Daily | Delete expired session tokens and refresh tokens |
| `trustOptimizationScheduler.js` | Weekly | Run guardrail evaluation; promote challenger if thresholds met |
| `lifecycleScheduler.js` | Hourly | Handle entity lifecycle events (expire USSD codes, resolve stale approvals) |

Scripts for manual operations live in [backend/scripts/](backend/scripts/):

| Script | Purpose |
|---|---|
| `trainTrustModel.js` | Full trust model training from DB data |
| `backtestTrustModel.js` | Walk-forward backtest evaluation |
| `promoteTrustModel.js` | Manually promote challenger to champion |
| `quarterlyRetrain.js` | Scheduled quarterly retraining pipeline |
| `emergencyRollback.js` | Force rollback to previous champion immediately |
| `seedData.js` | Seed development database |

---

### ML and Ensemble Layer

[backend/ai/](backend/ai/) and [backend/ensemble/](backend/ensemble/) handle model inference and combination:

- **Feature extraction**: Normalizes customer payment history, due amounts, transaction frequency, recency, and payment-on-time ratio into feature vectors.
- **Logistic regression baseline**: Reads stored coefficients from the `baseline/` model schema. Produces a risk probability and threshold-based LOW / MEDIUM / HIGH classification.
- **Markov chain**: Tracks customer state transitions (paying → late → default and back) using historical payment sequences. Used for both customer risk and product demand forecasting.
- **EMA (Exponential Moving Average)**: Smoothed demand signal used alongside Markov for reorder suggestions.
- **Ensemble combination**: Weighted average of logistic regression, Markov posterior, and EMA signal. Weights are version-tracked in the `reorder/` model schema.
- **Walk-forward backtesting**: Training window expands one period at a time; test window is always the next period. Computes Brier score, AUC, and calibration curve per fold.

---

### Security and Validation

[backend/security/](backend/security/) and [backend/validation/](backend/validation/):

- RBAC definitions: Four roles (`OWNER`, `CASHIER`, `STOCK_MANAGER`, `ACCOUNTANT`) with 9 granular permission actions
- JWT configuration: 15-minute access token, 7-day refresh token, device fingerprinting
- Zod schemas for every writable endpoint: enforced by `validationMiddleware` before controllers run
- CORS configured from `CORS_ALLOWED_ORIGINS` environment variable (strict origin list in production, open in development)
- Rate limiting: separate buckets per route tier (auth / read / write)

---

### Monitoring and Export

[backend/monitoring/](backend/monitoring/) tracks:

- Request latency and status codes per endpoint
- Process crash events (written before exit)
- Trust model guardrail metrics (Brier, PSI, calibration shift, fallback rate, AUC)
- Sync batch statistics (batch size, conflict count)

[backend/export/](backend/export/):

- PDF generation via PDFKit for financial reports (profit, statement, receipt)
- CSV export for customer statements

---

## Frontend

### App Initialization

[frontend/hisab-app/App.js](frontend/hisab-app/App.js) boots the app in this order:

1. **Font loading** — `useFonts` loads all five Anek Bangla weights (400–800). A loading spinner is shown until fonts resolve.
2. **Global patches** — `Text.render`, `TextInput.render`, and `Alert.alert` are monkey-patched at module scope to auto-apply the Anek Bangla font and auto-translate string content using `LanguageContext`.
3. **Provider stack**:

```
SafeAreaProvider
└── LanguageProvider         (language state + t(), fmtNumber(), fmtCurrency())
    └── AuthContext.Provider (session, login, logout, token refresh)
        └── NavigationContainer
            ├── AuthStack    (unauthenticated users)
            └── MainStack
                └── MainDataShell (loads all entity data into AppDataContext)
```

4. **Session restoration** — `AuthContext` reads the last session from local SQLite and validates it with the server if online. Falls back to offline mode if the server is unreachable.
5. **Data loading** — `MainDataShell` loads products, customers, baki, alerts, and all other entities into `AppDataContext` via local DB queries.
6. **Background sync** — Registers a background task that runs the sync engine every 15 minutes and on app resume from background.

---

### Navigation

[frontend/hisab-app/navigation/](frontend/hisab-app/navigation/) defines the full navigation tree:

```
Root Navigator
├── AuthStack (unauthenticated)
│   ├── Login
│   ├── Signup
│   ├── VerifyEmail
│   ├── PinLogin
│   ├── SetupPin
│   ├── AccountRecovery
│   └── ResetPassword
│
└── MainStack (authenticated)
    ├── MainTabs (bottom tab bar)
    │   ├── Tab: Dashboard
    │   ├── Tab: Sales
    │   ├── Tab: Baki
    │   ├── Tab: Products
    │   └── Tab: More → DrawerNavigator
    │
    ├── Modal: Receipt
    ├── Modal: UpdatePassword
    └── Modal: SetupPin

DrawerNavigator (role-filtered via RBAC)
├── Dashboard
├── Sales / SalesHistory
├── Baki
├── Products / ProductDetails / Alerts / InventoryBatches / CycleCount / StockMovement
├── Customers / CustomerLedger / CustomerStatement / CustomerCredit / Collections
├── Suppliers / PurchaseOrders / GoodsReceive / PurchaseHistory
├── Reports / ProfitReport / Cashbook / Expenses / DayClose
├── ApprovalRequests / AuditHistory
├── SyncConflicts / OfflineQueueMonitor / BackupRestore
├── VoiceAssistant / VoicePackDownload
├── Onboarding / HelpCenter / Feedback
└── Profile
```

The drawer content is rendered by [frontend/hisab-app/components/navigation/CustomDrawerContent.js](frontend/hisab-app/components/navigation/) which filters visible items based on the authenticated user's role.

---

### Screens

#### Auth

| Screen | Description |
|---|---|
| `LoginScreen` | Email + PIN login with "remember device" toggle and retry rate limiting |
| `SignupScreen` | Account creation flow with email verification requirement |
| `VerifyEmailScreen` | Enter 6-digit code sent to email |
| `PinLoginScreen` | Quick PIN-only login for trusted devices |
| `SetupPinScreen` | First-time PIN setup after account creation |
| `UpdatePasswordScreen` | Change PIN with current PIN required |
| `AccountRecoveryScreen` | Request reset token via email |
| `ResetPasswordScreen` | Set new PIN using recovery token |

#### Dashboard and Reporting

| Screen | Description |
|---|---|
| `DashboardScreen` | KPI summary (outstanding due, sales, payments, customer/product counts), period selector (daily/weekly/monthly), quick action tiles |
| `ReportsScreen` | Navigation hub to all report sub-screens |
| `ProfitReportScreen` | P&L with COGS, gross margin, and net profit by period |
| `CashbookScreen` | Cash in/out ledger with running balance |
| `ExpenseScreen` | Expense list with categories; create/edit/delete expenses |
| `DayCloseScreen` | End-of-day cash reconciliation — expected cash vs. actual cash on hand, variance, lock day |

#### Sales

| Screen | Description |
|---|---|
| `SalesScreen` | Multi-step sale flow: product selection → cart → payment method (CASH/bKash/Nagad/MIXED) → customer → confirm |
| `SalesHistoryScreen` | Historical transactions with date/customer/product filters |
| `ReceiptScreen` | Formatted receipt view (modal) |

#### Customer Management

| Screen | Description |
|---|---|
| `CustomerListScreen` | Customer list with search, due filter (all/due only/no due), sort (recent/alphabetical); add/edit/delete |
| `CustomerLedgerScreen` | Per-customer timeline of credits and payments with running balance |
| `CustomerStatementScreen` | Date-ranged statement with opening balance, transactions, closing balance; CSV export |
| `CollectionsDashboardScreen` | Receivables by aging bucket (0–30, 31–60, 60–90, 90+ days), per-risk-level breakdown |
| `CustomerCreditScreen` | Credit limit and current exposure per customer |

#### Baki (Credit)

| Screen | Description |
|---|---|
| `BakiListScreen` | Baki entries with search, filter by status/customer/date, sort options; create baki; record payment |

#### Inventory

| Screen | Description |
|---|---|
| `ProductListScreen` | Products with quantity, price, low-stock indicator; add/edit/delete |
| `ProductDetailsScreen` | Individual product with batch history and movement log |
| `InventoryBatchViewScreen` | FEFO batch list per product showing expiry dates and remaining quantity |
| `AlertsScreen` | Active inventory alerts: LOW_STOCK, EXPIRY, DEAD_STOCK, OVERSTOCK with severity levels |
| `CycleCountScreen` | Physical count reconciliation: scan and record actual quantity per batch |
| `StockMovementScreen` | Full stock movement log (in/out/adjust/count) with filters |

#### Purchasing

| Screen | Description |
|---|---|
| `SupplierScreen` | Supplier list; create/edit/delete suppliers |
| `PurchaseOrderScreen` | Create and view purchase orders by supplier and status (pending/partial/received/cancelled) |
| `GoodsReceiveScreen` | Receive line items against a PO; updates inventory and batch records |
| `PurchaseHistoryScreen` | Historical POs with supplier payables summary |

#### Approvals and Audit

| Screen | Description |
|---|---|
| `ApprovalRequestsScreen` | Pending approval workflow requests for high-value or sensitive operations |
| `AuditHistoryScreen` | Entity-level audit log with user, action, entity type, metadata, and timestamp |

#### Sync and Offline

| Screen | Description |
|---|---|
| `SyncConflictScreen` | Display unresolved sync conflicts; choose client-wins, server-wins, or merge per entity |
| `OfflineQueueMonitor` | View pending changes waiting to sync, with entity type, operation, and retry count |
| `BackupRestoreScreen` | Export local database to JSON snapshot; restore from snapshot |

#### Voice

| Screen | Description |
|---|---|
| `VoiceAssistantScreen` | Voice command interface with intent detection, live transcription, step-by-step FSM flow, and touch correction fallback |
| `VoicePackDownloadScreen` | Download and manage on-device ASR model packs with checksum validation and resume support |

#### Onboarding and Help

| Screen | Description |
|---|---|
| `OnboardingScreen` | Pilot program enrollment and enrollment status |
| `HelpCenterScreen` | Contextual help and FAQs |
| `FeedbackScreen` | Submit bug reports, feature requests, or UX feedback |
| `ProfileScreen` | Edit name and photo, toggle language, manage notifications, change PIN, logout |

---

### Components

#### UI Primitives ([frontend/hisab-app/components/ui/](frontend/hisab-app/components/ui/))

| Component | Description |
|---|---|
| `AppButton` | Styled button with loading state and disabled style |
| `AppCard` | Surface container with shadow and rounded corners |
| `AppInput` | Text input with Anek Bangla font, bilingual placeholder support |
| `LanguageToggle` | Switch between English and Bengali |
| `QuickActionTile` | Icon + label tile for dashboard quick actions |

#### Baki Components ([frontend/hisab-app/components/baki/](frontend/hisab-app/components/baki/))

| Component | Description |
|---|---|
| `BakiEntryForm` | Form to record a new baki entry with customer, amount, note, due date |
| `BakiFilters` | Date range, status (open/partial/paid), and customer filter controls |
| `BakiKpiDashboard` | Summary cards: total outstanding, overdue, collections this period |
| `BakiListItem` | Single baki row with customer name, amount, due date, status badge |
| `BakiSummaryCards` | KPI boxes for total credit, payments received, and net |
| `CustomerPhotoCapture` | Camera capture UI for attaching photo proof to a baki entry |
| `PaymentCodeModal` | Display 6-digit USSD payment code with TTL countdown |
| `PaymentEntryForm` | Form to record a payment against an existing baki entry |
| `PhotoPreviewBadge` | Small badge showing a thumbnail of an attached baki photo |

#### Customer Components ([frontend/hisab-app/components/customers/](frontend/hisab-app/components/customers/))

| Component | Description |
|---|---|
| `CustomerChipSelector` | Autocomplete chip input for selecting a customer inline |
| `CustomerForm` | Add/edit customer: name, phone, address, credit limit, due terms |
| `CustomerLedgerTimeline` | Visual timeline of credits and payments |
| `CustomerListItem` | Customer row with name, balance, due amount, risk badge |
| `CustomerQuickAddModal` | Lightweight modal to create a customer during a sale flow |
| `CustomerRiskBadge` | Color-coded badge (LOW/MEDIUM/HIGH) showing credit risk level |
| `CustomerSearchControls` | Search input, due filter toggle, and sort selector |

#### Product Components ([frontend/hisab-app/components/products/](frontend/hisab-app/components/products/))

| Component | Description |
|---|---|
| `ProductExpiryAlerts` | List of products with upcoming expiry dates |
| `ProductForm` | Add/edit product: name, quantity, price, expiry date, low-stock threshold |
| `ProductListItem` | Product row with quantity, price, and status badges (low stock, expiring) |
| `ProductLowStockAlerts` | Filtered list of products below their low-stock threshold |
| `ProductReorderSuggestions` | AI-generated reorder recommendations with confidence and explanation |
| `ProductSummaryCards` | KPI cards for total stock value, turnover rate, and gross margin |

#### App Shell ([frontend/hisab-app/components/app/](frontend/hisab-app/components/app/))

| Component | Description |
|---|---|
| `BootLoading` | Splash screen shown during font loading and session restoration |
| `MainDataShell` | Root data provider that initializes ML models, loads all entity data, and populates `AppDataContext` with ~80 query and mutation functions |

#### Voice Components ([frontend/hisab-app/components/voice/](frontend/hisab-app/components/voice/))

| Component | Description |
|---|---|
| `ConfidenceIndicator` | Visual meter showing ASR confidence score (0–100%) |
| `CorrectionPanel` | UI for user to correct a misheard field (name, amount, date) |
| `HeardTokenDisplay` | Shows parsed intent tokens: customer, amount, date, transaction type |
| `ReviewScreen` | Summarizes parsed transaction for user confirmation before execution |
| `VoiceStepScreen` | Base layout shared by all voice FSM step screens |

#### Other Top-Level Components

| Component | Description |
|---|---|
| `CartItem` | Shopping cart row with quantity editor and line-total display |
| `ConfidenceBar` | Horizontal bar visualizing a confidence score from 0–100% |
| `ExplainPanel` | Expandable panel showing why a suggestion or risk score was produced |
| `FilterBar` | Generic filter and sort control row used across multiple list screens |
| `PaymentSelector` | Payment method picker with amount split support (e.g., partial bKash + partial cash) |
| `ProductSelector` | Product search-and-select dropdown used in sales and purchase flows |
| `ReceiptView` | Formatted receipt layout for display and PDF generation |
| `SalesHistoryItem` | Transaction history row with date, customer, amount, payment method |
| `SuggestionCard` | Card for reorder or stock suggestions with confidence score and explanation |

---

### Contexts

#### AuthContext ([frontend/hisab-app/context/AuthContext.js](frontend/hisab-app/context/AuthContext.js))

**State**: `user`, `session`, `authBooting`, `isOnline`, `authDeviceProfile`, `authStatus`

**Functions**:

| Function | Description |
|---|---|
| `login(email, pin, options)` | Online login; stores tokens locally |
| `signup(email, pin, options)` | Create account; triggers email verification |
| `loginWithPin(pin, email?, rememberMe?)` | Quick PIN-only login for trusted devices |
| `setupPin(pin, trustDevice?)` | Set PIN after signup |
| `updatePin(currentPin, newPin)` | Change PIN with current PIN verification |
| `requestPinRecovery(email)` | Send recovery token to email |
| `resetPin(resetToken, newPin)` | Reset PIN using recovery token |
| `verifyEmailCode(email, code, rememberMe)` | Complete email verification |
| `logout()` | Sign out; clear local session |
| `updateProfile(name, imageUri?)` | Update name and profile photo |
| `updateDevicePreferences(email, pinEnabled, notifications)` | Save device-level settings |
| `ensureValidAccessToken(minValidityMs?, forceRefresh?)` | Refresh token proactively if expiry is near |

Access tokens auto-refresh every 60 seconds. The context falls back to offline mode silently if the server is unreachable.

#### LanguageContext ([frontend/hisab-app/context/LanguageContext.js](frontend/hisab-app/context/LanguageContext.js))

**State**: `language` (bn | en)

**Functions**:

| Function | Description |
|---|---|
| `setLanguage(lang)` | Switch language; persisted to filesystem |
| `t(key, vars?)` | Translate key with optional variable interpolation |
| `mapText(text)` | Translate legacy hardcoded Bengali strings |
| `fmtNumber(value, decimals?)` | Indian grouping + locale digits |
| `fmtCurrency(value, decimals?)` | Taka (৳) with locale digits |
| `fmtCurrencyShort(value)` | Shortened: "১২.৩ লক্ষ" for 1,230,000 |
| `fmtDate(date, style?)` | Locale-aware date formatting |
| `fmtRelativeDate(date)` | "২ দিন আগে" / "2 days ago" |
| `fmtDueStatus(dueDate)` | "Due in 3 days" / "Overdue 5 days" |
| `fmtPercent(ratio, decimals?)` | Percentage with locale digits |

#### AppDataContext ([frontend/hisab-app/context/AppDataContext.js](frontend/hisab-app/context/AppDataContext.js))

Populated by `MainDataShell`. Exposes ~80 memoized functions organized by domain. Screens always call these; they never touch the database directly.

---

### Local Database

[frontend/hisab-app/database/db.js](frontend/hisab-app/database/db.js) exports 100+ typed query functions over expo-sqlite. Grouped by entity:

**Initialization**: `createTables()` — sets up all tables on first launch.

**Auth and Session**: `saveAuthenticatedUserSession`, `getCurrentUser`, `updateAuthenticatedUserProfileLocal`, `logoutCurrentUser`, `getAuthDeviceProfile`, `setAuthDeviceProfile`, `getOrCreateDeviceId`, `updateSessionTokens`, `updateSessionServerStatus`

**Products**: `insertProduct`, `updateProduct`, `deleteProduct`, `getProducts`, `fetchProducts`, `getExpiringSoonProducts`, `getExpiredProducts`, `getLowStockProducts`, `getDeadStockProducts`, `getInventoryHealthInsights`

**Inventory Batches**: `createInventoryBatchTx`, `getInventoryBatches`, `selectBatchForSale`, `consumeInventoryBatchesTx`, `validateInventoryBatchConsistency`

**Stock Movements**: `createStockMovement`, `getStockMovements`, `getStockMovementCountInRange`, `getProductSalesDailyAggregation`, `getProductSalesSummaryAggregation`

**Inventory Alerts**: `refreshInventoryAlerts`, `getInventoryAlerts`, `upsertInventoryAlertTx`, `resolveInventoryAlertTx`

**Cycle Counts**: `recordCycleCount`, `getCycleCounts`, `fetchCycleCounts`

**Customers**: `insertCustomer`, `addCustomer`, `updateCustomer`, `deleteCustomer`, `getCustomers`, `fetchCustomers`, `fetchCustomersBasic`, `getCustomersWithDue`, `getCustomerRiskMetrics`, `getCustomerFeatureSourceRows`, `getCustomerTotalDue`

**Customer Ledger and Statement**: `getCustomerLedger`, `getCustomerStatement`, `buildCustomerStatementCsv`

**Baki**: `insertBakiEntry`, `addBaki`, `addPayment`, `getBakiHistory`, `fetchBakiWithCustomer`, `getBakiHistoryByCustomer`, `getBakiTransactions`, `getBakiKpiSummary`, `updateBakiStatus`, `deleteBaki`

**Collection Reminders**: `scheduleCollectionReminder`, `getCollectionReminders`

**Payment Promises**: `createPaymentPromise`, `getPaymentPromises`, `updatePaymentPromiseStatus`

**Collections Dashboard**: `getCollectionsDashboard`, `getCollectionsReminders`

**Sales**: `createSale`, `getSalesHistory`, `getRecentSoldProducts`, `getSaleReceipt`, `validateSalesMovementConsistency`

**Suppliers**: `addSupplier`, `listSuppliers`, `fetchSuppliers`, `updateSupplier`, `deleteSupplier`

**Purchase Orders**: `createPurchaseOrder`, `getPurchaseHistory`, `getOpenPurchaseOrders`, `getPurchaseOrderDetails`, `receivePurchaseItems`, `validatePurchaseMovementConsistency`

**Supplier Payables**: `recordSupplierPayment`, `getSupplierPayables`

**Expenses**: `createExpense`, `getExpenses`

**Cashbook**: `getCashbookEntries`, `getCashflowSummary`, `getBusinessDayFinanceSnapshotTx`

**Reporting**: `getDashboardKpiSummary`, `getDashboardTopActiveCustomers`, `getProfitReport`, `getProductMarginReport`

**Day Close**: `getDayCloseSnapshot`, `closeBusinessDay`, `getDayCloseReports`

**Backup and Restore**: `createLocalBackupSnapshot`, `restoreLocalBackupSnapshot`

**Sync and Audit**: `enqueuePendingSyncItem`, `getPendingSyncItems`, `markPendingSyncItemDone`, `markPendingSyncItemFailed`, `getLastSyncAt`, `setLastSyncAt`, `getAuditLogs`, `logAudit`

**Pilot and Analytics**: `addPilotShop`, `listPilotShops`, `trackAnalyticsEvent`, `listAnalyticsEvents`, `submitFeedback`, `listFeedback`, `getPilotMetricsOverview`

---

### Frontend Services

#### Backend API ([frontend/hisab-app/services/backend/](frontend/hisab-app/services/backend/))

| File | Exported Functions |
|---|---|
| `httpClient.js` | Core fetch wrapper with auth headers, 7-second timeout, structured error parsing |
| `authApi.js` | `loginOnline`, `signupOnline`, `verifyEmailCodeOnline`, `loginWithPinOnline`, `setupPinOnline`, `updatePinOnline`, `resetPinOnline`, `requestPinRecoveryOnline`, `refreshOnlineToken`, `logoutOnline`, `fetchOnlineProfile`, `updateOnlineProfile`, `isBackendOnline` |
| `syncApi.js` | `syncOnline(changes, userId)` — push batched changes to server |
| `creditApi.js` | `fetchCollectionsDashboardOnline`, `fetchCustomerStatementOnline`, `exportCustomerStatementCsvOnline`, `createCustomerReminderOnline`, `listCustomerRemindersOnline`, `createPaymentPromiseOnline`, `listPaymentPromisesOnline`, `updatePaymentPromiseStatusOnline` |
| `trustApi.js` | `fetchCustomerTrustScoresOnline` |
| `trustMonitoringApi.js` | `pushTrustMonitoringSnapshotOnline` |
| `reportingApi.js` | `fetchComplianceDashboardOnline`, `fetchActivityInsightExampleOnline` |
| `approvalApi.js` | `listApprovalRequestsOnline`, `approveApprovalRequestOnline`, `rejectApprovalRequestOnline` |
| `suggestionsApi.js` | Fetch reorder and stock suggestions from server ML |
| `pilotApi.js` | `trackAnalyticsEventOnline` |
| `bakiImageApi.js` | Upload baki photo to server |
| `commandExecutionApi.js` | Send parsed voice command to server for execution |
| `marketDataApi.js` | Fetch market reference prices |
| `backendHealth.js` | `fetchBackendHealth`, `getBackendBaseUrl` |

#### Sync Engine ([frontend/hisab-app/services/sync/](frontend/hisab-app/services/sync/))

| File | Role |
|---|---|
| `dataSync.js` | Main sync orchestrator: reads queue, batches by size/count, calls server, processes conflict tokens |
| `syncQueue.js` | Enqueue entity changes with entity type, operation (create/update/delete), and payload |
| `conflictResolver.js` | Resolve server conflict tokens per entity with configurable strategy |
| `deltaEncoder.js` | Delta-encode payloads for bandwidth efficiency |
| `networkMonitor.js` | Detect online/offline transitions; trigger sync on reconnect |
| `retryManager.js` | Exponential backoff for failed sync batches |
| `backgroundSync.js` | Register Expo background task; runs sync every 15 minutes |

#### Customer Intelligence ([frontend/hisab-app/services/customers/](frontend/hisab-app/services/customers/))

| File | Role |
|---|---|
| `customerIdentification.js` | Parse customer from voice text or search input |
| `customerLedgerUtils.js` | Running balance calculations, statement formatting |
| `customerSearchUtils.js` | Search, filter (due/no-due), and sort (recent/alphabetical) logic |
| `customerRiskEngine.js` | Client-side credit risk classification using local feature data |
| `trustChampionModel.js` | Client-side logistic regression (mirrors server champion) |
| `trustChallengerModel.js` | Client-side challenger model |
| `trustGating.js` | Route to champion or challenger based on rollout percentage |
| `trustExplainability.js` | Feature importance for displaying risk explanation to user |
| `trustFallbackPolicy.js` | Rule-based fallback when model scores are unavailable |
| `trustMonitoringEngine.js` | Collect and push guardrail metrics to server |
| `trustRolloutControl.js` | Read canary percentage; decide which model to use |

#### Feature Engineering ([frontend/hisab-app/services/features/](frontend/hisab-app/services/features/))

| File | Role |
|---|---|
| `featureCalculator.js` | Compute customer features from local DB data for risk model input |
| `featureDefinitions.js` | Schema of all feature names, types, and normalization parameters |
| `dataValidation.js` | Validate feature data quality before model inference |
| `schemaVersion.js` | Version tracking for feature schema — ensures model and features are compatible |

#### Reorder Engine ([frontend/hisab-app/services/reorder/](frontend/hisab-app/services/reorder/))

- Markov chain demand model: state transitions from historical daily sales
- Safety stock: 85% service level, configurable lead time (default 3 days)
- EOQ: Economic Order Quantity optimization given holding cost and order cost
- Output: suggested reorder quantity, reorder point, days-of-stock-remaining

#### Monitoring ([frontend/hisab-app/services/monitoring/](frontend/hisab-app/services/monitoring/))

| File | Role |
|---|---|
| `crashLogger.js` | Catch and log unhandled exceptions with stack trace and device context |
| `performanceTracker.js` | Track screen render times and DB query durations |

---

### Voice System

The voice system spans [frontend/hisab-app/services/voice/](frontend/hisab-app/services/voice/) and is the most architecturally distinct part of the app.

#### FSM States ([services/voice/voiceFSM.js](frontend/hisab-app/services/voice/voiceFSM.js))

| State | Description | Confidence Threshold |
|---|---|---|
| `IDLE` | Waiting for wake word or button press | — |
| `WAIT_INTENT` | Listening for transaction type | 0.80 |
| `WAIT_NAME` | Listening for customer name | 0.75 |
| `WAIT_AMOUNT` | Listening for amount | 0.85 |
| `WAIT_DATE` | Listening for date (optional) | 0.70 |
| `REVIEW` | Confirm parsed transaction with user | — |
| `CONFIRM` | Waiting for yes/no confirmation | 0.90 |
| `WAIT_PIN` | Listening for PIN (no display) | 1.00 |
| `EXECUTE` | Running the transaction | — |
| `ERROR` | Retry or fallback to touch | — |
| `DONE` | Transaction complete | — |

Intent tokens: `baki` (record credit), `joma` (record payment), `becha` (record sale), `kinbo` (record purchase), `balance` (query balance). Global control tokens work in any state: `next`, `back`, `cancel`, `repeat`.

#### ASR Layer ([services/voice/asr/](frontend/hisab-app/services/voice/asr/))

| File | Role |
|---|---|
| `index.js` | ASR orchestrator — selects on-device or cloud provider |
| `audioRecorder.js` | Capture audio with configurable sample rate and VAD |
| `decoder.js` | Decode Bengali speech to text |
| `onnxRunner.js` | Run lightweight Whisper-based ONNX model on-device |
| `melSpectrogram.js` | Extract mel spectrogram features from audio buffer |
| `vad.js` | Voice activity detection — trim silence from recording |
| `sttAdapter.js` | Adapter for cloud providers (AssemblyAI, Google, Azure) |
| `benchmark.js` | Measure on-device inference latency and accuracy |

#### Normalization ([services/voice/normalization/](frontend/hisab-app/services/voice/normalization/))

| File | Role |
|---|---|
| `index.js` | Post-processing pipeline entry point |
| `nameMatcher.js` | Phoneme-aware fuzzy matching of ASR output against customer name list |
| `numberParser.js` | Parse Bengali and English number words and digits to integers |
| `dateParser.js` | Parse Bengali and English date expressions to ISO dates |
| `confidenceScorer.js` | Compute per-field confidence from ASR probability and context |
| `confidenceHandler.js` | Decide whether to accept, re-prompt, or fall back to touch |
| `grammarConstrainedParser.js` | Constrain ASR output to known grammar before entity extraction |
| `testCorpus.bn.js` | Bengali test utterances for validation |

#### Voice Pack Management ([services/voice/voicePack/](frontend/hisab-app/services/voice/voicePack/))

| File | Role |
|---|---|
| `index.js` | Entry point for pack management |
| `packManager.js` | Download, install, and activate voice model packs |
| `versionManager.js` | Track installed versions; detect available updates |
| `checksumValidator.js` | SHA checksum verification of downloaded files |
| `downloader.js` | Download with resume support for large model files over slow connections |

#### Personalization and Pilot

| File | Role |
|---|---|
| `personalization/userVoicePersonalization.js` | Adapt recognition thresholds and name matching to user's historical patterns |
| `pilot/pilotConfig.js` | Feature flags for voice pilot features |
| `pilot/pilotRolloutManager.js` | Gradual rollout gating for new voice capabilities |

---

### Theme and Design Tokens

#### Colors ([frontend/hisab-app/theme/colors.js](frontend/hisab-app/theme/colors.js))

| Group | Values |
|---|---|
| Brand | Primary dark `#7B542F`, medium `#B6771D`, accent `#FF9D00`, light `#FFCF71` |
| Surfaces | White, soft `#F6E7CC`, muted, subtle, raised, info, success, warning, danger |
| Text | Primary, secondary, muted, success, warning, danger |
| Borders | Standard, soft, info, success, warning, danger, strong |
| Status | Success `#16a34a`, danger `#A53A49` |

#### Typography ([frontend/hisab-app/theme/typography.js](frontend/hisab-app/theme/typography.js))

All text uses [Anek Bangla](https://fonts.google.com/specimen/Anek+Bangla) loaded via `@expo-google-fonts/anek-bangla`. Five weights are loaded: 400Regular, 500Medium, 600SemiBold, 700Bold, 800ExtraBold.

| Scale | Size | Weight | Line Height |
|---|---|---|---|
| `h1` | 30px | 800ExtraBold | 40 |
| `h2` | 22px | 700Bold | 30 |
| `subheading` | 16px | 600SemiBold | 24 |
| `body` | 14px | 500Medium | 22 |
| `small` | 12px | 400Regular | 18 |
| `button` | 15px | 700Bold | — |

All styles include `includeFontPadding: false` for precise vertical metrics in Bengali script.

#### Spacing ([frontend/hisab-app/theme/spacing.js](frontend/hisab-app/theme/spacing.js))

`xs: 4`, `sm: 8`, `md: 12`, `lg: 16`, `xl: 24`, `xxl: 32`

---

### Localization

[frontend/hisab-app/locales/bn.js](frontend/hisab-app/locales/) and [frontend/hisab-app/locales/en.js](frontend/hisab-app/locales/) share an identical key structure. Translation categories:

- **auth**: login, signup, PIN, email verification, recovery, reset, setup flows; all error messages
- **dashboard**: title, KPI labels (total due, sales, payments), quick action labels, period selectors
- **navigation**: tab labels, drawer items
- **baki**: form labels, status values, filter labels, KPI labels
- **customers**: form fields, list labels, risk level labels, search placeholders
- **products**: form fields, alert types, batch labels
- **sales**: step labels, cart labels, payment method labels, receipt labels
- **reports**: section titles, metric labels, date range labels
- **voice**: FSM prompt strings per state, error messages, confirmation prompts
- **common**: error, retry, confirm, cancel, save, delete, loading, empty state messages

Runtime language switching persists to the filesystem and propagates through `LanguageContext` without app restart.

---

### RBAC

[frontend/hisab-app/security/roles/rbac.js](frontend/hisab-app/security/) defines four roles and nine permission actions:

| Role | Permissions |
|---|---|
| `OWNER` | All actions (`*`) |
| `CASHIER` | `PRODUCTS_VIEW`, `CUSTOMERS_VIEW`, `SALES_CREATE` |
| `STOCK_MANAGER` | `PRODUCTS_VIEW`, `CUSTOMERS_VIEW`, `STOCK_MANAGE`, `PURCHASE_MANAGE`, `AUDIT_VIEW`, `APPROVAL_REVIEW` |
| `ACCOUNTANT` | `PRODUCTS_VIEW`, `CUSTOMERS_VIEW`, `EXPENSES_MANAGE`, `REPORTS_VIEW`, `AUDIT_VIEW` |

`checkPermission(role, action)` is called by the drawer navigator to filter visible screens, and by `MainDataShell` to gate mutation functions before exposing them through `AppDataContext`.

---

### Utilities

#### Bilingual Text ([frontend/hisab-app/utils/bilingualText.js](frontend/hisab-app/utils/))

- `setRuntimeLanguage(lang)` / `getRuntimeLanguage()` — get/set active language
- `toLocalizedUiText(text, language)` — translate Bengali ↔ English
- `localizePersonName(value, language)` — transliterate names between scripts
- Character maps: BN→EN, EN→BN, Latin↔Bengali for transliteration

#### Numerals ([frontend/hisab-app/utils/numerals.js](frontend/hisab-app/utils/))

- `toBengaliDigits(str)` — convert ASCII digits to Bengali script
- `toAsciiDigits(str)` — convert Bengali digits to ASCII
- `formatNumber(value, language, decimals)` — Indian grouping with locale digits
- `formatCurrency(value, language, decimals)` — with ৳ symbol
- `formatCurrencyShort(value, language)` — "১.২ কোটি" for 12,000,000
- `formatDate(date, language, style)` — locale-aware
- `formatRelativeDate(date, language)` — "২ দিন আগে"
- `formatDueStatus(dueDate, language)` — "৩ দিনে পরিশোধ" / "Overdue 5 days"
- `formatPercent(ratio, language, decimals)` — percentage with locale digits

#### Banglish Search ([frontend/hisab-app/utils/banglishSearch.js](frontend/hisab-app/utils/))

Converts Banglish input (Bengali phonetics typed in Latin script) to Bengali Unicode before querying. Allows users to search for customers and products without switching keyboard.

#### Password Policy ([frontend/hisab-app/utils/passwordPolicy.js](frontend/hisab-app/utils/))

PIN validation (4–6 digits), password strength requirements for server accounts.

#### Custom Hooks ([frontend/hisab-app/hooks/](frontend/hisab-app/hooks/))

`useDebouncedValue(value, delay?)` — debounces a value with a configurable delay (default 300 ms). Used in all search inputs to avoid re-querying the database on every keystroke.

---

## Project Structure

```
hisab/
├── ARCHITECTURE.md
├── FEATURE_ROADMAP.md
├── PRODUCTION_AND_RESEARCH_PLAN.md
├── LICENSE
├── backend/
│   ├── server.js
│   ├── app.js
│   ├── ai/
│   ├── config/
│   ├── controllers/
│   │   └── v1/
│   ├── ensemble/
│   ├── export/
│   ├── jobs/
│   ├── middleware/
│   ├── models/
│   │   ├── baseline/
│   │   ├── ema/
│   │   ├── markov/
│   │   └── reorder/
│   ├── monitoring/
│   ├── routes/
│   │   └── v1/
│   ├── scripts/
│   ├── security/
│   ├── services/
│   │   ├── prediction/
│   │   ├── seasonal/
│   │   ├── trust/
│   │   └── v1/
│   ├── utils/
│   └── validation/
├── frontend/
│   └── hisab-app/
│       ├── App.js
│       ├── app.json
│       ├── package.json
│       ├── assets/
│       ├── components/
│       │   ├── app/
│       │   ├── baki/
│       │   ├── customers/
│       │   ├── navigation/
│       │   ├── products/
│       │   ├── ui/
│       │   └── voice/
│       ├── constants/
│       ├── context/
│       ├── database/
│       ├── hooks/
│       ├── locales/
│       ├── navigation/
│       ├── screens/
│       │   └── auth/
│       ├── security/
│       │   └── roles/
│       ├── services/
│       │   ├── analytics/
│       │   ├── backend/
│       │   ├── customers/
│       │   ├── features/
│       │   ├── monitoring/
│       │   ├── onboarding/
│       │   ├── reorder/
│       │   ├── sync/
│       │   └── voice/
│       │       ├── asr/
│       │       ├── config/
│       │       ├── normalization/
│       │       ├── personalization/
│       │       ├── pilot/
│       │       └── voicePack/
│       ├── theme/
│       └── utils/
├── benchmark/
├── docs/
├── research_paper/
└── scripts/
```

**[backend/services/trust/](backend/services/trust/)** — Champion/challenger risk scoring engine with canary deployment, 8 production guardrails, and automatic rollback.

**[backend/services/seasonal/](backend/services/seasonal/)** — Bangladeshi seasonal demand signals: Islamic holidays (Eid ul-Fitr dates 2024–2032), monsoon, harvest, and festival patterns.

**[frontend/hisab-app/services/voice/](frontend/hisab-app/services/voice/)** — Complete voice transaction layer: on-device ONNX ASR, 11-state FSM, Bengali normalization parsers, cloud fallback, and voice pack management.

**[frontend/hisab-app/services/sync/](frontend/hisab-app/services/sync/)** — Offline sync engine with batch encoding, conflict resolution, exponential backoff, and background task scheduling.

**[frontend/hisab-app/database/](frontend/hisab-app/database/)** — Local SQLite layer with 100+ typed query functions. The single source of truth for all client-side reads.

**[backend/models/](backend/models/)** — 45+ Mongoose schemas. Subdirectories `baseline/`, `ema/`, `markov/`, and `reorder/` store trained ML model coefficients and evaluation metadata.

**[research_paper/](research_paper/)** — Academic materials for three proposed contributions: Financial Semantic CRDTs for offline sync conflict resolution, ZK-Baki (zero-knowledge credit proofs for cross-shop trust bootstrapping using Bulletproofs), and HisabNS-Forecast (neuro-symbolic demand forecasting with Logic Tensor Networks and Bangladesh-specific causal constraints).

**[docs/](docs/)** — System architecture documentation and design specs.

**[benchmark/](benchmark/)** — Benchmarking utilities for ASR latency, sync throughput, and ML inference speed.

---

## Environment Variables

**Backend** (`.env` in `backend/`):

| Variable | Description |
|---|---|
| `PORT` | API server port (default: 5000) |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret for signing access tokens |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens |
| `CORS_ALLOWED_ORIGINS` | Comma-separated list of allowed origins |
| `EMAIL_HOST` | SMTP host for Nodemailer |
| `EMAIL_PORT` | SMTP port |
| `EMAIL_USER` | SMTP username |
| `EMAIL_PASS` | SMTP password |
| `UPLOAD_DIR` | Directory for baki image uploads (default: `uploads/baki-images`) |
| `TRUST_CANARY_PERCENT` | Percentage of traffic routed to challenger model (default: 5) |
| `NODE_ENV` | `development` or `production` |

**Frontend** (configured in `app.json` and Expo environment):

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | Backend API base URL |
| `EXPO_PUBLIC_ASSEMBLYAI_KEY` | AssemblyAI API key for cloud ASR |
| `EXPO_PUBLIC_TRUST_ROLLOUT_PERCENT` | Client-side canary rollout percentage |
