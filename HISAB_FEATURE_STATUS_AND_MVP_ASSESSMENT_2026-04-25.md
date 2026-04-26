# HISAB Feature Status and MVP Assessment

Date: 2026-04-25
Scope: Current workspace snapshot (`frontend/hisab-app` + `backend`)

## 1. Assessment Summary

HISAB currently appears to be **a functional MVP for offline-first small retail operations** (inventory, customers, baki/credit ledger, sales, purchases, cashbook/expenses, reporting, authentication, sync foundation).

It is **not yet the full original vision** because OCR-based khata digitization and real payment gateway integration are still missing, and some advanced AI/voice goals are partially implemented.

## 2. Evidence Sources Used

- Frontend app/navigation and feature wiring:
  - `frontend/hisab-app/App.js`
  - `frontend/hisab-app/database/db.js`
  - `frontend/hisab-app/screens/*`
  - `frontend/hisab-app/services/sync/dataSync.js`
  - `frontend/hisab-app/services/reorder/reorderSuggestionEngine.js`
  - `frontend/hisab-app/services/voice/asr/index.js`
- Backend API surface and modules:
  - `backend/app.js`
  - `backend/routes/v1/index.js`
  - `backend/routes/v1/*.js`
  - `backend/routes/sttRoutes.js`
  - `backend/controllers/v1/markovController.js`
  - `backend/controllers/v1/unifiedSyncController.js`
  - `backend/models/*`
- Supporting project docs:
  - `PROJECT_COMPLETE_AUDIT.md`
  - `PROJECT_COMPLETION_ROADMAP.md`

## 3. Feature Status Matrix

### Legend
- `Implemented`: Available and wired in the current app/backend
- `Partial`: Exists but not complete for production-grade or full original scope
- `Planned`: Not implemented yet in current codebase

| Feature Area | Status | Notes / Evidence |
|---|---|---|
| Offline-first local database (SQLite) | Implemented | Extensive schema and queries in `frontend/hisab-app/database/db.js` |
| Product management (CRUD + stock threshold basics) | Implemented | `ProductListScreen`, `ProductDetailsScreen`, DB functions |
| Customer management (CRUD + credit profile fields) | Implemented | `CustomerListScreen`, `CustomerCreditScreen`, DB + backend customer routes |
| Baki ledger (credit/payment/statement/reminders/promises) | Implemented | Screens + `backend/routes/v1/bakiRoutes.js` + related controllers |
| Sales workflow + history + receipt | Implemented | `SalesScreen`, `SalesHistoryScreen`, `ReceiptScreen`, sales tables/routes |
| Supplier + purchase order + goods receive + purchase history | Implemented | `SupplierScreen`, `PurchaseOrderScreen`, `GoodsReceiveScreen`, backend models/routes |
| Stock movement + batch + alerts + cycle count | Implemented | `StockMovementScreen`, `InventoryBatchViewScreen`, `AlertsScreen`, `CycleCountScreen` |
| Cashbook + expense + day close + profit report | Implemented | `CashbookScreen`, `ExpenseScreen`, `DayCloseScreen`, `ProfitReportScreen` |
| Dashboard + reports + audit history | Implemented | `DashboardScreen`, `ReportsScreen`, `AuditHistoryScreen`, backend reports/audit routes |
| Authentication (signup/login/refresh/recovery/PIN) | Implemented | Auth screens + `backend/routes/authRoutes.js` |
| Security hardening (helmet, rate limits, RBAC/permissions) | Implemented | `backend/app.js`, rate limit middleware, permission middleware, `security/rbac` |
| Team/branch/approval workflow | Implemented | `ApprovalRequestsScreen`, `routes/v1/approvalRequestsRoutes.js`, branch/team routes |
| Sync engine (offline queue + server sync endpoints) | Implemented (advanced) | `services/sync/dataSync.js`, `routes/v1/syncRoutes.js`, `unifiedSyncController.js` |
| Markov forecasting API and operations | Implemented | `routes/v1/markovRoutes.js`, `controllers/v1/markovController.js` |
| Reorder prediction in frontend | Implemented (hybrid) | Rule-based + Markov integration in `services/reorder/reorderSuggestionEngine.js` |
| Trust scoring and monitoring | Implemented | trust routes/controllers, frontend trust services |
| Voice assistant flow (wizard + STT integration + analytics) | Partial to Implemented | Multiple voice screens and ASR/STT services exist; production quality depends on provider/model and rollout controls |
| OCR khata digitization (camera-to-ledger pipeline) | Planned / Missing | No active OCR/camera ingestion pipeline found in runtime code |
| Real payment gateway integration (bKash/Nagad API rails) | Planned / Missing | Payment methods exist in UI/data, but no live gateway integration routes/services found |
| Automated test suite breadth (unit/integration/e2e) | Partial | Several scripts exist; backend `npm test` is placeholder |

## 4. What Can Be Implemented Next (Feasibility)

### A. Low Effort (1-2 sprints)

1. OCR MVP bootstrap (capture + manual entry assist)
- Add `expo-camera` capture screen and attach image to draft baki entry.
- Start with human-reviewed extraction placeholder before full model.

2. Test baseline hardening
- Add backend API smoke checks for v1 modules (products/customers/baki/sync).
- Add frontend critical-path regression scripts for auth, sales, baki, sync.

3. Security cleanup
- Replace/upgrade local password hashing strategy in SQLite path with a standard KDF approach.

### B. Medium Effort (2-4 sprints)

1. Full OCR pipeline v1
- Line detection + amount extraction + customer fuzzy match + mandatory review UI.

2. Payment gateway integration (bKash/Nagad)
- Server payment intent flow, callback handling, reconciliation, and ledger linkage.

3. Voice production st
abilization
- Model/provider tuning, confidence thresholds, fallback policy, noisy-environment QA.

### C. Higher Effort (4+ sprints)

1. Deeper MLOps automation
- Automated retraining schedules, drift-triggered rollout, full observability dashboards.

2. Multi-tenant enterprise controls
- Stronger branch-level policy, role templates, compliance exports.

3. Play Store production readiness
- Release pipeline, crash monitoring, privacy/legal docs, staged rollout governance.

## 5. MVP Check

## 5.1 MVP Criteria (for HISAB retail problem)

A practical MVP for this project should let a small shopkeeper reliably:
1. Authenticate and access data safely.
2. Manage products and stock locally offline.
3. Manage customers and baki ledger (credit + payment + due tracking).
4. Record sales/purchases and view basic reports.
5. Preserve data integrity (audit/scoping) and recover sync when online.

## 5.2 Current Result

- Criteria 1: Met
- Criteria 2: Met
- Criteria 3: Met
- Criteria 4: Met
- Criteria 5: Met

**Verdict: YES - the current system is an MVP** for offline-first retail accounting/operations.

## 5.3 Important Qualification

This MVP verdict is for the **core retail platform**, not the complete long-term AI vision.
The following remain outside MVP-complete scope:
- OCR khata digitization
- Live bKash/Nagad gateway integration
- Fully validated production-grade voice accuracy across noisy real-world conditions

## 6. Recommended Release Positioning

Use this positioning in report/presentation:

- "HISAB v1 is an operational MVP for offline-first retail management."
- "AI-augmented and financial-integration extensions (OCR, advanced voice, payment rails) are Phase-2 expansion tracks."

## 7. Suggested Immediate Milestone Plan

1. Lock MVP release candidate (core flows + sync + audit + auth).
2. Add high-priority regression suite for MVP flows.
3. Ship OCR v0 (capture + review-assisted entry), then OCR v1 model extraction.
4. Implement one payment rail first (bKash), then extend to Nagad.
