# Hisab — Architecture Reference

> **Audience:** Every developer who touches this repo.  
> **Rule:** If you add a file and it doesn't fit an existing directory's stated purpose, stop and discuss before creating new top-level directories.

---

## 1. Repository Layout (Monorepo)

```
Hisab/
├── backend/                  Node.js / Express API server
├── frontend/hisab-app/       React Native / Expo mobile app
├── docs/                     Architecture lock & academic reports
├── scripts/                  Repo-level utility scripts
├── .gitignore
└── ARCHITECTURE.md           ← you are here
```

---

## 2. Frontend — `frontend/hisab-app/`

### 2.1 Directory Tree

```
frontend/hisab-app/
│
├── App.js                    Root: font loading, global patches, provider tree, RootNavigator
│
├── navigation/               All React Navigation structure
│   ├── navigators.js         Navigator instances (Drawer, RootStack, AuthStack, MainStack)
│   ├── AuthNavigator.js      Auth flow stack (Login → Signup → PIN → Verify → Recovery)
│   ├── DrawerNavigator.js    Main sidebar + RBAC route-guard map (35+ screens)
│   └── MainNavigator.js      Main stack (Sidebar + modal screens: Receipt, SetupPin, UpdatePassword)
│
├── components/               Reusable UI — NOT navigable pages
│   ├── app/
│   │   ├── BootLoading.js    Full-screen loading indicator
│   │   └── MainDataShell.js  App data orchestrator: SQLite hydration, trust scoring,
│   │                         sync loop, 50+ callbacks → AppDataContext.Provider
│   ├── auth/
│   │   └── AuthScene.js      Neumorphic auth card wrapper
│   ├── baki/                 Baki (credit) widgets
│   │   ├── BakiEntryForm.js
│   │   ├── BakiFilters.js
│   │   ├── BakiKpiDashboard.js
│   │   ├── BakiListItem.js
│   │   ├── BakiSummaryCards.js
│   │   ├── CustomerPhotoCapture.js
│   │   ├── PaymentCodeModal.js
│   │   ├── PaymentEntryForm.js
│   │   └── PhotoPreviewBadge.js
│   ├── customers/            Customer list & form widgets
│   │   ├── CustomerChipSelector.js
│   │   ├── CustomerForm.js
│   │   ├── CustomerLedgerTimeline.js
│   │   ├── CustomerListItem.js
│   │   ├── CustomerQuickAddModal.js
│   │   ├── CustomerRiskBadge.js
│   │   └── CustomerSearchControls.js
│   ├── navigation/
│   │   └── CustomDrawerContent.js
│   ├── products/             Product list & form widgets
│   │   ├── ProductExpiryAlerts.js
│   │   ├── ProductForm.js
│   │   ├── ProductListItem.js
│   │   ├── ProductLowStockAlerts.js
│   │   ├── ProductReorderSuggestions.js
│   │   └── ProductSummaryCards.js
│   ├── ui/                   Base design-system primitives
│   │   ├── AppButton.js
│   │   ├── AppCard.js
│   │   ├── AppInput.js
│   │   └── index.js
│   └── voice/                Voice UX widgets
│       ├── ConfidenceIndicator.js
│       ├── CorrectionPanel.js
│       ├── HeardTokenDisplay.js
│       ├── ReviewScreen.js
│       └── VoiceStepScreen.js
│
├── screens/                  Full-page navigable screens (one per drawer/stack route)
│   ├── auth/                 Authentication screens
│   │   ├── LoginScreen.js
│   │   ├── PinLoginScreen.js
│   │   ├── SignupScreen.js
│   │   ├── VerifyEmailScreen.js
│   │   ├── AccountRecoveryScreen.js
│   │   ├── ResetPasswordScreen.js
│   │   ├── SetupPinScreen.js
│   │   └── UpdatePasswordScreen.js
│   ├── AlertsScreen.js
│   ├── ApprovalRequestsScreen.js
│   ├── AuditHistoryScreen.js
│   ├── BackupRestoreScreen.js
│   ├── BakiListScreen.js
│   ├── CashbookScreen.js
│   ├── CollectionsDashboardScreen.js
│   ├── CustomerCreditScreen.js
│   ├── CustomerLedgerScreen.js
│   ├── CustomerListScreen.js
│   ├── CustomerStatementScreen.js
│   ├── CycleCountScreen.js
│   ├── DashboardScreen.js
│   ├── DayCloseScreen.js
│   ├── ExpenseScreen.js
│   ├── FeedbackScreen.js
│   ├── GoodsReceiveScreen.js
│   ├── HelpCenterScreen.js
│   ├── InventoryBatchViewScreen.js
│   ├── OfflineQueueMonitor.js
│   ├── OnboardingScreen.js
│   ├── ProductDetailsScreen.js
│   ├── ProductListScreen.js
│   ├── ProfileScreen.js
│   ├── ProfitReportScreen.js
│   ├── PurchaseHistoryScreen.js
│   ├── PurchaseOrderScreen.js
│   ├── ReceiptScreen.js
│   ├── ReportsScreen.js
│   ├── SalesHistoryScreen.js
│   ├── SalesScreen.js
│   ├── StockMovementScreen.js
│   ├── StockSuggestionsScreen.js
│   ├── SupplierScreen.js
│   ├── SyncConflictScreen.js
│   ├── VoiceAssistantScreen.js
│   └── VoicePackDownloadScreen.js
│
├── context/                  React Context providers (global state)
│   ├── AppDataContext.js     Context shape definition (all data + callbacks)
│   ├── AuthContext.js        Auth state: session, user, isOnline, PIN flow
│   └── LanguageContext.js    i18n: language, setLanguage, t(), mapText()
│
├── database/                 Local SQLite layer (offline-first)
│   ├── db.js                 100+ typed query functions
│   └── seedData.js           Development demo data
│
├── services/                 Business logic & external integrations
│   ├── backend/              HTTP API clients (one file per domain)
│   │   ├── httpClient.js     Base fetch wrapper
│   │   ├── backendHealth.js  Base URL resolution
│   │   ├── authApi.js
│   │   ├── bakiImageApi.js
│   │   ├── creditApi.js
│   │   ├── trustApi.js
│   │   ├── trustMonitoringApi.js
│   │   └── …
│   ├── customers/            Customer intelligence & trust scoring
│   │   ├── customerRiskEngine.js
│   │   ├── trustRolloutControl.js
│   │   ├── trustMonitoringEngine.js
│   │   └── …
│   ├── features/             ML feature engineering
│   ├── monitoring/           Client-side crash & performance logging
│   ├── onboarding/           Contextual tips
│   ├── reorder/              Reorder-point prediction engine
│   ├── sync/                 Offline-first sync (conflict resolution, retry)
│   └── voice/                Voice pipeline (ASR → NLU → FSM → execution)
│
├── theme/                    Design system tokens
│   ├── colors.js             Full color palette (sidebar, brand, semantic)
│   ├── spacing.js            Spacing scale
│   └── typography.js         Text style presets (h1–button)
│
├── constants/
│   └── ui-theme.js           UI_COLORS shorthand (maps to theme/colors entries)
│
├── locales/                  i18n string tables
│   ├── bn.js                 Bengali (default)
│   └── en.js                 English
│
├── hooks/
│   └── use-debounced-value.js
│
├── utils/
│   ├── banglishSearch.js
│   ├── bilingualText.js      getRuntimeLanguage / toLocalizedUiText
│   └── passwordPolicy.js
│
├── security/
│   └── rbac.js               ACTIONS enum, checkPermission, canonicalizeRole
│
└── assets/images/
```

