## Plan: HISAB Full Roadmap (Inventory/Baki First)

Build a production-minded 8-week delivery path that starts with local-first Inventory + Baki core (highest value + lowest dependency), then layers voice, prediction, sync, and hardening. Keep architecture aligned with the two master docs while preserving current Expo + SQLite + Express code patterns.

**Steps**
1. **Phase 0 — Baseline & Contracts (Week 1, blocks all later phases)**
   - Confirm and freeze core domain contracts for Product, Customer, Transaction, Sale, and SyncQueue.
   - Define API and local DB parity so local SQLite schema and backend route payloads stay isomorphic.
   - Decide migration/versioning approach for SQLite (schema version + idempotent table creation).
   - Output: signed-off data contract sheet and endpoint contract list.

2. **Phase 1 — Local Data Foundation (Week 1, depends on 1)**
   - Extend database layer from current products-only setup to full operational tables: customers, transactions, sales, inventory history, sync queue.
   - Keep DB constraints strict (non-empty names, non-negative numeric checks, FK consistency where possible).
   - Add repository-style query helpers for create/read/update/list flows; keep functions atomic and promise-based.
   - Output: fully working offline persistence for Inventory + Baki primitives.

3. **Phase 2 — Inventory MVP (Week 2, depends on 2)**
   - Implement product CRUD flow end-to-end: add/edit/delete/list/search-lite.
   - Wire form validation to DB constraints to prevent runtime insert/update failures.
   - Add low-stock indicator logic based on threshold in local data.
   - Output: stable inventory operations in app UI with persistent state.

4. **Phase 3 — Baki MVP (Week 2-3, parallel with late Phase 2 UI polish; depends on 2)**
   - Implement customers + transaction recording (credit/payment) and running balance computation.
   - Provide customer ledger timeline (date-sorted) and summary totals (daily/weekly/monthly baseline).
   - Ensure transaction writes are idempotent against duplicate submit events.
   - Output: usable digital khata workflow fully offline.

5. **Phase 4 — Backend Integration Skeleton (Week 3, parallel with 3 stabilization; depends on 1)**
   - Expand backend from health/stub to modular routes for products/customers/transactions/reports.
   - Keep backend contracts aligned to local schema; include validation middleware + uniform error shape.
   - Add environment config template and basic request logging.
   - Output: testable API surface ready for sync attachment.

6. **Phase 5 — Offline Sync Engine (Week 4, depends on 3 and 5)**
   - Implement queue-based sync using local pending operations table.
   - Add deterministic replay ordering and retry strategy with backoff.
   - Define MVP conflict policy (last-write-wins + timestamp/audit trail) and expose minimal user status.
   - Output: offline-first with controlled eventual consistency.

7. **Phase 6 — Voice Foundation (Week 5-6, depends on 3)**
   - Implement Bangla command pipeline: capture -> transcribe -> intent parse -> entity extract -> confirmation.
   - Start with deterministic parser + fallback manual correction; keep ML adapter boundary clean.
   - Gate writes behind confirmation for low-confidence commands.
   - Output: practical voice-assisted Inventory/Baki entry.

8. **Phase 7 — Prediction Foundation (Week 6, depends on 3 and baseline sales data)**
   - Build Markov-chain-ready aggregation pipeline from weekly sales states.
   - Generate recommendation outputs (buy more/hold/buy less) with confidence metadata.
   - Keep prediction explainability visible in UI (state transitions, not black-box).
   - Output: initial forecasting utility with measurable baseline.

9. **Phase 8 — Reports, Trust Score, and UX Hardening (Week 7, depends on 4, 6, 7)**
   - Add daily/weekly report surfaces and trust score v1 based on payment behavior.
   - Enforce Bangla-first copy consistency, error microcopy, and low-literacy interaction simplification.
   - Run targeted performance optimization for startup, list rendering, and query latency.
   - Output: cohesive operational dashboard for shop use.

10. **Phase 9 — QA, Acceptance, and Release Prep (Week 8, depends on all prior phases)**
   - Run test matrix: unit + integration + offline/sync reliability + voice accuracy + device performance.
   - Validate acceptance criteria from solution docs (voice accuracy, zero data-loss sync, prediction baseline).
   - Freeze release candidate, document known issues, and prepare demo + pilot checklist.
   - Output: v1.0 candidate with traceable quality evidence.

11. **Cross-cutting governance (runs parallel across all phases)**
   - Weekly branch hygiene: feature branches -> develop -> tagged milestone releases.
   - Keep requirement traceability updates (FR/NFR to implementation + test IDs).
   - Maintain architectural discipline: repository/adapter/strategy/facade boundaries as modules mature.

**Relevant files**
- `d:/Hisab/.github/instructions/instructions.md` — canonical execution rules and scope boundaries
- `d:/Hisab/SOFTWARE_SOLUTION_DOCUMENT.md` — product scope, NFRs, acceptance criteria
- `d:/Hisab/HISAB_Project_Workflow.md` — detailed architecture, sprint model, QA framework
- `d:/Hisab/frontend/hisab-app/database/db.js` — current SQLite entry point (starting base)
- `d:/Hisab/frontend/hisab-app/app/` — current Expo Router UI shell to extend for Inventory/Baki flows
- `d:/Hisab/backend/index.js` — backend entry to modularize into route-based API

**Verification**
1. Foundation checks (Week 1)
   - Validate schema creation is idempotent by running createTables repeatedly without errors.
   - Run TypeScript and lint checks in frontend and backend before merging.
2. Functional checks (Weeks 2-4)
   - Execute end-to-end local flows: add product -> list product, add baki -> payment -> balance update.
   - Simulate offline/online transitions and verify queued operations flush deterministically.
3. Voice/prediction checks (Weeks 5-7)
   - Measure command recognition accuracy for curated Bangla command sets.
   - Validate Markov outputs against known sample histories and edge states.
4. Release checks (Week 8)
   - Perform manual regression on low-end Android targets.
   - Verify acceptance criteria thresholds and archive evidence artifacts.

**Decisions**
- Chosen horizon: full 8-week roadmap.
- Chosen priority: Inventory + Baki core first.
- Keep core operations local-first; backend and sync evolve without blocking MVP utility.
- Voice/prediction are phased after transaction data model stabilizes.

**Further Considerations**
1. Sync conflict policy extension after MVP: Option A keep last-write-wins, Option B add per-field merge for inventory quantity.
2. Voice stack choice: Option A Vosk/offline-first, Option B hybrid local+remote fallback depending on device constraints.
3. Payment integration placement: keep out of core MVP until offline reliability and ledger integrity are proven.