### 2.2 Data Flow

```
SQLite (db.js)
    │  read/write
    ▼
MainDataShell.js  ──────────────────────► AppDataContext.Provider
    │  (hydration + callbacks)                   │
    │                                            │ useAppData()
    ▼                                            ▼
Trust Scoring Engine                        Screen Components
  customerRiskEngine                        (DashboardScreen,
  trustRolloutControl                        BakiListScreen, …)
  trustMonitoringEngine                          │
    │                                            │ useAuth() / useLanguage()
    ▼                                            ▼
Backend API (services/backend/)          AuthContext / LanguageContext
  httpClient → Express /api/v1
```

### 2.3 Strict Placement Rules

| What | Where | Never in |
|---|---|---|
| Navigable page (has a drawer/stack route) | `screens/` | `components/` |
| Reusable widget / form / list item | `components/<domain>/` | `screens/` |
| Navigator structure | `navigation/` | `App.js` |
| Global state | `context/` | screen files |
| DB query function | `database/db.js` | screens or components |
| HTTP call | `services/backend/<domain>Api.js` | screens or context |
| Business logic / ML | `services/<domain>/` | screens or components |
| Design tokens | `theme/` | inline in StyleSheet |
| String literals | `locales/bn.js` + `locales/en.js` | hardcoded in JSX |

---

## 3. Backend — `backend/`

### 3.1 Directory Tree

```
backend/
├── server.js               Entry point — starts HTTP server
├── app.js                  Express app: middleware stack + route assembly
│
├── routes/
│   ├── authRoutes.js       POST /api/v1/auth/*
│   ├── sttRoutes.js        POST /api/v1/stt/*
│   ├── ussdRoutes.js       POST /api/v1/ussd/*
│   ├── webhookRoutes.js    POST /api/v1/webhooks/*
│   └── v1/
│       ├── index.js        Aggregates all v1 domain routers
│       ├── bakiRoutes.js
│       ├── customersRoutes.js
│       ├── productsRoutes.js
│       └── … (20+ domain route files)
│
├── controllers/
│   ├── authController.js
│   ├── sttController.js
│   ├── ussdController.js
│   └── v1/                 One controller per domain
│       ├── bakiController.js
│       ├── customersController.js
│       ├── productsController.js
│       └── … (25+ files)
│
├── services/               Business logic (no HTTP, no DB schema)
│   ├── v1/
│   │   ├── auditService.js
│   │   ├── changeLogService.js
│   │   ├── idempotencyService.js
│   │   └── httpError.js
│   ├── trust/
│   │   ├── customerRiskEngine.js
│   │   └── trustObjectiveEvaluator.js
│   ├── prediction/
│   ├── seasonal/
│   └── … (20+ service files)
│
├── models/                 MongoDB / Mongoose schemas ONLY
│   ├── User.js
│   ├── Customer.js
│   ├── BakiEntry.js
│   ├── Product.js
│   └── … (35+ schema files)
│
├── models/baseline/        ⚠ ML computation — should migrate to ml/baseline/
├── models/ema/             ⚠ ML computation — should migrate to ml/ema/
├── models/markov/          ⚠ ML computation — should migrate to ml/markov/
├── models/reorder/         ⚠ ML computation — should migrate to ml/reorder/
│
├── middleware/             Express middleware (runs before controllers)
│   ├── authMiddleware.js
│   ├── rbacMiddleware.js
│   ├── rateLimitMiddleware.js
│   ├── validateRequest.js
│   └── …
│
├── config/                 App-wide configuration objects
│   ├── db.js               MongoDB connection
│   ├── strategy.js
│   ├── trustObjective.js
│   └── …
│
├── ai/                     AI inference layer (confidence, explanations, suggestions)
├── ensemble/               Ensemble model combination & weight adjustment
├── evaluation/             Offline model evaluation metrics
├── features/               Server-side feature engineering
├── monitoring/             Drift detection, alerting, performance tracking
├── security/               Fraud rules, RBAC definitions
├── stt/                    Speech-to-text provider integration
├── sync/                   Conflict resolution, retry management
├── reports/                PDF/CSV report generators
├── export/                 File export utilities
├── analytics/              Event tracking & metrics calculation
├── validation/             Zod input schemas
├── utils/                  Shared utilities (apiResponse, normalization)
│
├── scripts/                CLI maintenance scripts (training, seeding, trust promotion)
├── jobs/                   Scheduled jobs (recalibration, lifecycle)
└── artifacts/              ← git-ignored: generated trust model artifacts & logs
```

### 3.2 Request Lifecycle

```
HTTP Request
    │
    ▼
app.js middleware stack
  requestContext → securityHeaders → CORS → rateLimiter
  → bodyParser → authMiddleware → rbacMiddleware → validateRequest
    │
    ▼
routes/v1/<domain>Routes.js
    │
    ▼
controllers/v1/<domain>Controller.js
  (parse params, call service, return response)
    │
    ▼
services/<domain>/        (business logic, no Mongoose here)
    │         │
    ▼         ▼
models/       ai/ / ensemble/ / features/
(Mongoose)    (ML inference)
```

### 3.3 Strict Placement Rules

| What | Where | Never in |
|---|---|---|
| Route definition | `routes/v1/<domain>Routes.js` | controllers |
| Request handling | `controllers/v1/<domain>Controller.js` | routes or services |
| Business logic | `services/<domain>/` | controllers |
| MongoDB schema | `models/<Entity>.js` | services or controllers |
| ML computation | `models/baseline\|ema\|markov\|reorder/` (→ target: `ml/`) | models/ root |
| Auth/RBAC check | `middleware/` | controllers |
| Input validation | `validation/<domain>Schemas.js` | controllers |
| API response shape | `utils/apiResponse.js` | inline in controllers |

---

## 4. Known Technical Debt

| # | Issue | File(s) | Priority |
|---|---|---|---|
| TD-1 | ML computation engines inside `models/` | `models/baseline/`, `models/ema/`, `models/markov/`, `models/reorder/` | Medium |
| TD-2 | Duplicate feature builder | `ai/featureBuilder.js` vs `features/featureBuilder.js` | Medium |
| TD-3 | Duplicate fallback handler | `ensemble/fallbackHandler.js` vs `features/fallbackHandler.js` | Medium |
| TD-4 | Duplicate queue adjustment | `config/queueAdjustment.js` vs `models/markov/queueAdjustment.js` | Low |
| TD-5 | Dual color systems in frontend | `constants/ui-theme.js` (UI_COLORS) + `theme/colors.js` (COLORS) | Low |
| TD-6 | `auth/stt/ussd/webhook` routes not versioned under `v1/` | `routes/*.js` root level | Low |

---

## 5. Adding New Features — Decision Tree

```
Need to add something new?

Is it a full page the user navigates to?
  YES → screens/<domain>Screen.js
         Register in navigation/DrawerNavigator.js or navigation/MainNavigator.js
         Add RBAC guard in DrawerNavigator ROUTE_REQUIRED_ACTIONS if role-restricted

Is it a reusable widget used by ≥1 screen?
  YES → components/<domain>/<ComponentName>.js

Is it a new API endpoint?
  YES → routes/v1/<domain>Routes.js  (new file if domain is new)
         controllers/v1/<domain>Controller.js
         services/<domain>/<logic>.js
         models/<Entity>.js  (if new Mongoose schema needed)

Is it a new client-side ML model or trust feature?
  YES → services/customers/  (trust) or services/features/ (feature engineering)
         Add corresponding server-side logic to backend/services/trust/

Is it a new translated string?
  YES → locales/bn.js AND locales/en.js (always both, Bengali-first)
```
